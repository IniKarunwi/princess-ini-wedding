#!/usr/bin/env node
/**
 * Tests for the seating ↔ RSVP reconciliation.
 *
 *   npm run test:email:reconcile
 *
 * The thing worth testing here is what the matcher REFUSES to do. An exact
 * matcher that accidentally matches is worse than no matcher, because the
 * report would look clean while quietly proposing to email a stranger.
 */

import { normalise, seatedFrom, reconcile } from './reconcile-seating.mjs';

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

console.log('\nNormalisation — only what is unambiguously the same person');
{
  eq('case', normalise('ADA OBI'), 'ada obi');
  eq('doubled spaces', normalise('Ada   Obi'), 'ada obi');
  eq('surrounding whitespace', normalise('  Ada Obi  '), 'ada obi');
  eq('a seat count typed into the name', normalise('Pastor Chingtok +3'), 'pastor chingtok');
  eq('punctuation from a paste', normalise('Ada Obi,'), 'ada obi');
  eq('full stops in an initial', normalise('A. B. Obi'), 'a b obi');

  // The things it must NOT do.
  ok('a title is NOT stripped', normalise('Pastor Chingtok') !== normalise('Chingtok'));
  ok('name order is NOT rearranged', normalise('Obi Ada') !== normalise('Ada Obi'));
  ok('a missing middle name is NOT ignored',
     normalise('Ada Ngozi Obi') !== normalise('Ada Obi'));
  ok('a spelling difference is NOT forgiven',
     normalise('Adaeze Okonkwo') !== normalise('Adaeza Okonkwo'));
}

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
}

console.log('\nMatching');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ada Obi', email: 'ada@example.com' }),
    rsvp({ id: 2, full_name: 'Chidi Eze', email: 'chidi@example.com', approved_for: 'RECEPTION' }),
  ];
  const r = reconcile(seatedFrom(layout(['Ada Obi', 'Chidi Eze'])), rows);
  eq('both matched', r.matched.length, 2);
  eq('none ambiguous', r.ambiguous.length, 0);
  eq('none unmatched', r.unmatched.length, 0);
  eq('both proposed', r.proposed.length, 2);
  eq('JOINING is read from the RSVP row', r.proposed[0].joining, true);
  eq('and reception-only is too', r.proposed[1].joining, false);
}

console.log('\nA seat outranks RSVP state');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ngozi Ade', email: 'ngozi@example.com', attending: null }),
    rsvp({ id: 2, full_name: 'Tunde Cole', email: 'tunde@example.com', attending: false }),
    rsvp({ id: 3, full_name: 'Sade Ali', email: 'sade@example.com', main_invite_status: 'PENDING' }),
    rsvp({ id: 4, full_name: 'Uche Obi', email: 'uche@example.com', approved_for: 'AFTERPARTY' }),
    rsvp({ id: 5, full_name: 'Bisi Ola', email: 'bisi@example.com', email_status: 'Sent 2026-08-01' }),
  ];
  const seated = seatedFrom(layout(['Ngozi Ade', 'Tunde Cole', 'Sade Ali', 'Uche Obi', 'Bisi Ola']));
  const r = reconcile(seated, rows);
  eq('never RSVP\'d is still proposed', r.proposed.some(p => p.row.id === 1), true);
  eq('RSVP\'d no is still proposed — they hold a seat', r.proposed.some(p => p.row.id === 2), true);
  eq('not approved is still proposed', r.proposed.some(p => p.row.id === 3), true);
  eq('after-party tier is still proposed', r.proposed.some(p => p.row.id === 4), true);
  eq('already emailed is still proposed', r.proposed.some(p => p.row.id === 5), true);
  eq('all five', r.proposed.length, 5);

  // But the tier still decides the phones note.
  eq('an after-party tier is not a JOINING guest',
     r.proposed.find(p => p.row.id === 4).joining, false);
}

console.log('\nWhat it refuses to do');
{
  // Two rows, one name. Emailing either would be a guess.
  const rows = [
    rsvp({ id: 1, full_name: 'Ada Obi', email: 'ada1@example.com' }),
    rsvp({ id: 2, full_name: 'ada obi', email: 'ada2@example.com' }),
  ];
  const r = reconcile(seatedFrom(layout(['Ada Obi'])), rows);
  eq('an ambiguous name is not matched', r.matched.length, 0);
  eq('it is flagged instead', r.ambiguous.length, 1);
  eq('with both rows shown', r.ambiguous[0].rows.length, 2);
  eq('and nobody is proposed from it', r.proposed.length, 0);
}
{
  // A near miss must NOT match, but should offer candidates.
  const rows = [rsvp({ id: 1, full_name: 'Adaeze Okonkwo', email: 'a@example.com' })];
  const r = reconcile(seatedFrom(layout(['Adaeze Okonkw'])), rows);
  eq('a one-letter difference does not match', r.matched.length, 0);
  eq('it is unmatched', r.unmatched.length, 1);
  ok('but a candidate is offered for review', r.unmatched[0].candidates.length > 0);
  eq('the candidate is not applied', r.proposed.length, 0);
}
{
  const rows = [rsvp({ id: 1, full_name: 'Chingtok Bala', email: 'a@example.com' })];
  const r = reconcile(seatedFrom(layout(['Pastor Chingtok Bala'])), rows);
  eq('a title makes it unmatched, not matched', r.unmatched.length, 1);
  ok('with the likely row offered', r.unmatched[0].candidates.some(x => x.row.id === 1));
}
{
  const rows = [rsvp({ id: 1, full_name: 'Someone Else', email: 'a@example.com' })];
  const r = reconcile(seatedFrom(layout(['Guest of Ada Obi'])), rows);
  eq('a plus-one entry with no row of its own is unmatched', r.unmatched.length, 1);
  eq('and is not proposed', r.proposed.length, 0);
}

console.log('\nReachability and duplicates');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ada Obi', email: null }),
    rsvp({ id: 2, full_name: 'Chidi Eze', email: '0803 555 0199' }),
    rsvp({ id: 3, full_name: 'Ngozi Eze', email: 'shared@example.com' }),
    rsvp({ id: 4, full_name: 'Emeka Eze', email: 'SHARED@example.com' }),
  ];
  const r = reconcile(
    seatedFrom(layout(['Ada Obi', 'Chidi Eze', 'Ngozi Eze', 'Emeka Eze'])), rows);
  eq('all four matched by name', r.matched.length, 4);
  eq('two cannot be emailed', r.seatedNoEmail.length, 2);
  eq('one duplicate inbox removed', r.duplicates.length, 1);
  eq('one proposed', r.proposed.length, 1);
  ok('de-duplication is case-insensitive',
     r.duplicates[0].row.email.toLowerCase() === 'shared@example.com');
}

console.log('\nEvery seated entry is accounted for');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ada Obi', email: 'ada@example.com' }),
    rsvp({ id: 2, full_name: 'Dup Name', email: 'd1@example.com' }),
    rsvp({ id: 3, full_name: 'Dup Name', email: 'd2@example.com' }),
  ];
  const seated = seatedFrom(layout(['Ada Obi', 'Dup Name', 'Nobody Known']));
  const r = reconcile(seated, rows);
  eq('matched + ambiguous + unmatched = seated',
     r.matched.length + r.ambiguous.length + r.unmatched.length, seated.length);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
