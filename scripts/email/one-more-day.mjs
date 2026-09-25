#!/usr/bin/env node
/**
 * "1 Day to Go" — a one-off to six named guests.
 *
 *   npm run email:one-more-day              audit, and render previews
 *   npm run email:one-more-day -- --send    deliver, after typing the phrase
 *
 * ── What this is ───────────────────────────────────────────────────────────
 * The final-details letter went to 140 guests on the 24th saying two days to
 * go. Six people were missed. It is now the 25th, so their copy has to say
 * one day, and it has to go now rather than at noon.
 *
 * Everything a guest sees is the existing letter — the same renderFinalDetails,
 * the same sections, the same doodles, the same dress code, the same links.
 * Only the number changes, and only for these six.
 *
 * ── Why this is a separate file and not a flag ─────────────────────────────
 * The obvious thing would be `--only a@b.com,c@d.com` on the main sender.
 * That would put a list of addresses one typo away from a run that can also
 * reach 140 people, on the day the 140 are already being delivered. A
 * separate file with the addresses written INTO it cannot expand: there is no
 * code path here that reads the rsvps table for an audience, no --limit, no
 * --confirm-send-all, and RECIPIENTS is a frozen constant.
 *
 * The RSVP table is read for exactly two things, and only for these six
 * addresses: a name to greet them by, and whether they are approved for
 * JOINING. It is never used to decide WHO gets this.
 *
 * ── Its own idempotency namespace ──────────────────────────────────────────
 * CAMPAIGN below is not the one the 24th used. Resend remembers a key for 24
 * hours, so reusing that namespace would either collide with the scheduled
 * send's keys or suppress this letter for anyone who already has one. A
 * distinct namespace means this send can be re-run safely and cannot touch
 * the other campaign's records, receipts or message ids.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

import {
  TABLE, RATE, DEFAULT_FROM, DEFAULT_REPLY_TO,
  WEDDING, CAMERA, assetUrls,
} from './config.mjs';
import { eventsForGuest, parseTiers } from './events.mjs';
import { renderFinalDetails } from './final-details.mjs';
import { isSendableEmail } from './recipients.mjs';
import { validateDress } from './dress-code.mjs';
import { sendWithRetry, sleep, SendError } from './resend.mjs';

/**
 * The six. Written down, not derived.
 *
 * Changing who receives this means editing this list, which is a commit and
 * a review rather than a command-line argument typed at speed.
 */
export const RECIPIENTS = Object.freeze([
  'umohandikanbassey@gmail.com',
  'victorinyang2@gmail.com',
  'gracestevev@gmail.com',
  'clairebensonidoko@gmail.com',
  'fabiangabriel807@gmail.com',
  'Olamie23@gmail.com',
]);

/** One day. Not read from the clock — see DAYS_TO_GO in config.mjs. */
export const DAYS = 1;

/**
 * The subject, written out rather than formatted.
 *
 * subjectFinal(1) produces "Tomorrow's the Day!" — a deliberate choice in
 * that function, and not the line this send was asked for. The requested
 * wording is exact, so it is stated exactly here instead of being derived
 * from a formatter that has its own opinion.
 */
export const SUBJECT = '1 Day to Go! \u{1F48D} \u00b7 Final Details for Our Wedding'
  .replace('\\u{1F48D}', '\u{1F48D}');

/** The masthead, kept in step with the subject for the same reason. */
export const HEADLINE = '1 Day to Go';

/**
 * A namespace of its own, deliberately unlike `final-details-2026-09`.
 * See the header: this must not collide with the 24th's keys in either
 * direction.
 */
export const CAMPAIGN = 'one-more-day-2026-09-25';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

const norm = (e) => String(e ?? '').trim().toLowerCase();

/* ── Classification ──────────────────────────────────────────────────────── */

/**
 * Matches the six against the RSVP table, by address alone.
 *
 * Address, not name: these were given as addresses, and an address is an
 * exact key. The name matcher exists for the seating plan, where the only
 * thing on offer is a name written by somebody else — that ambiguity is not
 * present here and importing it would only create it.
 *
 * Returns one entry per address, always, in the order given. An address with
 * no row is REPORTED, never guessed at.
 */
