#!/usr/bin/env node
/**
 * Wedding Update #2 — the thirty-day note. npm run email:update
 *
 *   npm run email:update -- --dry-run                 who would receive it
 *   npm run email:update -- --to me@example.com       one test to yourself
 *   npm run email:update -- --send --confirm-send-all deliver to everyone
 *
 * ── This campaign writes NOTHING to the database ───────────────────────────
 * Not email_status, not last_email_sent, not one field on one row. There is no
 * update() call in this file. The confirmation pack's delivery columns belong
 * to the confirmation pack; a second campaign reusing them would corrupt the
 * only record of who received the first one.
 *
 * Re-running is therefore safe in exactly one way and unsafe in another:
 *  · safe  — no state is touched, so nothing can be corrupted
 *  · unsafe — nothing records that a guest was already emailed, so a second
 *             --send would deliver a second copy. The Resend idempotency key
 *             below is what actually prevents that: it is derived from the
 *             campaign and the address, so Resend refuses the duplicate.
 *
 * ── Who gets it ────────────────────────────────────────────────────────────
 * Approved, holding at least one event, with a usable address. Deliberately
 * NOT filtered on RSVP or on having received the confirmation pack — see
 * update-recipients.mjs, where the rule and its reasoning live.
 */

import { createInterface } from 'node:readline/promises';
import {
  TABLE, SUBJECT_THIRTY, RATE, DEFAULT_FROM, DEFAULT_REPLY_TO, assetUrls, WEDDING,
} from './config.mjs';
import { selectForUpdate, tierBreakdown } from './update-recipients.mjs';
import { renderThirtyDayUpdate } from './template-update.mjs';
import { sendWithRetry, sleep, SendError } from './resend.mjs';

/** Bump if this campaign is ever legitimately re-sent to the same people. */
const CAMPAIGN = 'update-30d-2026-08';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

const HELP = `
Wedding Update #2 — thirty days to go

  --dry-run            Show recipients and exclusions. Sends nothing. Default.
  --to <address>       Send one copy to a single address, for checking.
  --limit <n>          Send to the first n recipients (a pilot).
  --confirm-send-all   Required to send to everyone. Never implied.
  --send               Deliver. Must be paired with --to, --limit or
                       --confirm-send-all; alone it is refused.
  --yes                Skip the typed confirmation.
  --csv                Machine-readable recipient list.
  -h, --help           This message

Writes nothing to the database. No RSVP field is read for eligibility beyond
approval and tier, and none is modified.
`;

