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
 * ── Who gets it: the UNION rule ────────────────────────────────────────────
 * Two lists, and everyone on either of them:
 *
 *   A   approved, attending, invited to the reception, plus-one decided,
 *       reachable. The original rule, unchanged, in final-details-recipients.mjs.
 *   B   guests who hold a seat in the PUBLISHED plan, can be matched to an
 *       RSVP row confidently, are reachable, and whom rule A misses.
 *
 * Nobody is removed from A for failing to match a seat — a name the matcher
 * cannot resolve is a matching failure, and the guest should not pay for it.
 * On a shared inbox A wins, so no existing recipient's letter changes.
 *
 * ── The one thing a seat can never do ──────────────────────────────────────
 * Grant the ceremony. A seat is evidence of a reception place and of nothing
 * else; the JOINING tier in approved_for is the only thing that puts the
 * service and the phones note in the letter. See unionAudience.
 *
 * ── What this file now reads, and what it still will not touch ─────────────
 * It GETs the published seating layout. That is the whole of its involvement
 * with seating: there is no write verb here, the draft layout is never read,
 * and the planner is never called.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

import {
  TABLE, subjectFinal, RATE, DEFAULT_FROM, DEFAULT_REPLY_TO,
  WEDDING, CAMERA, assetUrls, ASSET_FILES,
} from './config.mjs';
import { selectForFinalDetails, tierBreakdown } from './final-details-recipients.mjs';
import {
  unionAudience, eventsForRecipient, fetchUnionInputs, printUnionReport,
} from './union-audience.mjs';
import { validateDress } from './dress-code.mjs';
import { renderFinalDetails } from './final-details.mjs';
import { daysUntil, eventsForGuest } from './events.mjs';
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
  --audit, --dry-run   Show recipients and every exclusion. Sends nothing.
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
  --yes                Skip the typed confirmation for a pilot. It does NOT
                       skip it for --confirm-send-all.
  -h, --help           This message

Writes nothing to the database. Reads the PUBLISHED seating layout, and only
reads it — see the union rule at the top of this file.
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
      case '--dry-run': case '--audit': args.dryRun = true; break;
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

/**
 * Both inputs to the union rule, read through the audit's own loader.
 *
 * Deliberately not a second fetch written here: the audit and the send must
 * be built from the same data by the same code, or the number you approved
 * and the number that goes out can differ without anything looking wrong.
 */
async function fetchInputs() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to read the guest list.\n' +
      'Run with --env-file=.env, or use the no-flag preview which needs neither.');
  }
  return fetchUnionInputs();
}

/* ── Previews ────────────────────────────────────────────────────────────── */

const PREVIEW_GUESTS = {
  JOINING:    { full_name: 'Adaeze Okonkwo', approved_for: 'JOINING' },
  RECEPTION:  { full_name: 'Chidi Eze',      approved_for: 'RECEPTION' },
  AFTERPARTY: { full_name: 'Tobi Balogun',   approved_for: 'AFTERPARTY' },
};

/**
 * The artwork, inlined from public/email/ as data URIs.
 *
 * A browser opening a file:// preview cannot reach the deployed https URLs,
 * so without this the doodle backdrop and the screenshot are simply missing
 * and the preview looks flat and wrong. Gmail strips data: URIs, which is why
 * this is for previews ONLY — the email that is actually sent always uses the
 * https URLs from assetUrls(). Same approach as preview.mjs.
 */
function inlinedAssets() {
  const out = {};
  for (const [key, file] of Object.entries(ASSET_FILES)) {
    const path = join(process.cwd(), 'public', 'email', file);
    if (!existsSync(path)) continue;
    const buf = readFileSync(path);
    const mime = buf[0] === 0x89 ? 'image/png' : buf[0] === 0xff ? 'image/jpeg' : null;
    if (mime) out[key] = `data:${mime};base64,${buf.toString('base64')}`;
  }
  return out;
}

function writePreviews({ cameraReady, tier }) {
  const outDir = join(process.cwd(), 'scratch', 'final-details-preview');
  mkdirSync(outDir, { recursive: true });

  const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
  const assets = { ...assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL }),
                   ...inlinedAssets() };
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

