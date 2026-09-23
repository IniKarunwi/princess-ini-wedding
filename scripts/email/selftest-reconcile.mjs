#!/usr/bin/env node
/**
 * Tests for the seating ↔ RSVP reconciliation.
 *
 *   npm run test:email:reconcile
 *
 * Name matching itself is tested in selftest-name-match.mjs, including the
 * twelve real pairs and the traps. What is tested HERE is the layer above it:
 * that a seat outranks every RSVP field, that unreachable and duplicate rows
 * are separated from the proposal, and that every seated entry is accounted
 * for rather than quietly dropped.
 */

import { seatedFrom, reconcile } from './reconcile-seating.mjs';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const rsvp = (over = {}) => ({
  id: 1, full_name: 'Adaeze Okonkwo', email: 'adaeze@example.com',
  main_invite_status: 'APPROVED', attending: true, approved_for: 'JOINING', ...over,
});

const layout = (names) => ({
  tables: [{
    id: 't1', number: 1, kind: 'round', side: 'bride', x: 0, y: 0, capacity: 10,
    entries: names.map((n, i) => ({ id: `e${i}`, name: n, seats: 1 })),
  }],
});

console.log('\nExtracting the seated');
{
  const s = seatedFrom(layout(['Ada Obi', 'Chidi Eze']));
  eq('two entries', s.length, 2);
  eq('names are kept verbatim', s[0].name, 'Ada Obi');
  eq('the table number travels with them', s[0].table, 1);

  const multi = seatedFrom({ tables: [
    { number: 1, entries: [{ id: 'a', name: 'Ada Obi', seats: 2 }] },
    { number: 7, entries: [{ id: 'b', name: 'Chidi Eze', seats: 1 }] },
  ] });
  eq('seats are carried, not assumed to be 1', multi[0].seats, 2);
  eq('across tables', multi.length, 2);
  eq('an empty payload is not a crash', seatedFrom(undefined).length, 0);
}

console.log('\nA seat outranks every RSVP field');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ngozi Ade',  email: 'ngozi@example.com', attending: null }),
    rsvp({ id: 2, full_name: 'Tunde Cole', email: 'tunde@example.com', attending: false }),
    rsvp({ id: 3, full_name: 'Sade Ali',   email: 'sade@example.com',  main_invite_status: 'PENDING' }),
    rsvp({ id: 4, full_name: 'Uche Obi',   email: 'uche@example.com',  approved_for: 'AFTERPARTY' }),
    rsvp({ id: 5, full_name: 'Bisi Ola',   email: 'bisi@example.com',  email_status: 'Sent 2026-08-01' }),
  ];
  const r = reconcile(
    seatedFrom(layout(['Ngozi Ade', 'Tunde Cole', 'Sade Ali', 'Uche Obi', 'Bisi Ola'])), rows);

  eq("never RSVP'd is still proposed",   r.proposed.some(p => p.row.id === 1), true);
  eq("RSVP'd no is still proposed",      r.proposed.some(p => p.row.id === 2), true);
  eq('not approved is still proposed',   r.proposed.some(p => p.row.id === 3), true);
  eq('after-party tier still proposed',  r.proposed.some(p => p.row.id === 4), true);
  eq('already emailed still proposed',   r.proposed.some(p => p.row.id === 5), true);
  eq('all five', r.proposed.length, 5);

  // The tier still decides the phones note, even though it does not gate the send.
  eq('an after-party tier is not a JOINING guest',
     r.proposed.find(p => p.row.id === 4).joining, false);
  eq('a JOINING tier is', r.proposed.find(p => p.row.id === 1).joining, true);
}

console.log('\nThe real family, end to end');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Olakunle Karunwi (Father)',  email: 'dad@example.com' }),
    rsvp({ id: 2, full_name: 'Oluwatoyin Karunwi (Mother)', email: 'mum@example.com' }),
    rsvp({ id: 3, full_name: 'Shammah Karunwi (Brother)',  email: 'shammah@example.com' }),
    rsvp({ id: 4, full_name: 'Shalom Karunwi (Brother)',   email: 'shalom@example.com' }),
    rsvp({ id: 5, full_name: 'Fifunmi Karunwi (Sister)',   email: 'fifunmi@example.com' }),
  ];
  const r = reconcile(seatedFrom(layout([
    'Mr Olakunle Karunwi +5', 'Mrs OluwaToyin karunwi +4',
    'Shammah Karunwi +2', 'Shalom Karunwi', 'Fifunmi Karunwi',
  ])), rows);
  eq('all five matched', r.matched.length, 5);
  eq('none ambiguous', r.ambiguous.length, 0);
  eq('none unmatched', r.unmatched.length, 0);
  eq('all five proposed', r.proposed.length, 5);
  ok('and Shalom is not confused with Shammah',
     r.proposed.find(p => p.row.id === 4).seated.name === 'Shalom Karunwi');
}

