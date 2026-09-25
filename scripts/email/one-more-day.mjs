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
 * ── Nothing is derived ─────────────────────────────────────────────────────
 * An earlier draft looked each address up in the RSVP table for a name and a
 * tier. The couple have since supplied both by hand, and confirmed all six as
 * ceremony guests, so the lookup is gone rather than left in to be
 * second-guessed by data that disagreed.
 *
 * That makes this file the whole truth about the send: the addresses, the
 * names in the greeting and the tier are all right here, and there is no
 * database read anywhere in it. What you see below is what goes out.
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
  RATE, DEFAULT_FROM, DEFAULT_REPLY_TO,
  WEDDING, CAMERA, assetUrls,
} from './config.mjs';
import { eventsForGuest, parseTiers } from './events.mjs';
import { renderFinalDetails } from './final-details.mjs';
import { isSendableEmail } from './recipients.mjs';
import { validateDress } from './dress-code.mjs';
import { sendWithRetry, sleep, SendError } from './resend.mjs';

/**
 * The six. Address, greeting and tier, all supplied by the couple.
 *
 * `name` is used verbatim as the greeting — "Dear Andikan," — and is not a
 * full name, a lookup key, or anything the letter parses. It is what these
 * people are called.
 *
 * `tier` is confirmed by the couple, not inferred. All six are ceremony
 * guests, so all six receive the Wedding Service sections and the note about
 * phones. Nothing here consults approved_for.
 *
 * Changing who receives this means editing this list, which is a commit and a
 * review rather than a command-line argument typed at speed.
 */
