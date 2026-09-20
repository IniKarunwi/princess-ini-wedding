#!/usr/bin/env node
/**
 * Is 0007 safe to run against production? — npm run verify:production
 *
 * STRICTLY READ-ONLY. No insert, update, upsert, delete or rpc anywhere in
 * this file. It answers one question — would applying 0007 break anything —
 * and it answers it against YOUR live database rather than against the
 * migration files, because the files are only what we believe was applied.
 *
 * ── How it inspects a schema over PostgREST ────────────────────────────────
 * Supabase's REST API does not expose information_schema, so the deep checks
 * (triggers, policies, function bodies) are in the companion SQL file, which
 * you paste into the SQL editor:
 *
 *     supabase/checks/verify_0007_compat.sql
 *
 * What this file does instead is PROBE: ask for one column and read the error.
 * A missing column and a present one are reliably distinguishable, which is
 * enough to establish which migrations have actually run. That covers the
 * questions that decide whether 0007 is safe, using only the .env you have.
 *
 * ── Secrets ────────────────────────────────────────────────────────────────
 * Keys are read from the environment and never printed. Where a key's presence
 * matters the output says "set" and its length, never its value.
 */

import { TABLE } from '../email/config.mjs';
import { parsePlusN } from './party-size.mjs';
import { isApproved } from './permissions.mjs';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

let problems = 0, warnings = 0;
const ok    = (m, d) => console.log(`  ${c.green('ok')}    ${m}${d ? c.dim(`  ${d}`) : ''}`);
const warn  = (m, d) => { warnings++; console.log(`  ${c.amber('check')} ${m}${d ? c.dim(`  ${d}`) : ''}`); };
const bad   = (m, d) => { problems++; console.log(`  ${c.red('STOP')}  ${m}${d ? c.dim(`  ${d}`) : ''}`); };

/** Does `table.column` exist? Distinguishes a missing table from a missing column. */
async function probe(db, table, column) {
  const { error } = await db.from(table).select(column).limit(1);
  if (!error) return 'present';
  const m = String(error.message || '');
  if (/does not exist/i.test(m) && /relation|table/i.test(m)) return 'no-table';
  if (/column .* does not exist|could not find the .* column/i.test(m)) return 'no-column';
  return `error: ${m.slice(0, 80)}`;
}

