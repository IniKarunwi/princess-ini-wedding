#!/usr/bin/env node
/**
 * Send wedding invitations to approved guests — CLI entry point.
 *
 *   npm run email:invites                      # preview, sends nothing
 *   npm run email:invites -- --to me@x.com     # one real send, to yourself
 *   npm run email:invites -- --limit 5 --send  # first five, for real
 *   npm run email:invites -- --send            # everyone eligible
 *
 * Dry run is the default on purpose. This one is not like the sync: a bad
 * sync can be corrected on the next run, but an email that has gone out
 * cannot be recalled.
 *
 * One guest failing never stops the batch. Failures are collected, reported
 * at the end, and left with email_status untouched so the next run retries
 * exactly them.
 */

import { createClient } from '@supabase/supabase-js';
import { TABLE, STATUS, SUBJECT, RATE, DEFAULT_FROM, DEFAULT_REPLY_TO } from './config.mjs';
import { selectRecipients, unreachable } from './recipients.mjs';
import { renderInvitation } from './template.mjs';
import { sendWithRetry, sleep, SendError } from './resend.mjs';

const c = {
  dim:  s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  red:  s => `\x1b[31m${s}\x1b[0m`,
  green:s => `\x1b[32m${s}\x1b[0m`,
  amber:s => `\x1b[33m${s}\x1b[0m`,
};

const HELP = `
Wedding invitations — approved guests → Resend

  --send            Actually send. Without it nothing is sent and nothing is
                    written; the run only shows you who would receive one.
  --limit <n>       Send to at most n guests. Use it for the first live run.
  --to <email>      Ignore the guest list and send one email to this address.
                    For checking how the invitation renders in a real inbox.
  --resend-sent     Include guests already marked Sent. Re-emails people.
  -h, --help        This message

Environment (.env, loaded with --env-file):
  SUPABASE_URL                 Project URL
  SUPABASE_SERVICE_ROLE_KEY    Service-role key — required to write past RLS
  RESEND_API_KEY               Resend API key
  INVITE_SITE_URL              The live RSVP site, linked from the email
  INVITE_FROM                  Optional. Default: ${DEFAULT_FROM}
  INVITE_REPLY_TO              Optional. Default: ${DEFAULT_REPLY_TO}
`;

function parseArgs(argv) {
  const args = { send: false, resendSent: false };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--send':        args.send = true; break;
      case '--limit':       args.limit = Number(next()); break;
      case '--to':          args.to = next(); break;
      case '--resend-sent': args.resendSent = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        if (argv[i].startsWith('--')) throw new Error(`Unknown option: ${argv[i]}`);
    }
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit needs a positive whole number');
  }
  return args;
}

/** Pulls every guest, paging past PostgREST's response cap. */
async function fetchGuests(supabase) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(TABLE).select('*')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to read ${TABLE}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

/**
 * This feature stores delivery state in rsvps.email_status / last_email_sent.
 * Migration 0006 deliberately removes both, moving delivery into message_queue.
 * They cannot both be true, so say so plainly instead of failing later with a
 * PostgREST column error nobody can interpret.
 */