export function classify(addresses, rows) {
  const byEmail = new Map();
  for (const row of rows) {
    const k = norm(row.email);
    if (!k) continue;
    // Two rows on one inbox is a household. Keep both so it can be reported
    // rather than silently resolved.
    if (!byEmail.has(k)) byEmail.set(k, []);
    byEmail.get(k).push(row);
  }

  return addresses.map((address) => {
    const matches = byEmail.get(norm(address)) ?? [];

    if (matches.length === 0) {
      return { address, matched: false, ambiguous: false, row: null,
               reason: 'no RSVP row with this address' };
    }
    if (matches.length > 1) {
      return { address, matched: false, ambiguous: true, rows: matches, row: null,
               reason: `${matches.length} RSVP rows share this address` };
    }

    const row = matches[0];
    const tiers = parseTiers(row.approved_for);
    const events = eventsForGuest(row);
    const joining = tiers.includes('JOINING');

    return {
      address, matched: true, ambiguous: false, row,
      name: row.full_name ?? null,
      tiers,
      events,
      joining,
      // The letter is about a reception seat. A tier that does not include
      // the reception is worth seeing before this goes.
      reception: events.some(e => e.key === 'RECEPTION'),
      sendable: isSendableEmail(row.email),
    };
  });
}

/** What a matched guest is shown. Identical rule to the main campaign. */
const eventsFor = (v) => (v.matched ? v.events : null);

/* ── Report ──────────────────────────────────────────────────────────────── */

function report(verdicts) {
  const subject = SUBJECT;

  console.log(`\n${c.bold('═══ ONE-OFF SEND — "1 DAY TO GO" — AUDIT ═══')}`);
  console.log(`  ${c.dim(`campaign: ${CAMPAIGN}`)}`);
  console.log(`  ${c.dim('audience: a frozen list of six. Nothing here reads an audience from data.')}`);
  console.log(`  ${c.dim('read-only: nothing written, nothing sent')}`);

  console.log(`\n${c.bold('Subject')}`);
  console.log(`  ${c.cyan(subject)}`);

  console.log(`\n${c.bold('Countdown wording')}`);
  console.log(`  masthead : ${c.cyan(HEADLINE)}`);
  console.log(`  opening  : ${c.cyan(`It’s ${DAYS === 1 ? '1 day' : `${DAYS} days`} to our wedding…`)}`);

  console.log(`\n${c.bold('The six')}`);
  for (const [i, v] of verdicts.entries()) {
    const n = String(i + 1).padStart(2);
    if (!v.matched) {
      console.log(`  ${n}. ${c.amber('?')} ${v.address.padEnd(34)} ${c.amber('UNMATCHED')}`);
      console.log(`      ${c.dim(v.reason)}`);
      if (v.rows) {
        for (const r of v.rows) {
          console.log(`      ${c.dim(`· ${r.full_name} — ${r.approved_for ?? '(no tier)'}`)}`);
        }
      }
      continue;
    }
    const tier = v.joining ? c.cyan('JOINING') : c.green('reception-only');
    console.log(`  ${n}. ${c.green('✓')} ${v.address.padEnd(34)} ${String(v.name ?? '(no name)').padEnd(28)} ${tier}`);
    console.log(`      ${c.dim(`approved_for: ${v.row.approved_for ?? '(none)'} → ${v.events.map(e => e.name).join(' + ') || '(no events)'}`)}`);
    if (!v.reception) {
      console.log(`      ${c.amber('⚠ this tier does not include the Reception — the letter is about a reception seat')}`);
    }
    if (!v.sendable) {
      console.log(`      ${c.red('✗ the address on their RSVP row is not sendable')}`);
    }
  }

  const matched = verdicts.filter(v => v.matched);
  const joining = matched.filter(v => v.joining);

  console.log(`\n${c.bold('Counts')}`);
  const line = (l, n, col = (s) => s) =>
    console.log(`  ${l.padEnd(46, '.')} ${col(String(n).padStart(4))}`);
  line('addresses on the list', RECIPIENTS.length, c.bold);
  line('matched to an RSVP row', matched.length, c.green);
  line('UNMATCHED — flagged for you', verdicts.length - matched.length,
       verdicts.length - matched.length ? c.amber : c.green);
  line('JOINING — ceremony + phones section', joining.length, c.cyan);
  line('reception-only — no ceremony section', matched.length - joining.length, c.cyan);
  line('TOTAL RECIPIENTS IF SENT', RECIPIENTS.length, c.bold);

  console.log(`\n  ${c.dim('An unmatched address still receives the letter, in its reception-only')}`);
  console.log(`  ${c.dim('form — the safe direction: it never shows the ceremony to somebody')}`);
  console.log(`  ${c.dim('who was not invited to it. Remove them from RECIPIENTS if that is wrong.')}`);

  return { subject, matched, joining };
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to look up these six.\n' +
      'Run with --env-file=.env.');
  }
  return { url: url.replace(/\/+$/, ''), key };
}

