#!/usr/bin/env node
/**
 * Send the Wedding Confirmation & Information Pack — CLI entry point.
 *
 * Goes to guests who have ALREADY RSVP'd. Confirms which parts of the day they
 * are invited to, their plus one, the venue, the dress code and the registry.
 *
 * Sending cannot be undone, so the scope of a run must be stated deliberately
 * and the widest scope costs the most keystrokes. Two rules, enforced in
 * guards.mjs:
 *
 *   1. No single flag sends to the whole list. --send alone is refused.
 *   2. Every real send prints the full recipient list and then waits for a
 *      typed confirmation containing the recipient count.
 *
 *   npm run email:pack                                  preview only
 *   npm run email:pack -- --to me@x.com --send          sample to yourself
 *   npm run email:pack -- --guest "Ada Obi" --send      one real guest
 *   npm run email:pack -- --limit 5 --send              a pilot group
 *   npm run email:pack -- --confirm-send-all --send     everyone
 */

import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { TABLE, STATUS, SUBJECT, RATE, DEFAULT_FROM, DEFAULT_REPLY_TO, assetUrls } from './config.mjs';
import { selectRecipients, unreachable, awaitingDecision, awaitingRsvp } from './recipients.mjs';
import { renderConfirmationPack } from './template.mjs';
import { sendWithRetry, sleep, SendError } from './resend.mjs';
import { MODE, resolveMode, findGuest, confirmationPhrase, matchesPhrase } from './guards.mjs';
import { eventsForGuest, plusOneState, EVENTS } from './events.mjs';

const c = {
  dim:  s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  red:  s => `\x1b[31m${s}\x1b[0m`,
  green:s => `\x1b[32m${s}\x1b[0m`,
  amber:s => `\x1b[33m${s}\x1b[0m`,
};

const HELP = `
Wedding Confirmation & Information Pack — RSVP'd guests → Resend

Scope — exactly one, and --send needs one of them:
  --to <email>          One sample to any address. Not a guest; nothing is
                        written. Use this first, to see how it renders.
  --guest <id|email|name>
                        One real guest, marked Sent afterwards.
  --limit <n>           The first n eligible guests. A pilot group.
  --confirm-send-all    Everyone eligible. Required for a full send — --send
                        on its own is refused.

  --send                Actually deliver. Without it nothing is sent and
                        nothing is written.
  --preview-tier <t>    With --to: which pack to render — JOINING (default),
                        RECEPTION or AFTERPARTY.
  --resend-sent         Include guests already marked Sent. Re-emails people.
  --yes                 Skip the typed confirmation. Refused for a full send.
  -h, --help            This message

Every real send prints the recipient list first and waits for you to type a
confirmation phrase containing the recipient count.

Environment (.env, loaded with --env-file):
  SUPABASE_URL                 Project URL
  SUPABASE_SERVICE_ROLE_KEY    Service-role key — required to write past RLS
  RESEND_API_KEY               Resend API key
  INVITE_SITE_URL              The live site — also where the artwork is served
                               from, unless INVITE_ASSET_BASE_URL overrides it
  INVITE_ASSET_BASE_URL        Optional. Where the four artwork files live.
  INVITE_FROM                  Optional. Default: ${DEFAULT_FROM}
  INVITE_REPLY_TO              Optional. Default: ${DEFAULT_REPLY_TO}
`;

function parseArgs(argv) {
  const args = { send: false, resendSent: false, confirmSendAll: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--send':             args.send = true; break;
      case '--limit':            args.limit = Number(next()); break;
      case '--to':               args.to = next(); break;
      case '--guest':            args.guest = next(); break;
      case '--preview-tier':     args.previewTier = next(); break;
      case '--confirm-send-all': args.confirmSendAll = true; break;
      case '--resend-sent':      args.resendSent = true; break;
      case '--yes': case '-y':   args.yes = true; break;
      case '--help': case '-h':  args.help = true; break;
      default:
        if (argv[i].startsWith('--')) throw new Error(`Unknown option: ${argv[i]}`);
    }
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit needs a positive whole number');
  }
  if (args.to !== undefined && !args.to) throw new Error('--to needs an email address');
  if (args.guest !== undefined && !args.guest) throw new Error('--guest needs an id, email or name');
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
  const missing = ['email_status', 'last_email_sent'].filter(col => !columns.includes(col));
  if (!missing.length) return;

  throw new Error(
    `The rsvps table has no ${missing.join(' or ')} column.\n\n` +
    'This looks like migration 0006_message_queue.sql having been applied — it\n' +
    'drops these columns and moves delivery state into message_queue.\n\n' +
    'Hold 0006 back until the packs have gone out, or move this script onto\n' +
    'enqueue_message(). Do not add the columns back by hand: 0006 also drops\n' +
    'them on re-run, so they would disappear again at the next migration.'
  );
}

