#!/usr/bin/env node
/**
 * Wedding Update #3 — the final-details note.
 *
 *   npm run email:final-details                      render previews, send nothing
 *   npm run email:final-details -- --dry-run         who would receive it
 *   npm run email:final-details -- --send --to me@…  one test to yourself
 *
 * ── Nothing sends by default, and a full send is never one flag ────────────
 * Inherited wholesale from send-update.mjs, because the reasoning has not
 * changed: an email that has gone out cannot be recalled. `--send` alone is
 * refused; it needs exactly one scope, and the widest costs the most
 * keystrokes.
 *
 * ── This campaign writes NOTHING to the database ───────────────────────────
 * Not email_status, not last_email_sent, not one field on one row. There is no
 * update() call in this file. The confirmation pack's delivery columns belong
 * to the confirmation pack; a third campaign reusing them would corrupt the
 * only record of who received the first.
 *
 * Re-running is therefore safe in exactly one way and unsafe in another:
 *  · safe  — no state is touched, so nothing can be corrupted
 *  · unsafe — nothing records that a guest was already emailed, so a second
 *             --send would deliver a second copy. The Resend idempotency key
 *             below is what actually prevents that.
 *
 * ── Who gets it ────────────────────────────────────────────────────────────
 * Approved, attending, invited to the reception, plus-one decided, reachable.
 * See final-details-recipients.mjs, where the rule and its reasoning live. The
 * seating chart is NOT consulted: it decides where someone sits, never whether
 * they are emailed.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

import {
  TABLE, subjectFinal, RATE, DEFAULT_FROM, DEFAULT_REPLY_TO,
  WEDDING, CAMERA, assetUrls,
} from './config.mjs';
import { selectForFinalDetails, tierBreakdown } from './final-details-recipients.mjs';
import { renderFinalDetails } from './final-details.mjs';
import { daysUntil } from './events.mjs';
import { sendWithRetry, sleep, SendError } from './resend.mjs';

/** Bump if this campaign is ever legitimately re-sent to the same people. */
const CAMPAIGN = 'final-details-2026-09';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

const HELP = `
Wedding Update #3 — final details

  (no flags)           Render previews to scratch/. Sends nothing. Default.
  --dry-run            Show recipients and exclusions. Sends nothing.
  --to <address>       Send one copy to a single address, for checking.
  --limit <n>          Send to the first n recipients (a pilot).
  --confirm-send-all   Required to send to everyone. Never implied.
  --send               Deliver. Must be paired with --to, --limit or
                       --confirm-send-all; alone it is refused.
  --camera-ready       Force the Instant Camera section on. It is already on
                       by default (CAMERA.enabled in config.mjs); this only
                       matters for previewing when that has been switched off.
  --preview-tier <T>   JOINING | RECEPTION | AFTERPARTY — which guest the
                       preview is rendered for. Default: JOINING and RECEPTION.
  --yes                Skip the typed confirmation.
  -h, --help           This message

Writes nothing to the database, and never reads seating data.
`;

function parseArgs(argv) {
  const args = {
    send: false, yes: false, dryRun: false, all: false,
    to: null, limit: null, cameraReady: false, previewTier: null, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--send': args.send = true; break;
      case '--send-test': args.send = true; break;      // alias; still needs --to
      case '--dry-run': args.dryRun = true; break;
      case '--confirm-send-all': args.all = true; break;
      case '--camera-ready': args.cameraReady = true; break;
      case '--yes': case '-y': args.yes = true; break;
      case '--help': case '-h': args.help = true; break;
      case '--to': args.to = argv[++i]; break;
      case '--preview-tier': args.previewTier = String(argv[++i] ?? '').toUpperCase(); break;
      case '--limit': args.limit = Number(argv[++i]); break;
      default: if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
    }
  }
  if (args.send && args.dryRun) throw new Error('--dry-run and --send contradict each other. Pick one.');
  if (args.send) {
    const scopes = [args.to && '--to', args.limit && '--limit', args.all && '--confirm-send-all'].filter(Boolean);
    if (scopes.length === 0) {
      throw new Error(
        '--send needs a scope. One of:\n' +
        '  --to <address>       a single test\n' +
        '  --limit <n>          a pilot\n' +
        '  --confirm-send-all   everyone\n\n' +
        'A full send is never one flag.');
    }
    if (scopes.length > 1) throw new Error(`Pick one scope, not ${scopes.join(' and ')}.`);
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit needs a positive whole number.');
  }
  return args;
}