async function main() {
  const url      = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !service) {
    console.error(`\n${c.red('Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.')}\n`);
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, service, { auth: { persistSession: false } });

  console.log(`\n${c.bold('0007 compatibility check')}  ${c.dim(new URL(url).host)}`);
  console.log(c.dim('  Read-only. Nothing is written. No secret is printed.'));
  console.log(c.dim(`  service key ${service.length} chars · anon key ${anon ? `${anon.length} chars` : 'NOT SET'}`));

  /* ── 1. Columns ─────────────────────────────────────────────────────────── */
  console.log(`\n${c.bold('1. rsvps columns')}`);
  const expected = ['id','created_at','full_name','email','phone','attending','guest_count',
                    'plus_one_requested','plus_one_name','plus_one_relationship','plus_one_status',
                    'main_invite_status','approved_for','plus_one_approved_for','seat_allocation'];
  const state = {};
  for (const col of expected) {
    state[col] = await probe(db, TABLE, col);
    if (state[col] === 'present') ok(col);
    else bad(`${col} is ${state[col]}`, '0007 and the wedding-day code read this');
  }

  // The brief described a column called `main`. Confirm against the live DB.
  const mainCol = await probe(db, TABLE, 'main');
  if (mainCol === 'present') {
    warn('a column named "main" DOES exist',
         'the code reads main_invite_status / approved_for instead');
  } else {
    ok('no "main" column, as expected',
       'the sheet column "main" is split into main_invite_status + approved_for');
  }

  /* ── 2. Which migrations have actually run ─────────────────────────────── */
  console.log(`\n${c.bold('2. migration state')}`);
  const emailStatus = state['email_status'] ?? await probe(db, TABLE, 'email_status');
  const lastEmail   = await probe(db, TABLE, 'last_email_sent');
  const msgQueue    = await probe(db, 'message_queue', 'id');

  if (emailStatus === 'present' && lastEmail === 'present' && msgQueue === 'no-table') {
    ok('0006 has NOT been applied', 'expected — the email sender still needs these columns');
  } else if (msgQueue === 'present' && emailStatus === 'no-column') {
    bad('0006 HAS been applied — email_status/last_email_sent are gone',
        'the Resend sender writes those columns and will fail');
  } else if (msgQueue === 'present' && emailStatus === 'present') {
    warn('0006 applied PARTIALLY', 'message_queue exists but the old columns remain');
  } else {
    warn('0006 state is unclear', `email_status=${emailStatus} message_queue=${msgQueue}`);
  }

  const partySize = await probe(db, TABLE, 'party_size');
  const passes    = await probe(db, 'guest_passes', 'id');
  const checkins  = await probe(db, 'checkin_events', 'id');
  const applied7  = [partySize, passes, checkins].filter(s => s === 'present').length;

  if (applied7 === 0) ok('0007 has not been applied yet', 'nothing to conflict with');
  else if (applied7 === 3) warn('0007 appears to be FULLY applied', 'it is idempotent; re-running is safe');
  else bad('0007 is PARTIALLY applied', `party_size=${partySize} guest_passes=${passes} checkin_events=${checkins}`);

  /* ── 3. RLS, and the exposure it closes ─────────────────────────────────── */
  console.log(`\n${c.bold('3. row level security on rsvps')}`);
  if (!anon) {
    warn('cannot test — no anon key in .env', 'set VITE_SUPABASE_ANON_KEY to check this');
  } else {
    const pub = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await pub.from(TABLE).select('id, full_name, email').limit(3);
    if (error) {
      ok('anon cannot read rsvps', 'RLS is already on, or a policy denies it');
    } else if ((data ?? []).length > 0) {
      bad(`anon CAN read rsvps — ${data.length}+ rows, including names and emails`,
          'the anon key is in the browser bundle, so this is public today');
      console.log(c.dim('        0007 closes this. Until then, treat the guest list as exposed.'));
    } else {
      warn('anon read returned no rows', 'either the table is empty or a policy filters everything');
    }
  }

  /* ── 4. The data ────────────────────────────────────────────────────────── */
  console.log(`\n${c.bold('4. data')}`);
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(TABLE).select('*').order('id').range(from, from + 999);
    if (error) { bad(`cannot read rsvps: ${error.message}`); break; }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  ok(`${rows.length} rows`);

  const tally = (fn) => {
    const m = new Map();
    for (const r of rows) { const k = fn(r); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const show = (title, pairs) => {
    console.log(`\n  ${c.bold(title)}`);
    for (const [k, n] of pairs) console.log(`    ${String(n).padStart(5)}  ${k}`);
  };

  show('main_invite_status', tally(r => r.main_invite_status ?? '(null)'));
  show('approved_for',       tally(r => r.approved_for ?? '(null)'));
  show('guest_count',        tally(r => String(r.guest_count ?? '(null)')));
  show('attending',          tally(r => String(r.attending)));
  show('plus_one_status',    tally(r => r.plus_one_status ?? '(null)'));

  /* ── 5. Parties larger than guest_count can express ─────────────────────── */
  console.log(`\n${c.bold('5. records implying a party larger than 2')}`);
  const big = rows
    .map(r => ({ r, ...parsePlusN(r.full_name) }))
    .filter(x => x.n !== null && x.n + 1 > 2);
  if (big.length === 0) {
    ok('no "+N" names found', 'every party fits in guest_count today');
  } else {
    const seats = big.reduce((a, x) => a + x.n + 1, 0);
    const counted = big.reduce((a, x) => a + (x.r.guest_count ?? 0), 0);
    warn(`${big.length} rows carry a "+N" implying ${seats} seats`,
         `guest_count records only ${counted} for them — a shortfall of ${seats - counted}`);
    for (const x of big.slice(0, 25)) {
      console.log(`    ${String(x.r.full_name ?? '').slice(0, 38).padEnd(39)}` +
                  c.dim(`+${String(x.n).padEnd(2)} -> party ${x.n + 1}   guest_count ${x.r.guest_count ?? '-'}` +
                        `   ${isApproved(x.r) ? '' : '(not approved)'}`));
    }
    if (big.length > 25) console.log(c.dim(`    … and ${big.length - 25} more`));
    console.log(c.dim('\n    This is exactly what party_size exists for. Review them with:'));
    console.log(c.dim('      npm run party:report -- --review-only'));
  }

  /* ── 6. Would 0007 conflict? ────────────────────────────────────────────── */
  console.log(`\n${c.bold('6. conflicts with 0007')}`);
  if (partySize === 'present') warn('rsvps.party_size already exists', '0007 will leave it alone (ADD COLUMN IF NOT EXISTS)');
  else ok('rsvps.party_size is free');
  for (const [t, s] of [['guest_passes', passes], ['checkin_events', checkins]]) {
    if (s === 'no-table') ok(`${t} does not exist yet`);
    else warn(`${t} already exists`, '0007 uses CREATE TABLE IF NOT EXISTS');
  }
  const eligible = rows.filter(isApproved).length;
  ok(`${eligible} guests would be eligible for a pass`, 'approved for at least one event');

  const overSized = rows.filter(r => Number.isInteger(r.party_size) && (r.party_size < 0 || r.party_size > 50));
  if (overSized.length) bad(`${overSized.length} rows violate the 0..50 party_size CHECK 0007 adds`);
  else ok('no row would violate the party_size CHECK constraint');

  /* ── Verdict ────────────────────────────────────────────────────────────── */
  console.log(`\n${c.bold('Verdict')}`);
  if (problems) {
    console.log(`  ${c.red(`${problems} blocker(s)`)} and ${warnings} thing(s) to check.`);
    console.log(c.dim('  Resolve the blockers before applying 0007.\n'));
    process.exitCode = 1;
  } else {
    console.log(`  ${c.green('No blockers.')} ${warnings} thing(s) worth reading above.`);
    console.log(c.dim('  For triggers, policies and function bodies, also run:'));
    console.log(c.dim('    supabase/checks/verify_0007_compat.sql  (paste into the SQL editor)\n'));
  }
}

main().catch(err => { console.error(`\n${c.red('Failed')}\n\n${err.message}\n`); process.exitCode = 1; });