/**
 * The recipient list. Printed before every send, not only in dry run.
 *
 * Each guest is shown WITH the events their pack will list and their plus-one
 * state, because those are the parts that differ per guest and the parts that
 * are damaging to get wrong. A list of names alone would not let anyone
 * actually check the thing that matters.
 */
function printRecipients(recipients, { from, replyTo, siteUrl }) {
  console.log(`\n${c.bold('Recipients')} — ${recipients.length}\n`);
  const width = String(recipients.length).length;

  const PLUS_ONE_LABEL = {
    approved: c.green('+1 confirmed'),
    declined: c.dim('+1 declined'),
    none:     '',
  };

  recipients.forEach((r, i) => {
    const events = eventsForGuest(r).map(e => e.name).join(' · ');
    const plus   = PLUS_ONE_LABEL[plusOneState(r)] ?? '';
    console.log(`  ${String(i + 1).padStart(width)}. ` +
                `${(r.full_name || '(no name)').padEnd(30)} ${c.dim((r.email || '').padEnd(30))}`);
    console.log(`  ${' '.repeat(width)}  ${c.dim('sees:')} ${events}${plus ? `   ${plus}` : ''}`);
  });

  console.log(c.dim(`\n  From:     ${from}`));
  console.log(c.dim(`  Reply-to: ${replyTo}`));
  console.log(c.dim(`  Subject:  ${SUBJECT}`));
  console.log(c.dim(`  Site:     ${siteUrl}`));
}

/**
 * Blocks until the operator types the phrase. Returns true to proceed.
 *
 * A non-interactive stdin cannot confirm, so it does not send. That is
 * deliberate: it means a cron job or a piped command can never trigger a
 * batch, which is exactly the accident this guard exists to prevent.
 */
