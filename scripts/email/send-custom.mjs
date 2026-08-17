#!/usr/bin/env node
/**
 * One-off custom send — seven people outside the normal eligible list.
 *
 *   npm run email:custom -- --dry-run     show who and what, send nothing
 *   npm run email:custom -- --send        deliver, after a typed confirmation
 *
 * ── What makes this safe ───────────────────────────────────────────────────
 * This file does not import @supabase/supabase-js, and neither does anything
 * it depends on. It cannot read a guest row, and it cannot write one — not by
 * policy but by construction. So:
 *
 *   · no RSVP record is created, read or modified
 *   · no email_status or last_email_sent is touched, for anyone
 *   · the 129 already sent are not consulted, so they cannot be resent
 *
 * The recipients are the seven in custom-recipients.mjs and nobody else. There
 * is no query, no filter and no eligibility rule that could widen that.
 *
 * Everything guest-facing is the production path: the same template, artwork,
 * subject, registry, account numbers, RSVP button and site link.
 */

import { createInterface } from 'node:readline/promises';
import { SUBJECT, RATE, DEFAULT_FROM, DEFAULT_REPLY_TO, assetUrls, WEDDING } from './config.mjs';
import { CUSTOM_RECIPIENTS, toRow } from './custom-recipients.mjs';
import { eventsForGuest, eventsForPlusOne, daysUntil } from './events.mjs';
import { isSendableEmail } from './recipients.mjs';
import { renderConfirmationPack } from './template.mjs';
import { sendWithRetry, sleep, SendError } from './resend.mjs';

const c = {
  dim:  s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  red:  s => `\x1b[31m${s}\x1b[0m`,
  green:s => `\x1b[32m${s}\x1b[0m`,
  amber:s => `\x1b[33m${s}\x1b[0m`,
};

const HELP = `
One-off custom send — ${CUSTOM_RECIPIENTS.length} recipients, fixed in custom-recipients.mjs

  --dry-run    Show the recipients and their itinerary. Sends nothing.
               This is also the default; --send is the only thing that sends.
  --send       Deliver, after typing a confirmation phrase.
  --yes        Skip the typed confirmation.
  -h, --help   This message

Touches no RSVP record and no delivery status. The list cannot be widened by
a flag — it is the array in custom-recipients.mjs.

Environment (.env):
  RESEND_API_KEY     Resend API key
  INVITE_SITE_URL    The live site — also where the artwork is served from
  INVITE_FROM        Optional. Default: ${DEFAULT_FROM}
  INVITE_REPLY_TO    Optional. Default: ${DEFAULT_REPLY_TO}
`;

function parseArgs(argv) {
  const args = { send: false, yes: false };
  for (const a of argv) {
    switch (a) {
      case '--send':    args.send = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--yes': case '-y': args.yes = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
    }
  }
  if (args.send && args.dryRun) {
    throw new Error('--dry-run and --send contradict each other. Pick one.');
  }
  return args;
}