async function fetchRows() {
  const { url, key } = creds();
  const res = await fetch(`${url}/rest/v1/${TABLE}?select=*`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Could not read ${TABLE}: ${res.status} ${await res.text()}`);
  return res.json();
}

/* ── Previews ────────────────────────────────────────────────────────────── */

function writePreviews(verdicts, { siteUrl, assets }) {
  const dir = join(process.cwd(), 'scratch', 'one-more-day-preview');
  mkdirSync(dir, { recursive: true });
  const written = [];

  for (const v of verdicts) {
    const row = v.matched ? v.row : { full_name: null, email: v.address };
    const r = renderFinalDetails(row, {
      siteUrl, assets, days: DAYS, headline: HEADLINE, events: eventsFor(v),
    });
    const safe = v.address.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const path = join(dir, `${safe}.html`);
    writeFileSync(path, r.html);
    written.push({ address: v.address, path, ceremony: r.ceremony, days: r.days });
  }
  return { dir, written };
}

/* ── Sending ─────────────────────────────────────────────────────────────── */

async function confirm(phrase) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`\nType ${c.bold(phrase)} to continue: `);
  rl.close();
  return typed.trim() === phrase;
}

async function deliver(verdicts, { siteUrl, assets, key }) {
  const subject = SUBJECT;
  const accepted = [];
  const failed = [];

  for (const [i, v] of verdicts.entries()) {
    const row = v.matched ? v.row : { full_name: null, email: v.address };
    const r = renderFinalDetails(row, {
      siteUrl, assets, days: DAYS, headline: HEADLINE, events: eventsFor(v),
    });
    try {
      const id = await sendWithRetry({
        apiKey: key,
        from: process.env.INVITE_FROM || DEFAULT_FROM,
        replyTo: process.env.INVITE_REPLY_TO || DEFAULT_REPLY_TO,
        // The address from the LIST, not from the matched row. The list is
        // the audience; the row only supplies a name and a tier.
        to: v.address,
        subject,
        html: r.html,
        text: r.text,
        idempotencyKey: `${CAMPAIGN}:${norm(v.address)}`,
      });
      accepted.push({ address: v.address, id });
      console.log(`  ${c.green('✓')} ${v.address.padEnd(34)} ${c.dim(id)}`);
    } catch (e) {
      failed.push({ address: v.address, error: e });
      console.log(`  ${c.red('✗')} ${v.address.padEnd(34)} ` +
                  `${e instanceof SendError ? e.message : String(e)}`);
    }
    if (i < verdicts.length - 1) await sleep(RATE.delayMs ?? 600);
  }
  return { accepted, failed };
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes('--send');
  if (args.some(a => a.startsWith('--') && !['--send'].includes(a))) {
    throw new Error('The only option here is --send. There is deliberately no ' +
                    '--limit, no --to and no way to change the audience.');
  }

  const dressProblems = validateDress();
  if (dressProblems.length) {
    throw new Error('The dress code is not valid:\n  · ' + dressProblems.join('\n  · '));
  }

  console.log(`\n${c.bold('One more day — a one-off to six guests')}`);
  console.log(`  ${c.dim(`${WEDDING.dateLong} · camera section: ${CAMERA.enabled ? 'included' : 'omitted'}`)}`);

  const rows = await fetchRows();
  const verdicts = classify(RECIPIENTS, rows);
  const { subject } = report(verdicts);

  const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
  const assets = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });

  const { dir, written } = writePreviews(verdicts, { siteUrl, assets });
  console.log(`\n${c.bold('Previews')}  ${c.dim(dir)}`);
  for (const w of written) {
    console.log(`  ${w.address.padEnd(34)} ${c.dim(`${w.ceremony ? 'ceremony section' : 'no ceremony'} · ${w.days} day`)}`);
  }

  /* ── The checks that must hold before anything goes ─────────────────── */
  const problems = [];
  if (verdicts.length !== RECIPIENTS.length) problems.push('the audience changed size');
  if (new Set(verdicts.map(v => norm(v.address))).size !== RECIPIENTS.length) {
    problems.push('the list contains a duplicate address');
  }
  if (!/^1 Day to Go!/.test(subject)) problems.push(`the subject is wrong: ${subject}`);
  for (const w of written) if (w.days !== 1) problems.push(`${w.address} says ${w.days} days`);
  for (const v of verdicts) {
    if (!v.matched) continue;
    const r = renderFinalDetails(v.row, {
      siteUrl, assets, days: DAYS, headline: HEADLINE, events: eventsFor(v) });
    if (r.ceremony !== v.joining) {
      problems.push(`${v.address}: ceremony section ${r.ceremony} but JOINING ${v.joining}`);
    }
  }
  if (problems.length) {
    throw new Error('The send failed its own checks, so nothing was sent:\n  · ' +
                    problems.join('\n  · '));
  }
  console.log(`\n  ${c.green('✓')} checks passed: six addresses, one day, ceremony only where JOINING`);

  if (!send) {
    console.log(`\n${c.dim('Audit only. Nothing was sent. Add --send when you are ready.')}\n`);
    return;
  }

  const apiKey = String(process.env.RESEND_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not set, so nothing can be sent.');

  console.log(`\n${c.red(c.bold('  ──────────────────────────────────────────────'))}`);
  console.log(`${c.red(c.bold(`   THIS SENDS TO ${RECIPIENTS.length} REAL GUESTS, NOW.`))}`);
  console.log(`${c.red(c.bold('  ──────────────────────────────────────────────'))}`);
  console.log(`  ${c.dim(`subject: ${subject}`)}`);
  console.log(`  ${c.dim(`from:    ${process.env.INVITE_FROM || DEFAULT_FROM}`)}`);
  for (const a of RECIPIENTS) console.log(`  ${c.dim(`to:      ${a}`)}`);

  if (!(await confirm(`SEND ONE MORE DAY TO ${RECIPIENTS.length} GUESTS`))) {
    console.log(c.dim('Not confirmed. Nothing sent.'));
    return;
  }

  const { accepted, failed } = await deliver(verdicts, { siteUrl, assets, key: apiKey });

  console.log(`\n${c.bold('Done')}  ${c.green(`${accepted.length} accepted by Resend`)}` +
              `${failed.length ? c.red(`, ${failed.length} failed`) : ''}`);

  // Its own receipt file. The 24th's receipt is not read, not written, not
  // touched.
  const out = join(process.cwd(), 'scratch', 'one-more-day-sent.json');
  writeFileSync(out, `${JSON.stringify({
    campaign: CAMPAIGN, sentAt: new Date().toISOString(),
    subject, days: DAYS, count: accepted.length,
    messages: accepted,
    failed: failed.map(f => ({ address: f.address, error: String(f.error?.message ?? f.error) })),
  }, null, 2)}\n`);
  console.log(`  ${c.dim(`receipt: ${out}`)}\n`);

  if (failed.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\n${c.red('✗')} ${e.message}`);
    process.exitCode = 1;
  });
}