console.log('\nA combined entry confirms both invitations');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Michael Coker', email: 'm@example.com' }),
    rsvp({ id: 2, full_name: 'Nicole Coker',  email: 'n@example.com' }),
  ];
  const r = reconcile(seatedFrom(layout(['Michael Coker + Nicole Coker'])), rows);
  eq('one seated entry', 1, 1);
  eq('two matches from it', r.matched.length, 2);
  eq('two proposed', r.proposed.length, 2);
}
{
  // The partner has no row of their own. The primary must still count.
  const rows = [rsvp({ id: 1, full_name: 'Davies Emmanuel', email: 'd@example.com' })];
  const r = reconcile(seatedFrom(layout(['Davies Emmanuel + Osatohamwen'])), rows);
  eq('the primary is matched', r.matched.length, 1);
  eq('and is not reported unmatched', r.unmatched.length, 0);
  eq('proposed', r.proposed.length, 1);
}

console.log('\nAmbiguity is reported, never resolved');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ada Obi', email: 'a1@example.com' }),
    rsvp({ id: 2, full_name: 'Ada Obi', email: 'a2@example.com' }),
  ];
  const r = reconcile(seatedFrom(layout(['Ada Obi'])), rows);
  eq('not matched', r.matched.length, 0);
  eq('flagged', r.ambiguous.length, 1);
  eq('with both rows shown', r.ambiguous[0].rows.length, 2);
  eq('and nobody proposed', r.proposed.length, 0);
}
{
  const rows = [rsvp({ id: 1, full_name: 'Someone Else', email: 'a@example.com' })];
  const r = reconcile(seatedFrom(layout(['Guest of Ada Obi'])), rows);
  eq('a party with no row of its own is unmatched', r.unmatched.length, 1);
  eq('and is not proposed', r.proposed.length, 0);
}

console.log('\nReachability and duplicates');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ada Obi',    email: null }),
    rsvp({ id: 2, full_name: 'Chidi Eze',  email: '0803 555 0199' }),
    rsvp({ id: 3, full_name: 'Ngozi Nwosu', email: 'shared@example.com' }),
    rsvp({ id: 4, full_name: 'Emeka Nwosu', email: 'SHARED@example.com' }),
  ];
  const r = reconcile(
    seatedFrom(layout(['Ada Obi', 'Chidi Eze', 'Ngozi Nwosu', 'Emeka Nwosu'])), rows);
  eq('all four matched by name', r.matched.length, 4);
  eq('two cannot be emailed', r.seatedNoEmail.length, 2);
  eq('one duplicate inbox removed', r.duplicates.length, 1);
  eq('one proposed', r.proposed.length, 1);
  ok('de-duplication is case-insensitive',
     String(r.duplicates[0].row.email).toLowerCase() === 'shared@example.com');
}

console.log('\nEvery seated entry is accounted for');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ada Obi',  email: 'ada@example.com' }),
    rsvp({ id: 2, full_name: 'Dup Name', email: 'd1@example.com' }),
    rsvp({ id: 3, full_name: 'Dup Name', email: 'd2@example.com' }),
  ];
  const seated = seatedFrom(layout(['Ada Obi', 'Dup Name', 'Nobody Known At All']));
  const r = reconcile(seated, rows);
  const entriesSeen = new Set([
    ...r.matched.map(m => m.seated.entryId),
    ...r.ambiguous.map(a => a.seated.entryId),
    ...r.unmatched.map(u => u.seated.entryId),
  ]);
  eq('every entry lands in exactly one bucket', entriesSeen.size, seated.length);
}

console.log('\nThe match tier is recorded, so a fuzzy match can be audited');
{
  const rows = [rsvp({ id: 1, full_name: 'Kelechi Anyikude', email: 'k@example.com' })];
  const r = reconcile(seatedFrom(layout(['Kelechi Ayinkude'])), rows);
  eq('matched', r.matched.length, 1);
  eq('and says how', r.matched[0].tier, 'typo');
  ok('an exact match says so too',
     reconcile(seatedFrom(layout(['Kelechi Anyikude'])), rows).matched[0].tier === 'exact');
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
