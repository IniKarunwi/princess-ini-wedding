#!/usr/bin/env node
/**
 * Offline self-test — exercises the pipeline with no database.
 *
 *   node scripts/sync/selftest.mjs --file ./data/rsvps.xlsx
 *
 * Simulates a Supabase table in memory and asserts the properties that matter:
 * a clean first import, a byte-identical no-op on re-run (idempotency), and
 * correct handling of tier changes and late-arriving contact details.
 */

import { loadSource } from './sources/index.mjs';
import { planSync } from './engine.mjs';
import { deriveTier } from './transform.mjs';
import { phone, sheetKey } from './normalize.mjs';

let failures = 0;
const ok = (cond, label, detail = '') => {
  console.log(`  ${cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${label}${detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''}`);
  if (!cond) failures++;
};

/** Applies a plan to an in-memory table, mimicking what Supabase would store. */
function commit(rows, plan) {
  let id = rows.length;
  for (const i of plan.inserts) rows.push({ id: `sim-${++id}`, ...i.record });
  for (const u of plan.updates) {
    const row = rows.find(r => r.id === u.id);
    Object.assign(row, u.changes);
  }
  return rows;
}

const fileArg = process.argv.indexOf('--file');
const file = fileArg > -1 ? process.argv[fileArg + 1] : './data/rsvps.xlsx';

console.log('\n\x1b[1mUNIT — normalisation\x1b[0m');
ok(phone('08031234567') === '+2348031234567', 'local 0-prefix → E.164', phone('08031234567'));
ok(phone('8031234567') === '+2348031234567', 'bare local → E.164');
ok(phone('+2348031234567') === '+2348031234567', 'already E.164 unchanged');
ok(phone('2348031234567') === '+2348031234567', 'country code, no plus');
ok(phone('+27744123456') === '+27744123456', 'foreign number preserved');
ok(phone('') === null && phone(null) === null, 'blank → null');
ok(sheetKey('  Pastor  Chingtok +3 ') === 'pastor-chingtok-3', 'sheet key slug', sheetKey('  Pastor  Chingtok +3 '));
ok(sheetKey('Aunty Julie +1') === sheetKey('aunty julie +1'), 'sheet key case-insensitive');

console.log('\n\x1b[1mUNIT — tier derivation\x1b[0m');
const cases = [
  ['RECEPTION',   'RECEPTION',  'APPROVED'],
  ['Joining',     'JOINING',    'APPROVED'],
  ['after party', 'AFTERPARTY', 'APPROVED'],
  ['AFTER PARTY', 'AFTERPARTY', 'APPROVED'],
  ['REJECTED',    null,         'REJECTED'],
  ['',            null,         'PENDING'],
  [null,          null,         'PENDING'],
];
for (const [input, tier, status] of cases) {
  const r = deriveTier(input);
  ok(r.tier === tier && r.status === status,
     `${JSON.stringify(input)} → tier=${tier}, ${status}`,
     `got tier=${r.tier}, ${r.status}`);
}

console.log('\n\x1b[1mINTEGRATION — real spreadsheet\x1b[0m');
const source = await loadSource({ file });
console.log(`  \x1b[90msource: ${source.name} · ${source.rows.length} rows\x1b[0m`);

// ── Pass 1: empty database ────────────────────────────────────────────────
const plan1 = planSync(source, []);
console.log(`  \x1b[90mpass 1: +${plan1.inserts.length} inserts, ${plan1.updates.length} updates, ${plan1.skipped.length} skipped\x1b[0m`);
ok(plan1.inserts.length > 0, 'first run inserts guests');
ok(plan1.updates.length === 0, 'first run has no updates (empty table)');
ok(plan1.inserts.length === source.rows.filter(r => r.values.full_name).length,
   'every NAMED row is syncable via sheet_key');
ok(plan1.skipped.every(s => !source.rows.find(r => r.rowNumber === s.rowNumber)?.values?.full_name),
   'only unnamed rows are skipped');

const table = commit([], plan1);

// ── Pass 2: idempotency ───────────────────────────────────────────────────
const plan2 = planSync(source, table);
console.log(`  \x1b[90mpass 2: +${plan2.inserts.length} inserts, ${plan2.updates.length} updates, ${plan2.unchanged.length} unchanged\x1b[0m`);
ok(plan2.inserts.length === 0, 'IDEMPOTENT — re-run inserts nothing');
ok(plan2.updates.length === 0, 'IDEMPOTENT — re-run updates nothing',
   plan2.updates.length ? JSON.stringify(plan2.updates[0].changes) : '');
ok(plan2.unchanged.length === plan1.inserts.length, 'every row recognised as unchanged');

// ── Pass 3: third run, still stable ───────────────────────────────────────
const plan3 = planSync(source, commit(table, plan2));
ok(plan3.inserts.length === 0 && plan3.updates.length === 0, 'stable across three runs');