async function confirm(mode, count, { yes }) {
  const phrase = confirmationPhrase(mode, count);

  if (yes) {
    if (mode === MODE.ALL) {
      console.log(c.red('\n--yes cannot approve a full send. Type the phrase.'));
    } else {
      console.log(c.amber(`\n--yes: proceeding without typing "${phrase}".`));
      return true;
    }
  }

  if (!process.stdin.isTTY) {
    console.error(c.red('\nRefusing to send: stdin is not a terminal, so the ') +
                  c.red('confirmation cannot be typed.'));
    console.error(c.dim('Run it directly in a terminal. This is what stops an ' +
                        'automated job from sending a batch.'));
    return false;
  }

  console.log(`\n${c.bold('About to email the ' + count + ' guest(s) listed above.')}`);
  if (mode === MODE.ALL) {
    console.log(c.amber('This is the FULL eligible guest list.'));
  }
  console.log(`Type ${c.bold(phrase)} to proceed, or anything else to abort.`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await rl.question('> ');
    if (!matchesPhrase(typed, phrase)) {
      console.log(c.dim('\nAborted. Nothing was sent.\n'));
      return false;
    }
    return true;
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  // Scope is decided before anything else — before credentials, before the
  // database is touched. A refused combination should fail instantly.
  const scope = resolveMode(args);
  if (!scope.ok) {
    console.error(`\n${c.red(scope.error)}\n`);
    if (scope.hint) console.error(scope.hint + '\n');
    process.exitCode = 1;
    return;
  }

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
      '  npm run email:pack\n\n' +
      'The service-role key is required — the anon key cannot update rows under\n' +
      'RLS. Never commit it; .env is gitignored.\n'
    );
    process.exitCode = 1;
    return;
  }

  const assets = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // ── Sample: one email to an arbitrary address, no guest row involved ──────
  if (args.to !== undefined) {
    // A sample must exercise the widest pack, or it proves nothing about the
    // sections that only some guests see. --preview-tier narrows it.
    const tier = (args.previewTier || 'JOINING').toUpperCase();
    if (!EVENTS[tier]) {
      console.error(`\n${c.red(`Unknown tier: ${args.previewTier}`)}`);
      console.error(c.dim('Use JOINING, RECEPTION or AFTERPARTY.\n'));
      process.exitCode = 1;
      return;
    }
    const sample = {
      id: 'sample', full_name: 'Test Guest', email: args.to,
      approved_for: tier, attending: true, main_invite_status: 'APPROVED',
      plus_one_requested: true, plus_one_status: 'APPROVED', plus_one_name: 'Your Guest',
    };
    const { html, text, events } = renderConfirmationPack(sample, { assets, rsvpUrl: siteUrl });

    console.log(`\n${c.bold('Sample confirmation pack')}  ${c.dim(`(${tier})`)}`);
    console.log(c.dim(`  Shows:    ${events.map(e => e.name).join(' · ')} · +1 confirmed`));
    console.log(`  To:       ${args.to}`);
    console.log(c.dim(`  From:     ${from}`));
    console.log(c.dim(`  Subject:  ${SUBJECT}`));
    console.log(c.dim(`  RSVP:     ${siteUrl}`));
    console.log(c.dim('\n  No guest row is read or written by this mode.'));

    if (scope.mode === MODE.DRY_RUN) {
      console.log(`\n${c.bold('DRY RUN')} — nothing sent. Add --send to deliver it.\n`);
      return;
    }
    const id = await sendWithRetry({
      apiKey, from, replyTo, to: args.to, subject: SUBJECT, html, text,
    });
    console.log(c.green(`\nSent. Resend message id: ${id}\n`));
    console.log('Check: does it land in the inbox rather than spam, does the RSVP');
    console.log('button open the site, and does the site accept your submission?\n');
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

  console.log(`\n${c.bold('Confirmation packs')}   ${rows.length} guests in ${TABLE}`);
  console.log(`  eligible : ${c.bold(String(recipients.length))}`);
  console.log(`  skipped  : ${skipped.length}`);

  const listSkips = (title, rows_, note) => {
    if (!rows_.length) return;
    console.log(`\n${c.amber(title)} — ${note}`);
    for (const s of rows_) {
      console.log(`  ${(s.row.full_name || '(no name)').padEnd(32)} ${c.dim(s.reason)}`);
    }
  };

  listSkips('Waiting on you', awaitingDecision(skipped),
            'a decision here turns each of these into a recipient');
  listSkips('Unreachable', unreachable(skipped),
            'RSVP\'d, but no usable email. Fix in the sheet, then re-run');

  const chase = awaitingRsvp(skipped);
  if (chase.length) {
    console.log(`\n${c.dim(`Approved but never RSVP'd: ${chase.length}`)} ` +
                c.dim('— they get no pack; this is the chase list.'));
  }

  // ── Narrow to the requested scope ─────────────────────────────────────────
  if (args.guest !== undefined) {
    const found = findGuest(rows, args.guest);
    if (!found.ok) {
      console.error(`\n${c.red(found.error)}`);
      if (found.hint) console.error(found.hint);
      console.error('');
      process.exitCode = 1;
      return;
    }
    // A named guest still has to be eligible; --guest chooses who, not whether.
    const eligible = recipients.some(r => r.id === found.row.id);
    if (!eligible) {
      const why = skipped.find(s => s.row.id === found.row.id)?.reason ?? 'not eligible';
      console.error(`\n${c.red(`${found.row.full_name} will not be emailed: ${why}`)}`);
      console.error(c.dim('--guest picks who to send to; it does not override eligibility.'));
      console.error(c.dim('For a render check to any address, use --to instead.\n'));
      process.exitCode = 1;
      return;
    }
    recipients = [found.row];
  } else if (args.limit !== undefined) {
    const total = recipients.length;
    recipients = recipients.slice(0, args.limit);
    if (total > recipients.length) {
      console.log(c.dim(`\n--limit ${args.limit}: sending to the first ${recipients.length} of ${total} eligible.`));
    }
  }

  if (!recipients.length) {
    console.log(c.dim('\nNobody to email.\n'));
    return;
  }

  // ── The list, always ──────────────────────────────────────────────────────
  printRecipients(recipients, { from, replyTo, siteUrl });

  if (scope.mode === MODE.DRY_RUN) {
    console.log(`\n${c.bold('DRY RUN')} — nothing sent, nothing written.\n`);
    console.log('When you are ready, narrowest first:');
    console.log(`  --to you@example.com --send      ${c.dim('a sample to yourself')}`);
    console.log(`  --guest "Name" --send            ${c.dim('one real guest')}`);
    console.log(`  --limit 5 --send                 ${c.dim('a pilot group')}`);
    console.log(`  --confirm-send-all --send        ${c.dim('everyone')}\n`);
    return;
  }

  if (scope.requiresConfirmation && !await confirm(scope.mode, recipients.length, args)) {
    process.exitCode = 1;
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
      const { html, text } = renderConfirmationPack(row, { assets, rsvpUrl: siteUrl });
      messageId = await sendWithRetry({
        apiKey, from, replyTo, to: row.email, subject: SUBJECT, html, text,
        // Same guest = same key, so a retried attempt after a lost response
        // returns the original message instead of sending twice.
        idempotencyKey: `confirmation-pack:${row.id}`,
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