function assertSchema(rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const missing = ['email_status', 'last_email_sent'].filter(c => !columns.includes(c));
  if (!missing.length) return;

  throw new Error(
    `The rsvps table has no ${missing.join(' or ')} column.\n\n` +
    'This looks like migration 0006_message_queue.sql having been applied — it\n' +
    'drops these columns and moves delivery state into message_queue.\n\n' +
    'Hold 0006 back until the invitation send is done, or move this script onto\n' +
    'enqueue_message(). Do not add the columns back by hand: 0006 also drops\n' +
    'them on re-run, so they would disappear again at the next migration.'
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const url     = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey  = process.env.RESEND_API_KEY;
  const siteUrl = process.env.INVITE_SITE_URL;
  const from    = process.env.INVITE_FROM     || DEFAULT_FROM;
  const replyTo = process.env.INVITE_REPLY_TO || DEFAULT_REPLY_TO;

  const missing = [
    !url     && 'SUPABASE_URL',
    !key     && 'SUPABASE_SERVICE_ROLE_KEY',
    !apiKey  && 'RESEND_API_KEY',
    !siteUrl && 'INVITE_SITE_URL',
  ].filter(Boolean);

  if (missing.length) {
    console.error(
      `\nMissing configuration: ${missing.join(', ')}\n\n` +
      'Copy .env.example to .env and fill it in, then run:\n' +
      '  npm run email:invites\n\n' +
      'The service-role key is required — the anon key cannot update rows under\n' +
      'RLS. Never commit it; .env is gitignored.\n'
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // ── One-off render check, no guest list involved ──────────────────────────
  if (args.to) {
    const sample = { full_name: 'Test Guest', email: args.to };
    const { html, text } = renderInvitation(sample, { rsvpUrl: siteUrl });
    if (!args.send) {
      console.log(`\nDRY RUN — would send a sample invitation to ${args.to}`);
      console.log(c.dim('Add --send to actually deliver it.\n'));
      return;
    }
    const id = await sendWithRetry({
      apiKey, from, replyTo, to: args.to, subject: SUBJECT, html, text,
    });
    console.log(c.green(`\nSent sample invitation to ${args.to}  (${id})\n`));
    return;
  }

  // ── Select ────────────────────────────────────────────────────────────────
  const rows = await fetchGuests(supabase);
  assertSchema(rows);

  let { send: recipients, skipped } = selectRecipients(rows);

  if (args.resendSent) {
    const reSend = skipped.filter(s => s.reason.startsWith('already sent'));
    recipients = recipients.concat(reSend.map(s => s.row));
    skipped    = skipped.filter(s => !s.reason.startsWith('already sent'));
    if (reSend.length) {
      console.log(c.amber(`--resend-sent: including ${reSend.length} guest(s) already marked Sent.`));
    }
  }

  const total = recipients.length;
  if (args.limit) recipients = recipients.slice(0, args.limit);

  console.log(`\n${c.bold('Wedding invitations')}   ${rows.length} guests in ${TABLE}`);
  console.log(`  eligible to send : ${c.bold(String(total))}` +
              (args.limit ? c.amber(`  (--limit ${args.limit} → sending ${recipients.length})`) : ''));
  console.log(`  skipped          : ${skipped.length}`);

  const cannotReach = unreachable(skipped);
  if (cannotReach.length) {
    console.log(`\n${c.amber('Approved but unreachable')} — fix these in the sheet, then re-run:`);
    for (const s of cannotReach) {
      console.log(`  ${(s.row.full_name || '(no name)').padEnd(32)} ${c.dim(s.reason)}`);
    }
  }

  if (!recipients.length) {
    console.log(c.dim('\nNobody to email.\n'));
    return;
  }

  if (!args.send) {
    console.log(`\n${c.bold('DRY RUN')} — nothing sent, nothing written. Would email:\n`);
    recipients.forEach((r, i) => {
      console.log(`  ${String(i + 1).padStart(3)}. ${(r.full_name || '(no name)').padEnd(32)} ${c.dim(r.email)}`);
    });
    console.log(c.dim(`\nFrom:    ${from}`));
    console.log(c.dim(`Subject: ${SUBJECT}`));
    console.log(c.dim(`RSVP:    ${siteUrl}`));
    console.log(`\nAdd ${c.bold('--send')} to deliver. Try ${c.bold('--to you@example.com --send')} first\n` +
                'to see how it renders, and --limit 5 --send for a cautious first batch.\n');
    return;
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const sent = [];
  const failed = [];
  const unrecorded = [];   // delivered, but the row could not be updated

  console.log(`\n${c.bold('SENDING')} to ${recipients.length} guest(s)…\n`);

  for (const [index, row] of recipients.entries()) {
    const label = `${String(index + 1).padStart(3)}/${recipients.length}  ` +
                  `${(row.full_name || '(no name)').padEnd(30)}`;

    if (index > 0) await sleep(RATE.minGapMs);   // stay under Resend's rate limit

    let messageId;
    try {
      const { html, text } = renderInvitation(row, { rsvpUrl: siteUrl });
      messageId = await sendWithRetry({
        apiKey, from, replyTo, to: row.email, subject: SUBJECT, html, text,
        // Same guest + same email = same key, so a retried attempt after a lost
        // response returns the original message instead of sending twice.
        idempotencyKey: `invitation:${row.id}`,
      }, {
        onRetry: ({ attempt, wait, message }) =>
          console.log(c.amber(`${label} retry ${attempt} in ${wait}ms — ${message}`)),
      });
    } catch (err) {
      // The whole point: one bad address must not end the batch.
      failed.push({ row, message: err.message, status: err instanceof SendError ? err.status : null });
      console.log(`${label} ${c.red('FAILED')}  ${c.dim(err.message)}`);
      continue;
    }

    // Delivered. Record it — and treat a failure here as its own category,
    // because the guest HAS been emailed and a naive re-run would email them
    // again. The idempotency key makes that harmless, but it should still be
    // visible rather than silent.
    const { error } = await supabase.from(TABLE)
      .update({ email_status: STATUS.SENT, last_email_sent: new Date().toISOString() })
      .eq('id', row.id);

    if (error) {
      unrecorded.push({ row, messageId, message: error.message });
      console.log(`${label} ${c.amber('SENT, NOT RECORDED')}  ${c.dim(error.message)}`);
    } else {
      sent.push({ row, messageId });
      console.log(`${label} ${c.green('sent')}      ${c.dim(row.email)}`);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n${c.bold('Summary')}`);
  console.log(`  sent and recorded : ${c.green(String(sent.length))}`);
  if (unrecorded.length) console.log(`  sent, NOT recorded: ${c.amber(String(unrecorded.length))}`);
  if (failed.length)     console.log(`  failed            : ${c.red(String(failed.length))}`);

  if (unrecorded.length) {
    console.log(`\n${c.amber('Delivered but email_status was not updated')} — these guests HAVE`);
    console.log('been emailed. Set their status by hand so a later run does not repeat them:');
    for (const u of unrecorded) {
      console.log(`  ${(u.row.full_name || '(no name)').padEnd(30)} ${u.row.email}`);
    }
    console.log(c.dim(`\n  update ${TABLE} set email_status = '${STATUS.SENT}', last_email_sent = now()`));
    console.log(c.dim(`   where id in (${unrecorded.map(u => `'${u.row.id}'`).join(', ')});`));
  }

  if (failed.length) {
    console.log(`\n${c.red('Failed')} — status left untouched, so re-running retries exactly these:`);
    for (const f of failed) {
      console.log(`  ${(f.row.full_name || '(no name)').padEnd(30)} ${String(f.row.email).padEnd(34)} ${c.dim(f.message)}`);
    }
    process.exitCode = 1;
  }
  console.log('');
}

main().catch(err => {
  console.error(`\n${c.red('Run aborted')}\n\n${err.message}\n`);
  process.exitCode = 1;
});