/* ── Fetching the guest list ─────────────────────────────────────────────── */

async function fetchRows() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to read the guest list.\n' +
      'Run with --env-file=.env, or use the no-flag preview which needs neither.');
  }
  const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/${TABLE}?select=*`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Could not read ${TABLE}: ${res.status} ${await res.text()}`);
  return res.json();
}

/* ── Previews ────────────────────────────────────────────────────────────── */

const PREVIEW_GUESTS = {
  JOINING:    { full_name: 'Adaeze Okonkwo', approved_for: 'JOINING' },
  RECEPTION:  { full_name: 'Chidi Eze',      approved_for: 'RECEPTION' },
  AFTERPARTY: { full_name: 'Tobi Balogun',   approved_for: 'AFTERPARTY' },
};

function writePreviews({ cameraReady, tier }) {
  const outDir = join(process.cwd(), 'scratch', 'final-details-preview');
  mkdirSync(outDir, { recursive: true });

  const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
  const assets = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });
  const tiers = tier ? [tier] : ['JOINING', 'RECEPTION'];
  const written = [];

  for (const t of tiers) {
    const base = PREVIEW_GUESTS[t];
    if (!base) throw new Error(`Unknown --preview-tier: ${t}`);
    const row = {
      ...base, email: 'preview@example.com', main_invite_status: 'APPROVED',
      attending: true, plus_one_requested: false,
    };
    const r = renderFinalDetails(row, { siteUrl, assets, cameraReady });
    const suffix = cameraReady ? '-camera' : '';
    const htmlPath = join(outDir, `${t.toLowerCase()}${suffix}.html`);
    const textPath = join(outDir, `${t.toLowerCase()}${suffix}.txt`);
    writeFileSync(htmlPath, r.html);
    writeFileSync(textPath, r.text);
    written.push({ tier: t, htmlPath, textPath, r });
  }
  return { outDir, written };
}

/* ── Report ──────────────────────────────────────────────────────────────── */