/** The phrase carries the count, so it cannot be typed from muscle memory. */
const PHRASE = (n) => `SEND CUSTOM ${n}`;
const matches = (typed, phrase) =>
  String(typed ?? '').trim().replace(/\s+/g, ' ').toUpperCase() === phrase;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const apiKey  = process.env.RESEND_API_KEY;
  const siteUrl = process.env.INVITE_SITE_URL;
  const from    = process.env.INVITE_FROM     || DEFAULT_FROM;
  const replyTo = process.env.INVITE_REPLY_TO || DEFAULT_REPLY_TO;

  // Only needed to actually send. A dry run should work with nothing set, so
  // the list can be checked before any credential is in place.
  const missing = args.send
    ? [!apiKey && 'RESEND_API_KEY', !siteUrl && 'INVITE_SITE_URL'].filter(Boolean)
    : [];
  if (missing.length) {
    console.error(`\nMissing configuration: ${missing.join(', ')}\n\n` +
                  'Fill them into .env, then run:\n  npm run email:custom -- --send\n');
    process.exitCode = 1;
    return;
  }

  const site   = siteUrl || 'https://princessandini.com';
  const assets = assetUrls({ siteUrl: site, baseUrl: process.env.INVITE_ASSET_BASE_URL });
  const rows   = CUSTOM_RECIPIENTS.map(toRow);
  const days   = daysUntil(WEDDING.date);

  // ── The list, always ──────────────────────────────────────────────────────
  console.log(`\n${c.bold('Custom send')}  ${c.dim(`${rows.length} recipients · not from the guest list`)}`);
  console.log(c.dim('  No RSVP record is read or written. No delivery status is changed.'));
  console.log(c.dim('  The 129 already sent are not involved.\n'));

  let unusable = 0;
  rows.forEach((row, i) => {
    const theirs = eventsForGuest(row).map(e => `${e.name} ${e.time}`);
    const guest  = eventsForPlusOne(row).map(e => e.name);
    const bad    = !isSendableEmail(row.email);
    if (bad) unusable++;

    console.log(`  ${String(i + 1).padStart(2)}. ${c.bold((row.full_name || '').padEnd(10))} ` +
                `${bad ? c.red(row.email) : row.email}`);
    console.log(`      ${c.dim('invited to')}  ${theirs.join('  ·  ')}`);
    console.log(`      ${c.dim('their guest')} ${c.green('approved')}${
      guest.length ? c.dim(`  ·  ${guest.join(', ')}`) : c.amber('  no tier')}` +
      c.dim('  ·  referred to as "Guest", no real name used'));
  });

  console.log(c.dim(`\n  From:     ${from}`));
  console.log(c.dim(`  Reply-to: ${replyTo}`));
  console.log(c.dim(`  Subject:  ${SUBJECT}`));
  console.log(c.dim(`  RSVP:     ${site}`));
  console.log(c.dim(`  Countdown: ${days} days to go`));

  if (unusable) {
    console.error(c.red(`\n${unusable} address(es) are unusable. Fix them before sending.\n`));
    process.exitCode = 1;
    return;
  }

  // Render every one now, so a template failure surfaces here rather than
  // halfway through a live send.
  const packs = rows.map(row => ({ row, pack: renderConfirmationPack(row, { assets, rsvpUrl: site }) }));
  const wrong = packs.filter(({ pack }) =>
    pack.events.length !== 3
    || pack.plusOne !== 'approved'
    // The guest is approved for the reception only — not the whole day.
    || pack.plusOneEvents.length !== 1
    || pack.plusOneEvents[0].key !== 'RECEPTION'
    // The additional attendee must be "Guest" and never a borrowed name.
    || !/reserved a seat for <strong>Guest<\/strong>/.test(pack.html.replace(/\s+/g, ' ')));
  if (wrong.length) {
    console.error(c.red(`\n${wrong.length} pack(s) did not render the expected itinerary.\n`));
    process.exitCode = 1;
    return;
  }
  console.log(c.green(`\n  All ${packs.length} packs render: 3 events each, ` +
                      'guest approved for the reception only.'));

  if (!args.send) {
    console.log(`\n${c.bold('DRY RUN')} — nothing sent, nothing written.`);
    console.log(`Add ${c.bold('--send')} to deliver to these ${rows.length}.\n`);
    return;
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (!args.yes) {
    if (!process.stdin.isTTY) {
      console.error(c.red('\nRefusing to send: stdin is not a terminal.\n'));
      process.exitCode = 1;
      return;
    }
    console.log(`\n${c.bold(`About to email the ${rows.length} people listed above.`)}`);
    console.log(`Type ${c.bold(PHRASE(rows.length))} to proceed, or anything else to abort.`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!matches(await rl.question('> '), PHRASE(rows.length))) {
        console.log(c.dim('\nAborted. Nothing was sent.\n'));
        process.exitCode = 1;
        return;
      }
    } finally { rl.close(); }
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const sent = [];
  const failed = [];

  console.log(`\n${c.bold('SENDING')} to ${packs.length}…\n`);
  for (const [i, { row, pack }] of packs.entries()) {
    const label = `${String(i + 1).padStart(2)}/${packs.length}  ${(row.full_name || '').padEnd(10)}`;
    if (i > 0) await sleep(RATE.minGapMs);

    try {
      const id = await sendWithRetry({
        apiKey, from, replyTo, to: row.email,
        subject: SUBJECT, html: pack.html, text: pack.text,
        // Namespaced away from the main send, so this can never be mistaken
        // for a resend of one of the 129 and can never collide with one.
        idempotencyKey: `custom-2026-09:${row.email.toLowerCase()}`,
      }, {
        onRetry: ({ attempt, wait, message }) =>
          console.log(c.amber(`${label} retry ${attempt} in ${wait}ms — ${message}`)),
      });
      sent.push({ row, id });
      console.log(`${label} ${c.green('sent')}  ${c.dim(row.email)}`);
    } catch (err) {
      // One bad address must not end the run.
      failed.push({ row, message: err.message, status: err instanceof SendError ? err.status : null });
      console.log(`${label} ${c.red('FAILED')}  ${c.dim(err.message)}`);
    }
  }

  console.log(`\n${c.bold('Summary')}`);
  console.log(`  sent   : ${c.green(String(sent.length))}`);
  if (failed.length) console.log(`  failed : ${c.red(String(failed.length))}`);
  console.log(c.dim('  Nothing was written to the database.'));

  if (failed.length) {
    console.log(`\n${c.red('Failed')} — re-running retries everyone; the idempotency key stops`);
    console.log('a second copy reaching anyone who already received one:');
    for (const f of failed) {
      console.log(`  ${(f.row.full_name || '').padEnd(10)} ${String(f.row.email).padEnd(32)} ${c.dim(f.message)}`);
    }
    process.exitCode = 1;
  }
  console.log('');
}

main().catch(err => {
  console.error(`\n${c.red('Run aborted')}\n\n${err.message}\n`);
  process.exitCode = 1;
});