const BUCKET_LABEL = {
  'not-approved':       'not approved / invitation still pending',
  'no-rsvp':            "has not RSVP'd — no seat to confirm",
  'not-attending':      "RSVP'd no — not attending",
  'no-tier':            'approved but no usable tier',
  'no-reception':       'Reception not among their approved events',
  'plus-one-undecided': 'plus-one status unresolved',
  'no-email':           'missing or unusable email address',
};

function report({ recipients, excluded, duplicates }, rows) {
  const byBucket = new Map();
  for (const e of excluded) {
    if (!byBucket.has(e.bucket)) byBucket.set(e.bucket, []);
    byBucket.get(e.bucket).push(e);
  }
  const n = (b) => (byBucket.get(b) ?? []).length;

  const joining = recipients.filter(r => eventsForGuest(r).some(e => e.key === 'JOINING'));
  const receptionOnly = recipients.filter(r => {
    const ev = eventsForGuest(r).map(e => e.key);
    return ev.includes('RECEPTION') && !ev.includes('JOINING');
  });

  console.log(`\n${c.bold('═══ RULE A IN DETAIL ═══')}`);
  console.log(`  ${c.dim(`source: the ${TABLE} table alone. This is SET A, not the final audience —`)}`);
  console.log(`  ${c.dim('some of the exclusions below are added back by a seat. See the union audit.')}`);
  console.log(`\n  rows read from ${TABLE} ............ ${String(rows.length).padStart(5)}`);
  console.log(`  ${c.bold('QUALIFY UNDER RULE A')} ............ ${c.green(String(recipients.length).padStart(5))}`);
  console.log(`      of which JOINING (ceremony) ... ${String(joining.length).padStart(5)}   ${c.dim('← see the phones note')}`);
  console.log(`      of which RECEPTION-only ....... ${String(receptionOnly.length).padStart(5)}   ${c.dim('← do not')}`);
  console.log(`  duplicate addresses removed ....... ${String(duplicates.length).padStart(5)}`);
  console.log(`  ${c.bold('EXCLUDED')} ....................... ${c.amber(String(excluded.length).padStart(5))}`);
  for (const [bucket, label] of Object.entries(BUCKET_LABEL)) {
    console.log(`      ${label.padEnd(42, '.')} ${String(n(bucket)).padStart(5)}`);
  }
  const accounted = recipients.length + duplicates.length + excluded.length;
  console.log(`  ${accounted === rows.length ? c.green('✓') : c.red('✗')} every row accounted for: ` +
              `${recipients.length} + ${duplicates.length} + ${excluded.length} = ${accounted} of ${rows.length}`);

  console.log(`\n${c.bold('Tier breakdown of recipients')}`);
  for (const [tier, count] of tierBreakdown(recipients)) {
    console.log(`  ${String(count).padStart(5)}  ${tier}`);
  }

  for (const [bucket, list] of [...byBucket].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${c.bold(BUCKET_LABEL[bucket] ?? bucket)}  ${c.amber(String(list.length))}`);
    for (const e of list) {
      console.log(`  ${c.dim(`${(e.row.full_name ?? '(no name)').padEnd(28)} ${e.reason}`)}`);
    }
  }

  if (duplicates.length) {
    console.log(`\n${c.bold('Duplicate addresses')}  ${c.amber(String(duplicates.length))}`);
    for (const d of duplicates) {
      console.log(`  ${c.dim(`${d.row.full_name} shares ${d.row.email} with ${d.firstSeen.full_name}`)}`);
    }
  }

  /* ── Things worth a human look, flagged not fixed ───────────────────────
     None of these change who is emailed. They are the rows where the data
     looks like somebody meant something else, and quietly "correcting" them
     would be guessing about a real guest's invitation. */
  const suspicious = [];
  for (const row of recipients) {
    const email = String(row.email ?? '');
    if (/\+\s*\d+\s*$/.test(String(row.full_name ?? ''))) {
      suspicious.push(`${row.full_name} — name carries a "+N" seat count; only one email is sent`);
    }
    if (/^(test|example|noreply|no-reply)/i.test(email)) {
      suspicious.push(`${row.full_name} — address looks like a placeholder: ${email}`);
    }
    if (row.plus_one_requested === true && !row.plus_one_status) {
      suspicious.push(`${row.full_name} — plus_one_requested with no status, yet included`);
    }
  }
  for (const e of excluded) {
    if (e.bucket === 'no-email' && String(e.row.email ?? '').includes('@')) {
      suspicious.push(`${e.row.full_name} — has an @ but was rejected: ${e.row.email}`);
    }
  }
  console.log(`\n${c.bold('Flagged for a human')}  ${suspicious.length ? c.amber(String(suspicious.length)) : c.green('0')}`);
  for (const line of suspicious) console.log(`  ${c.amber('⚠')} ${line}`);
  if (!suspicious.length) console.log(`  ${c.dim('nothing looks odd')}`);
}

/* ── Sending ─────────────────────────────────────────────────────────────── */

async function confirm(phrase) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`\nType ${c.bold(phrase)} to continue: `);
  rl.close();
  return typed.trim() === phrase;
}

/**
 * The checks that must hold before a single message goes out.
 *
 * Deliberately assertions and not warnings. Each one is a property the rule
 * is supposed to guarantee; if one is false the rule is not doing what was
 * approved, and the right outcome is to send nothing.
 */
function assertAudience(u) {
  const key = (e) => String(e ?? '').trim().toLowerCase();
  const problems = [];

  // Set A survives in full. This is the whole point of the union.
  const inAudience = new Set(u.audience.map(e => key(e.row.email)));
  const lost = u.original.filter(e => !inAudience.has(key(e.row.email)));
  if (lost.length) {
    problems.push(`${lost.length} rule-A recipient(s) are missing from the audience: ` +
                  lost.map(e => e.row.full_name).join(', '));
  }

  // One inbox, one letter.
  if (inAudience.size !== u.audience.length) {
    problems.push(`${u.audience.length} recipients share only ${inAudience.size} addresses`);
  }

  // Nobody held back is in the audience.
  for (const w of u.withheld) {
    if (inAudience.has(key(w.row.email))) {
      problems.push(`${w.row.full_name} is withheld but appears in the audience`);
    }
  }

  // A seat never granted the ceremony.
  for (const e of u.audience) {
    const ceremony = eventsForRecipient(e).some(ev => ev.key === 'JOINING');
    if (ceremony && !e.joining) {
      problems.push(`${e.row.full_name} would receive the ceremony section without a JOINING tier`);
    }
  }

  // The two counts cover everyone, so "73 + 67" can be checked against the total.
  if (u.joining + u.receptionOnly !== u.audience.length) {
    problems.push(`${u.joining} JOINING + ${u.receptionOnly} reception-only ` +
                  `≠ ${u.audience.length} recipients`);
  }

  if (problems.length) {
    throw new Error('The audience failed its own checks, so nothing was sent:\n  · ' +
                    problems.join('\n  · '));
  }
  console.log(`\n  ${c.green('✓')} audience checks passed: rule A intact, one letter per inbox, ` +
              `no seat granted the ceremony`);
}

/**
 * The Resend credential.
 *
 * sendEmail builds `Bearer ${apiKey}` unconditionally, so an absent key is not
 * an error there — it is the string "Bearer undefined", which Resend rejects
 * with "API key is invalid". That message names the key, so it sends you to
 * look at .env, at the dashboard, at anything except the one caller that
 * forgot to pass it. Reading it here, by name, and refusing early is what
 * makes the failure legible.
 */
function apiKey() {
  const key = String(process.env.RESEND_API_KEY ?? '').trim();
  if (!key) {
    throw new Error(
      'RESEND_API_KEY is not set, so nothing can be sent.\n' +
      'Run with --env-file=.env, or use --dry-run, which needs no key.');
  }
  return key;
}

async function deliver(targets, { cameraReady, siteUrl, assets, key }) {
  let sent = 0;
  const failed = [];

  for (const [i, entry] of targets.entries()) {
    const row = entry.row;
    // A seating-derived recipient is shown the reception because they hold a
    // seat. Everyone else is shown exactly their RSVP tier.
    const events = entry.source === 'test' ? null : eventsForRecipient(entry);
    const r = renderFinalDetails(row, { siteUrl, assets, cameraReady, events });
    try {
      await sendWithRetry({
        apiKey: key,
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
  const dressProblems = validateDress();
  if (dressProblems.length) {
    throw new Error(
      'The dress code in scripts/email/dress-code.mjs is not valid:\n  · ' +
      dressProblems.join('\n  · '));
  }

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

  const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
  const assets = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });

  // --to is a test to an address that need not be a guest. It happens BEFORE
  // anything is read: a test message has no business touching the guest list
  // or the seating plan, and it should work when neither can be reached.
  if (args.send && args.to) {
    const row = {
      full_name: 'Preview Guest', email: args.to,
      main_invite_status: 'APPROVED', attending: true,
      approved_for: args.previewTier || 'JOINING', plus_one_requested: false,
    };
    // Before the prompt, not after it. Being asked to confirm and then told
    // the credential is missing wastes the one thing the prompt is for.
    const key = apiKey();
    console.log(`\n${c.bold('One test message')} to ${c.cyan(args.to)}`);
    console.log(`  ${c.dim('no guest list and no seating plan was read for this')}`);
    if (!args.yes && !(await confirm('SEND TEST'))) {
      console.log(c.dim('Not confirmed. Nothing sent.'));
      return;
    }
    const { sent, failed } = await deliver(
      [{ row, source: 'test' }], { cameraReady: args.cameraReady, siteUrl, assets, key });
    console.log(sent ? c.green('\nResend accepted the test message.')
                     : c.red('\nResend did not accept it.'));
    if (failed.length) process.exitCode = 1;
    return;
  }

  const inputs = await fetchInputs();
  const audience = unionAudience(inputs.rsvpRows, inputs.seated);

  printUnionReport(audience, inputs);
  report(selectForFinalDetails(inputs.rsvpRows), inputs.rsvpRows);
  assertAudience(audience);

  if (!args.send) {
    console.log(`\n${c.dim('Dry run. Nothing was sent.')}`);
    return;
  }

  const targets = args.limit ? audience.audience.slice(0, args.limit) : audience.audience;
  const key = apiKey();   // before the prompt, for the same reason as above

  // The phrase carries the COUNT, so it cannot be typed from memory or copied
  // from a previous run — you have to have read the number above it.
  const phrase = args.all
    ? `SEND FINAL DETAILS TO ALL ${targets.length} GUESTS`
    : `SEND ${targets.length}`;

  if (args.all) {
    console.log(`\n${c.red(c.bold('  ────────────────────────────────────────────────────'))}`);
    console.log(`${c.red(c.bold(`   THIS SENDS TO ${targets.length} REAL GUESTS. IT CANNOT BE UNDONE.`))}`);
    console.log(`${c.red(c.bold('  ────────────────────────────────────────────────────'))}`);
    console.log(`  ${c.dim(`subject: ${subjectFinal(daysUntil(WEDDING.date, new Date()))}`)}`);
    console.log(`  ${c.dim(`from:    ${process.env.INVITE_FROM || DEFAULT_FROM}`)}`);
    console.log(`  ${c.dim(`camera section: ${(args.cameraReady || CAMERA.enabled) ? 'INCLUDED' : 'omitted'}`)}`);
  }
  // --yes skips a pilot's confirmation but NEVER the full send's. A flag that
  // can turn a 120-person send into one keystroke is a flag that will.
  const mustType = args.all || !args.yes;
  if (mustType && !(await confirm(phrase))) {
    console.log(c.dim('Not confirmed. Nothing sent.'));
    return;
  }
  const { sent, failed } = await deliver(targets, { cameraReady: args.cameraReady, siteUrl, assets, key });
  console.log(`\n${c.bold('Done')}  ${c.green(`${sent} sent`)}${failed.length ? c.red(`, ${failed.length} failed`) : ''}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n${c.red('✗')} ${e.message}`);
  process.exitCode = 1;
});