function report({ recipients, excluded, duplicates }) {
  console.log(`\n${c.bold('Recipients')}  ${c.green(String(recipients.length))}`);
  for (const [tier, n] of tierBreakdown(recipients)) {
    console.log(`  ${String(n).padStart(4)}  ${tier}`);
  }

  const byBucket = new Map();
  for (const e of excluded) {
    if (!byBucket.has(e.bucket)) byBucket.set(e.bucket, []);
    byBucket.get(e.bucket).push(e);
  }
  console.log(`\n${c.bold('Excluded')}  ${c.amber(String(excluded.length))}`);
  for (const [bucket, list] of [...byBucket].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(list.length).padStart(4)}  ${bucket}`);
    for (const e of list.slice(0, 3)) {
      console.log(`        ${c.dim(`${e.row.full_name ?? '(no name)'} — ${e.reason}`)}`);
    }
    if (list.length > 3) console.log(`        ${c.dim(`… and ${list.length - 3} more`)}`);
  }

  if (duplicates.length) {
    console.log(`\n${c.bold('Duplicate addresses')}  ${c.amber(String(duplicates.length))}`);
    for (const d of duplicates) {
      console.log(`  ${c.dim(`${d.row.full_name} shares ${d.row.email} with ${d.firstSeen.full_name}`)}`);
    }
  }
}

/* ── Sending ─────────────────────────────────────────────────────────────── */

async function confirm(phrase) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`\nType ${c.bold(phrase)} to continue: `);
  rl.close();
  return typed.trim() === phrase;
}

async function deliver(targets, { cameraReady, siteUrl, assets }) {
  let sent = 0;
  const failed = [];

  for (const [i, row] of targets.entries()) {
    const r = renderFinalDetails(row, { siteUrl, assets, cameraReady });
    try {
      await sendWithRetry({
        from: process.env.INVITE_FROM || DEFAULT_FROM,
        replyTo: process.env.INVITE_REPLY_TO || DEFAULT_REPLY_TO,
        to: row.email,
        subject: subjectFinal(daysUntil(WEDDING.date, new Date())),
        html: r.html,
        text: r.text,
        idempotencyKey: `${CAMPAIGN}:${String(row.email).trim().toLowerCase()}`,
      });
      sent++;
      console.log(`  ${c.green('✓')} ${row.email}`);
    } catch (e) {
      failed.push({ row, error: e });
      console.log(`  ${c.red('✗')} ${row.email} — ${e instanceof SendError ? e.message : String(e)}`);
    }
    if (i < targets.length - 1) await sleep(RATE.delayMs ?? 600);
  }
  return { sent, failed };
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const now = new Date();
  const days = daysUntil(WEDDING.date, now);

  console.log(`\n${c.bold('Wedding Update #3 — Final Details')}`);
  console.log(`  ${c.dim(`${days} days to the wedding · subject: ${subjectFinal(days)}`)}`);
  console.log(`  ${c.dim(`Instant Camera section: ${(args.cameraReady || CAMERA.enabled) ? 'included' : c.amber('OMITTED')}`)}`);

  // Previews always. They cost nothing and they are the artefact worth having.
  const { outDir, written } = writePreviews({ cameraReady: args.cameraReady, tier: args.previewTier });
  console.log(`\n${c.bold('Previews')}  ${c.dim(outDir)}`);
  for (const w of written) {
    console.log(`  ${w.tier.padEnd(11)} ${c.cyan(w.htmlPath)}`);
    console.log(`  ${''.padEnd(11)} ${c.dim(`camera: ${w.r.camera ? 'shown' : 'absent'} · ${w.r.html.length} bytes`)}`);
  }

  if (!args.send && !args.dryRun) {
    console.log(`\n${c.dim('Nothing was sent. Add --dry-run to see the audience, or --send --to <address> for a test.')}`);
    return;
  }

  const rows = await fetchRows();
  const selection = selectForFinalDetails(rows);
  report(selection);

  if (!args.send) {
    console.log(`\n${c.dim('Dry run. Nothing was sent.')}`);
    return;
  }

  const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
  const assets = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });

  // --to is a test to an address that need not be a guest. Nothing is read
  // from or written to the guest list for it.
  if (args.to) {
    const row = {
      full_name: 'Preview Guest', email: args.to,
      main_invite_status: 'APPROVED', attending: true,
      approved_for: args.previewTier || 'JOINING', plus_one_requested: false,
    };
    console.log(`\n${c.bold('One test message')} to ${c.cyan(args.to)}`);
    if (!args.yes && !(await confirm('SEND TEST'))) {
      console.log(c.dim('Not confirmed. Nothing sent.'));
      return;
    }
    const { sent, failed } = await deliver([row], { cameraReady: args.cameraReady, siteUrl, assets });
    console.log(sent ? c.green('\nResend accepted the test message.')
                     : c.red('\nResend did not accept it.'));
    if (failed.length) process.exitCode = 1;
    return;
  }

  const targets = args.limit ? selection.recipients.slice(0, args.limit) : selection.recipients;
  const phrase = args.all ? `SEND TO ALL ${targets.length}` : `SEND ${targets.length}`;
  if (!args.yes && !(await confirm(phrase))) {
    console.log(c.dim('Not confirmed. Nothing sent.'));
    return;
  }
  const { sent, failed } = await deliver(targets, { cameraReady: args.cameraReady, siteUrl, assets });
  console.log(`\n${c.bold('Done')}  ${c.green(`${sent} sent`)}${failed.length ? c.red(`, ${failed.length} failed`) : ''}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n${c.red('✗')} ${e.message}`);
  process.exitCode = 1;
});