// ── Behavioural checks ────────────────────────────────────────────────────
console.log('\n\x1b[1mBEHAVIOUR\x1b[0m');

// A name-only guest who later gains an email must UPDATE, not duplicate.
const nameOnly = plan1.inserts.find(i => !i.identifiers.email && !i.identifiers.phone);
if (nameOnly) {
  const mutated = {
    ...source,
    rows: source.rows.map(r =>
      r.rowNumber === nameOnly.rowNumber
        ? { ...r, values: { ...r.values, email: 'newly.added@example.com' } }
        : r),
  };
  const p = planSync(mutated, table);
  const matched = p.updates.find(u => u.rowNumber === nameOnly.rowNumber);
  ok(p.inserts.length === 0, 'late email does not create a duplicate', `(${nameOnly.label})`);
  ok(!!matched && matched.via === 'sheet_key', 'matched via sheet_key and updated in place');
  ok(matched?.changes?.email === 'newly.added@example.com', 'email written to existing row');
} else {
  ok(false, 'fixture: expected at least one name-only guest');
}

// A tier moving to REJECTED must CLEAR approved_for, not leave it stale.
const approved = plan1.inserts.find(i => i.record.approved_for);
if (approved) {
  const mutated = {
    ...source,
    rows: source.rows.map(r =>
      r.rowNumber === approved.rowNumber
        ? { ...r, values: { ...r.values, main: 'REJECTED' } }
        : r),
  };
  const p = planSync(mutated, table);
  const u = p.updates.find(x => x.rowNumber === approved.rowNumber);
  ok(u?.changes?.approved_for === null, 'REJECTED clears approved_for (no stale tier)',
     `was ${approved.record.approved_for}`);
  ok(u?.changes?.main_invite_status === 'REJECTED', 'REJECTED sets main_invite_status');
} else {
  ok(false, 'fixture: expected at least one approved guest');
}

// A tier alongside a pending status is an approval that was never written back.
const promoted = plan1.normalizations.filter(n => n.message.includes('→ APPROVED'));
ok(promoted.length > 0, 'tier + pending status is promoted to APPROVED', `${promoted.length} rows`);
ok(plan1.inserts.every(i =>
     !(i.record.plus_one_approved_for && i.record.plus_one_status === 'PENDING')),
   'no row keeps PENDING while holding an approval tier');
ok(plan1.inserts.every(i =>
     i.record.plus_one_status !== 'PENDING' || !i.record.plus_one_approved_for),
   'PENDING survives only without a tier');
ok(!plan1.warnings.some(w => w.message.includes('contradicts')),
   'promotions are not reported as contradictions');

// guest_count is the database's to compute, never the spreadsheet's.
ok(![...plan1.inserts].some(i => 'guest_count' in i.record),
   'guest_count is never written by the sync');

// Mirrors compute_guest_count() in 0002_guest_count.sql.
const seats = (attending, main, plusStatus) => {
  if ((main || '').toUpperCase() === 'REJECTED') return 0;
  if (attending === false) return 0;
  if ((main || '').toUpperCase() === 'APPROVED' || attending === true) {
    return ['APPROVED', 'ACCEPTED'].includes((plusStatus || '').toUpperCase()) ? 2 : 1;
  }
  return 0;
};
ok(seats(true,  'REJECTED', null)       === 0, 'seats: rejected invite ignores attending=true');
ok(seats(false, 'APPROVED', 'APPROVED') === 0, 'seats: guest declined → 0');
ok(seats(null,  'APPROVED', null)       === 1, 'seats: approved, never RSVP\'d → 1');
ok(seats(true,  'PENDING',  null)       === 1, 'seats: RSVP\'d yes, undecided → 1');
ok(seats(true,  'APPROVED', 'APPROVED') === 2, 'seats: approved + approved +1 → 2');
ok(seats(null,  'PENDING',  null)       === 0, 'seats: nobody decided → 0');

// Protected messaging columns must never be written from a sheet lacking them.
const touchesProtected = [...plan1.inserts, ...plan1.updates].some(i =>
  ['email_status', 'whatsapp_status', 'last_email_sent', 'last_whatsapp_sent']
    .some(c => c in (i.record || i.changes || {})));
ok(!touchesProtected, 'PHASE 3 — messaging columns never written from this sheet');

// Immutable columns must never be written.
const touchesImmutable = plan1.inserts.some(i => 'id' in i.record || 'created_at' in i.record);
ok(!touchesImmutable, 'id and created_at never written');

console.log(failures
  ? `\n\x1b[31m${failures} check(s) failed\x1b[0m\n`
  : '\n\x1b[32mAll checks passed\x1b[0m\n');
process.exitCode = failures ? 1 : 0;