function parseArgs(argv) {
  const args = { send: false, yes: false, dryRun: false, csv: false, all: false, to: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--send': args.send = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--confirm-send-all': args.all = true; break;
      case '--yes': case '-y': args.yes = true; break;
      case '--csv': args.csv = true; break;
      case '--help': case '-h': args.help = true; break;
      case '--to': args.to = argv[++i]; break;
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

const PHRASE = (n) => `SEND UPDATE ${n}`;
const matches = (typed, phrase) =>
  String(typed ?? '').trim().replace(/\s+/g, ' ').toUpperCase() === phrase;

/** Every row, paged. Read-only: select() and nothing else. */
async function fetchAll(supabase) {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from(TABLE).select('*').order('id', { ascending: true })
      .range(from, from + size - 1);
    if (error) throw new Error(`Supabase: ${error.message}`);
    rows.push(...data);
    if (data.length < size) return rows;
  }
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

  if (!url || !key) {
    console.error(`\n${c.red('Cannot build the recipient list without database access.')}\n\n` +
      'Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.\n' +
      'Used read-only here — there is no write in this file — but the anon key\n' +
      'cannot see the rows under RLS.\n');
    process.exitCode = 1;
    return;
  }
  if (args.send && !apiKey) {
    console.error(`\n${c.red('RESEND_API_KEY is not set.')} Cannot send.\n`);
    process.exitCode = 1;
    return;
  }

  const site   = siteUrl || 'https://princessandini.com';
  const assets = assetUrls({ siteUrl: site, baseUrl: process.env.INVITE_ASSET_BASE_URL });

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const rows = await fetchAll(supabase);
  const { recipients, excluded, duplicates } = selectForUpdate(rows);

  // ── A single test address short-circuits the whole list ───────────────────
  let targets = recipients;
  if (args.to) {
    const wanted = args.to.trim().toLowerCase();
    const found = recipients.find(r => String(r.email).trim().toLowerCase() === wanted);
    targets = [found ?? {
      id: `test:${wanted}`, full_name: 'Ini', email: args.to,
      main_invite_status: 'APPROVED', approved_for: 'JOINING',
    }];
  } else if (args.limit !== null) {
    targets = recipients.slice(0, args.limit);
  }

  if (args.csv) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    console.log(['Name', 'Email', 'RSVP ID', 'Approved tier', 'Events'].map(esc).join(','));
    for (const r of targets) {
      const ev = renderThirtyDayUpdate(r, { assets, siteUrl: site }).events.map(e => e.name).join(' + ');
      console.log([r.full_name, r.email, r.id, r.approved_for, ev].map(esc).join(','));
    }
    return;
  }

  console.log(`\n${c.bold('Wedding Update #2')}  ${c.dim('30 days to go — hotels & registry')}`);
  console.log(c.dim(`  ${rows.length} rows in ${TABLE}. Nothing will be written to any of them.`));

  // ── 2. The full recipient list ────────────────────────────────────────────
  console.log(`\n${c.bold('Recipients')}  ${c.dim(`${targets.length}`)}`);
  console.log(c.dim('   #  name                          email                              approved for'));
  targets.forEach((r, i) => {
    const ev = renderThirtyDayUpdate(r, { assets, siteUrl: site }).events.map(e => e.name).join(' + ');
    console.log(`  ${String(i + 1).padStart(3)}. ${(r.full_name || '(no name)').slice(0, 28).padEnd(29)} ` +
                `${String(r.email).slice(0, 34).padEnd(35)} ${c.dim(ev)}`);
  });

  // ── breakdown by tier ─────────────────────────────────────────────────────
  console.log(`\n${c.bold('By approved tier')}`);
  for (const [label, n] of tierBreakdown(targets)) {
    console.log(`  ${String(n).padStart(4)}  ${label}`);
  }

  // ── 3 & 4. Invariants, asserted rather than asserted-to ───────────────────
  console.log(`\n${c.bold('Checks')}`);
  const noEvents = targets.filter(r => renderThirtyDayUpdate(r, { assets, siteUrl: site }).events.length === 0);
  const badEmail = targets.filter(r => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email ?? '')));
  const notApproved = targets.filter(r => String(r.main_invite_status ?? '').toUpperCase() !== 'APPROVED');
  const ok = (label, bad) => console.log(bad.length
    ? `  ${c.red('FAIL')}  ${label} — ${bad.length}: ${bad.slice(0, 5).map(r => r.email).join(', ')}`
    : `  ${c.green('ok')}    ${label}`);
  ok('every recipient is approved for at least one event', noEvents);
  ok('every recipient has a usable email address', badEmail);
  ok('no unapproved or pending guest is included', notApproved);

  if (noEvents.length || badEmail.length || notApproved.length) {
    console.error(c.red('\nRefusing to continue — the recipient list violates its own rule.\n'));
    process.exitCode = 1;
    return;
  }

  // ── Excluded, and why ─────────────────────────────────────────────────────
  const buckets = new Map();
  for (const e of excluded) {
    if (!buckets.has(e.bucket)) buckets.set(e.bucket, []);
    buckets.get(e.bucket).push(e);
  }
  const BUCKET_LABEL = {
    'not-approved': 'Not approved / still pending',
    'no-tier':      'Approved but not approved for any event',
    'no-email':     'No usable email address',
  };
  console.log(`\n${c.bold('Excluded')}  ${c.dim(`${excluded.length}`)}`);
  for (const [bucket, list] of buckets) {
    console.log(`\n  ${c.cyan(BUCKET_LABEL[bucket] ?? bucket)}  ${c.dim(`${list.length}`)}`);
    for (const e of list) {
      console.log(`    ${(e.row.full_name || '(no name)').slice(0, 26).padEnd(27)} ` +
                  `${String(e.row.email ?? '—').slice(0, 32).padEnd(33)} ${c.dim(e.reason)}`);
    }
  }
  if (duplicates.length) {
    console.log(`\n  ${c.amber('Duplicate address, kept once')}  ${c.dim(`${duplicates.length}`)}`);
    for (const d of duplicates) {
      console.log(`    ${(d.row.full_name || '(no name)').padEnd(27)} ${d.row.email} ` +
                  c.dim(`— also on ${d.firstSeen.full_name || d.firstSeen.id}`));
    }
  }

  const accounted = recipients.length + excluded.length + duplicates.length;
  console.log(accounted === rows.length
    ? c.dim(`\n  ${accounted} of ${rows.length} rows accounted for.`)
    : c.red(`\n  ${accounted} of ${rows.length} rows accounted for — the audit is losing rows.`));

  console.log(c.dim(`\n  From:     ${from}`));
  console.log(c.dim(`  Reply-to: ${replyTo}`));
  console.log(c.dim(`  Subject:  ${SUBJECT_THIRTY}`));

  // ── 5. Render everyone now, so a template failure surfaces here ───────────
  const packs = targets.map(row => ({ row, pack: renderThirtyDayUpdate(row, { assets, siteUrl: site }) }));
  const oversize = packs.filter(p => Buffer.byteLength(p.pack.html) > 102 * 1024);
  console.log(`\n  ${c.green('ok')}    all ${packs.length} rendered` +
              c.dim(`  ·  ${(Buffer.byteLength(packs[0]?.pack.html ?? '') / 1024).toFixed(1)}KB html` +
                    `  ·  ${packs[0]?.pack.days} days to go`));
  if (oversize.length) {
    console.error(c.red(`  ${oversize.length} over Gmail's 102KB clip threshold.`));
    process.exitCode = 1;
    return;
  }

  if (!args.send) {
    console.log(`\n${c.bold('DRY RUN')} — nothing sent, nothing written.`);
    console.log(`Preview one:  ${c.bold('npm run email:update -- --to you@example.com --send')}`);
    console.log(`Send to all:  ${c.bold(`npm run email:update -- --send --confirm-send-all`)}\n`);
    return;
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (!args.yes) {
    if (!process.stdin.isTTY) {
      console.error(c.red('\nRefusing to send: stdin is not a terminal.\n'));
      process.exitCode = 1;
      return;
    }
    console.log(`\n${c.bold(`About to email the ${targets.length} people listed above.`)}`);
    console.log(`Type ${c.bold(PHRASE(targets.length))} to proceed, or anything else to abort.`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!matches(await rl.question('> '), PHRASE(targets.length))) {
        console.log(c.dim('\nAborted. Nothing was sent.\n'));
        process.exitCode = 1;
        return;
      }
    } finally { rl.close(); }
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const sent = [], failed = [];
  console.log(`\n${c.bold('SENDING')} to ${packs.length}…\n`);
  for (const [i, { row, pack }] of packs.entries()) {
    const label = `${String(i + 1).padStart(4)}/${packs.length}  ${(row.full_name || '').slice(0, 24).padEnd(25)}`;
    if (i > 0) await sleep(RATE.minGapMs);
    try {
      await sendWithRetry({
        apiKey, from, replyTo, to: row.email,
        subject: SUBJECT_THIRTY, html: pack.html, text: pack.text,
        // Namespaced to this campaign, so it can never collide with the
        // confirmation pack and a re-run cannot deliver a second copy.
        idempotencyKey: `${CAMPAIGN}:${String(row.email).toLowerCase()}`,
      }, {
        onRetry: ({ attempt, wait, message }) =>
          console.log(c.amber(`${label} retry ${attempt} in ${wait}ms — ${message}`)),
      });
      sent.push(row);
      console.log(`${label} ${c.green('sent')}  ${c.dim(row.email)}`);
    } catch (err) {
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
      console.log(`  ${(f.row.full_name || '').padEnd(26)} ${String(f.row.email).padEnd(34)} ${c.dim(f.message)}`);
    }
    process.exitCode = 1;
  }
  console.log('');
}

main().catch(err => {
  console.error(`\n${c.red('Run aborted')}\n\n${err.message}\n`);
  process.exitCode = 1;
});