export const RECIPIENTS = Object.freeze([
  Object.freeze({ email: 'umohandikanbassey@gmail.com', name: 'Andikan',   tier: 'JOINING' }),
  Object.freeze({ email: 'victorinyang2@gmail.com',     name: 'Victor',    tier: 'JOINING' }),
  Object.freeze({ email: 'gracestevev@gmail.com',       name: 'Gracemary', tier: 'JOINING' }),
  Object.freeze({ email: 'clairebensonidoko@gmail.com', name: 'Claire',    tier: 'JOINING' }),
  Object.freeze({ email: 'fabiangabriel807@gmail.com',  name: 'Fabian',    tier: 'JOINING' }),
  Object.freeze({ email: 'Olamie23@gmail.com',          name: 'Ola',       tier: 'JOINING' }),
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

/* ── The letter each one gets ────────────────────────────────────────────── */

/**
 * Turns the frozen list into what the renderer wants.
 *
 * Pure, and it takes nothing but the list — there is no second argument for a
 * database to arrive through, which is the point. `full_name` carries the
 * supplied first name because that is what firstName() reads, and these are
 * already first names, so it comes back out exactly as written.
 */
export function prepare(recipients = RECIPIENTS) {
  return recipients.map((r) => {
    const row = { full_name: r.name, email: r.email, approved_for: r.tier };
    const events = eventsForGuest(row);
    return {
      email: r.email,
      name: r.name,
      tier: r.tier,
      row,
      events,
      // From the supplied tier, which for all six is JOINING. Still computed
      // rather than assumed, so a future edit to one entry is honoured.
      joining: parseTiers(r.tier).includes('JOINING'),
      sendable: isSendableEmail(r.email),
    };
  });
}

/** What each one is shown — their supplied tier, expanded the usual way. */
const eventsFor = (v) => v.events;

/* ── Report ──────────────────────────────────────────────────────────────── */

function report(verdicts) {
  const subject = SUBJECT;

  console.log(`\n${c.bold('═══ ONE-OFF SEND — "1 DAY TO GO" — AUDIT ═══')}`);
  console.log(`  ${c.dim(`campaign: ${CAMPAIGN}`)}`);
  console.log(`  ${c.dim('audience, names and tiers: supplied by hand. No database is read.')}`);
  console.log(`  ${c.dim('read-only: nothing written, nothing sent')}`);

  console.log(`\n${c.bold('Subject')}`);
  console.log(`  ${c.cyan(subject)}`);

  console.log(`\n${c.bold('Countdown wording')}`);
  console.log(`  masthead : ${c.cyan(HEADLINE)}`);
  console.log(`  opening  : ${c.cyan(`It’s ${DAYS === 1 ? '1 day' : `${DAYS} days`} to our wedding…`)}`);

  console.log(`\n${c.bold('The six')}`);
  console.log(`      ${c.dim('email'.padEnd(34))}${c.dim('greeting'.padEnd(14))}${c.dim('tier')}`);
  for (const [i, v] of verdicts.entries()) {
    const n = String(i + 1).padStart(2);
    const tier = v.joining ? c.cyan('JOINING') : c.amber('reception-only');
    console.log(`  ${n}. ${c.green('✓')} ${v.email.padEnd(34)}${`Dear ${v.name},`.padEnd(14)}${tier}`);
    console.log(`      ${c.dim(`→ ${v.events.map(e => e.name).join(' + ')}`)}`);
    if (!v.sendable) console.log(`      ${c.red('✗ that address is not sendable')}`);
  }

  const joining = verdicts.filter(v => v.joining);

  console.log(`\n${c.bold('Counts')}`);
  const line = (l, n, col = (s2) => s2) =>
    console.log(`  ${l.padEnd(46, '.')} ${col(String(n).padStart(4))}`);
  line('TOTAL RECIPIENTS', verdicts.length, c.bold);
  line('JOINING — ceremony + phones section', joining.length, c.cyan);
  line('reception-only — no ceremony section', verdicts.length - joining.length,
       verdicts.length - joining.length ? c.amber : c.green);
  line('derived from RSVP data', 0, c.green);

  return { subject, joining };
}

/* ── Previews ────────────────────────────────────────────────────────────── */

function writePreviews(verdicts, { siteUrl, assets }) {
  const dir = join(process.cwd(), 'scratch', 'one-more-day-preview');
  mkdirSync(dir, { recursive: true });
  const written = [];

  for (const v of verdicts) {
    const r = renderFinalDetails(v.row, {
      siteUrl, assets, days: DAYS, headline: HEADLINE, events: eventsFor(v),
    });
    const safe = v.email.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const path = join(dir, `${safe}.html`);
    writeFileSync(path, r.html);
    written.push({
      email: v.email, name: v.name, path,
      ceremony: r.ceremony, days: r.days,
      // Read back out of the rendered letter, not assumed from the input.
      greeting: r.html.match(/Dear ([^,<]+),/)?.[1] ?? '(none)',
      /*
       * The ceremony-only content, by what it actually says.
       *
       * Checked for "Wedding Service" first, which failed for all six — and
       * the letter was right. "Wedding Service" is the internal name of the
       * JOINING tier in config.mjs; it is not a phrase this letter uses. What
       * a ceremony guest actually gets, and a reception-only guest does not,
       * is the note about phones: "We're having a no-personal-photography
       * ceremony." That block is the thing to look for.
       */
      phonesNote: /no-personal-photography/.test(r.html)
               && /A Little Note About Phones|note about phones/i.test(r.html),
    });
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
    const r = renderFinalDetails(v.row, {
      siteUrl, assets, days: DAYS, headline: HEADLINE, events: eventsFor(v),
    });
    try {
      const id = await sendWithRetry({
        apiKey: key,
        from: process.env.INVITE_FROM || DEFAULT_FROM,
        replyTo: process.env.INVITE_REPLY_TO || DEFAULT_REPLY_TO,
        // Straight off the frozen list.
        to: v.email,
        subject,
        html: r.html,
        text: r.text,
        idempotencyKey: `${CAMPAIGN}:${norm(v.email)}`,
      });
      accepted.push({ address: v.email, name: v.name, id });
      console.log(`  ${c.green('✓')} ${v.email.padEnd(34)} ${c.dim(id)}`);
    } catch (e) {
      failed.push({ address: v.email, error: e });
      console.log(`  ${c.red('✗')} ${v.email.padEnd(34)} ` +
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

  const verdicts = prepare();
  const { subject } = report(verdicts);

  const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
  const assets = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });

  const { dir, written } = writePreviews(verdicts, { siteUrl, assets });
  console.log(`\n${c.bold('Previews')}  ${c.dim(dir)}`);
  for (const w of written) {
    console.log(`  ${w.email.padEnd(34)} ${c.dim(
      `greets “Dear ${w.greeting},” · ` +
      `${w.ceremony ? 'ceremony section' : c.red('NO CEREMONY')} · ` +
      `${w.phonesNote ? 'phones note' : c.red('NO PHONES NOTE')} · ${w.days} day`)}`);
  }

  /* ── The checks that must hold before anything goes ─────────────────── */
  const problems = [];
  if (verdicts.length !== 6) problems.push(`${verdicts.length} recipients, expected 6`);
  if (new Set(verdicts.map(v => norm(v.email))).size !== 6) {
    problems.push('the list contains a duplicate address');
  }
  if (!/^1 Day to Go!/.test(subject)) problems.push(`the subject is wrong: ${subject}`);
  if (verdicts.some(v => !v.joining)) problems.push('not every recipient is JOINING');

  // Read back out of the rendered HTML, not asserted from the input. The
  // question is what these six will actually open, and the only honest way to
  // answer it is to look at the letter.
  for (const w of written) {
    if (w.days !== 1) problems.push(`${w.email} says ${w.days} days`);
    if (!w.ceremony) problems.push(`${w.email} has no ceremony section`);
    if (!w.phonesNote) problems.push(`${w.email} is missing the ceremony note about phones`);
    const wanted = verdicts.find(v => v.email === w.email)?.name;
    if (w.greeting !== wanted) {
      problems.push(`${w.email} is greeted "${w.greeting}", expected "${wanted}"`);
    }
  }
  if (problems.length) {
    throw new Error('The send failed its own checks, so nothing was sent:\n  · ' +
                    problems.join('\n  · '));
  }
  console.log(`\n  ${c.green('✓')} checks passed: six addresses, one day, all six get the`);
  console.log(`    ${c.green(' ')} ceremony sections, and each is greeted by the supplied name`);

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
  for (const r of RECIPIENTS) console.log(`  ${c.dim(`to:      ${r.email.padEnd(34)} (Dear ${r.name},)`)}`);

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
