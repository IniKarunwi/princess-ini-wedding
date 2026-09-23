#!/usr/bin/env node
/**
 * Tests for the union audience rule.
 *
 *   npm run test:email:union
 *
 * Name matching is tested in selftest-name-match.mjs and the seating layer in
 * selftest-reconcile.mjs. What is tested HERE is the union itself, and in
 * particular the four properties the rule exists to guarantee:
 *
 *   1. nobody qualifying under the RSVP rule is ever removed
 *   2. a seat can only ADD, and only when the match is unique and reachable
 *   3. JOINING comes from approved_for and never from a seat
 *   4. the withheld name is held back and reported, not silently dropped
 */

import { unionAudience, eventsForRecipient, WITHHELD } from './union-audience.mjs';
import { seatedFrom } from './reconcile-seating.mjs';
import { classifyForFinalDetails } from './final-details-recipients.mjs';
import { eventsForGuest } from './events.mjs';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/** A row that passes today's rule. Override to break it in one specific way. */
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

const seats = (names) => seatedFrom(layout(names));
const emails = (entries) => entries.map(e => String(e.row.email).toLowerCase()).sort();

/* ── 1 · Set A is preserved, always ──────────────────────────────────────── */

console.log('\nThe original rule is preserved in full');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Adaeze Okonkwo', email: 'a@example.com' }),
    rsvp({ id: 2, full_name: 'Chidi Eze',      email: 'c@example.com' }),
    rsvp({ id: 3, full_name: 'Ngozi Nwosu',    email: 'n@example.com' }),
  ];
  // An empty seating plan. Under the seating-only proposal this was zero.
  const u = unionAudience(rows, seats([]));
  eq('all three survive an empty seating plan', u.original.length, 3);
  eq('and are the whole audience', u.audience.length, 3);
  eq('nothing was added', u.additions.length, 0);
}
{
  const rows = [
    rsvp({ id: 1, full_name: 'Adaeze Okonkwo', email: 'a@example.com' }),
    rsvp({ id: 2, full_name: 'Chidi Eze',      email: 'c@example.com' }),
  ];
  // Only one of them is seated, and the other is seated under a name that
  // cannot be matched. Neither is a reason to remove anybody.
  const u = unionAudience(rows, seats(['Adaeze Okonkwo', 'The Eze Family']));
  eq('the unmatched recipient is still a recipient', u.audience.length, 2);
  ok('and is not in any removal list', !('removed' in u));
  eq('the unmatchable seat is reported instead', u.refused.unmatched.length, 1);
}
{
  // The regression the union exists to prevent: a seating miss costing a
  // recipient. 5 qualify, 1 is seated. The answer must be 5, never 1.
  const rows = [1, 2, 3, 4, 5].map(i =>
    rsvp({ id: i, full_name: `Guest ${'ABCDE'[i - 1]}yeni`, email: `g${i}@example.com` }));
  const u = unionAudience(rows, seats(['Guest Ayeni']));
  eq('five qualify, one is seated → five recipients', u.audience.length, 5);
}

/* ── 2 · Set B adds, and only when it should ─────────────────────────────── */

console.log('\nA seat adds someone the rule misses');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Adaeze Okonkwo', email: 'a@example.com' }),
    rsvp({ id: 2, full_name: 'Ngozi Ade',  email: 'ngozi@example.com', attending: null }),
    rsvp({ id: 3, full_name: 'Sade Ali',   email: 'sade@example.com',  main_invite_status: 'PENDING' }),
    rsvp({ id: 4, full_name: 'Uche Obi',   email: 'uche@example.com',  approved_for: 'AFTERPARTY' }),
    rsvp({ id: 5, full_name: 'Bisi Ola',   email: 'bisi@example.com',  plus_one_requested: true }),
  ];
  const u = unionAudience(rows, seats(
    ['Adaeze Okonkwo', 'Ngozi Ade', 'Sade Ali', 'Uche Obi', 'Bisi Ola']));

  eq('one qualified under the rule', u.original.length, 1);
  eq('four seats added the rest', u.additions.length, 4);
  eq('five in total', u.audience.length, 5);
  ok('the already-qualified guest was not added twice',
     u.additions.every(e => e.row.id !== 1));
  ok('and keeps the rule as its source',
     u.original[0].source === 'rsvp-rule');
  ok('every addition says which seat justified it',
     u.additions.every(e => e.seated && e.tier));
  ok('every addition was genuinely excluded by the rule',
     u.additions.every(e => classifyForFinalDetails(e.row).send === false));
}

console.log('\nA seat cannot add someone unreachable or uncertain');
{
  const rows = [
    rsvp({ id: 1, full_name: 'No Inbox',   email: null,         attending: null }),
    rsvp({ id: 2, full_name: 'Bad Inbox',  email: '0803 555 01', attending: null }),
    rsvp({ id: 3, full_name: 'Twin Name',  email: 't1@example.com', attending: null }),
    rsvp({ id: 4, full_name: 'Twin Name',  email: 't2@example.com', attending: null }),
  ];
  const u = unionAudience(rows, seats(['No Inbox', 'Bad Inbox', 'Twin Name', 'Total Stranger']));
  eq('nobody was added', u.additions.length, 0);
  eq('two are unreachable', u.refused.noEmail.length, 2);
  eq('one name is ambiguous', u.refused.ambiguous.length, 1);
  eq('one seat matches no row at all', u.refused.unmatched.length, 1);
  eq('the audience is empty, not guessed at', u.audience.length, 0);
}

console.log('\nAn inbox is only written to once');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Ngozi Nwosu', email: 'shared@example.com' }),
    rsvp({ id: 2, full_name: 'Emeka Nwosu', email: 'SHARED@example.com' }),
    rsvp({ id: 3, full_name: 'Seated Only', email: 'shared@example.com', attending: null }),
  ];
  const u = unionAudience(rows, seats(['Ngozi Nwosu', 'Emeka Nwosu', 'Seated Only']));
  eq('one recipient', u.audience.length, 1);
  eq('two duplicates reported', u.duplicates.length, 2);
  ok('de-duplication is case-insensitive',
     u.duplicates.some(d => d.row.email === 'SHARED@example.com'));
  ok('and the seated duplicate is attributed to seating',
     u.duplicates.some(d => d.from === 'seating'));
  eq('the seated duplicate did not become an addition', u.additions.length, 0);
}
{
  // One person named at two tables. Being seen twice is not two facts: they
  // are one recipient, and they are not their own duplicate.
  const rows = [rsvp({ id: 1, full_name: 'Uche Obi', email: 'u@example.com', attending: null })];
  const u = unionAudience(rows, seats(['Uche Obi', 'Uche Obi +2']));
  eq('added once', u.additions.length, 1);
  eq('and not reported as a duplicate of themselves', u.duplicates.length, 0);
  eq('one recipient', u.audience.length, 1);
}
{
  // A guest already in Set A who is also seated. The seat is recorded for the
  // report, but the source — and so the letter — stays with the rule.
  const rows = [rsvp({ id: 1, full_name: 'Adaeze Okonkwo', email: 'a@example.com' })];
  const u = unionAudience(rows, seats(['Adaeze Okonkwo +3']));
  eq('still one recipient', u.audience.length, 1);
  eq('no addition', u.additions.length, 0);
  eq('the source stays with the rule', u.audience[0].source, 'rsvp-rule');
  eq('but the seat is recorded for the report', u.audience[0].seated.table, 1);
}

/* ── 3 · JOINING never comes from a seat ─────────────────────────────────── */

console.log('\nJOINING is read from approved_for and nowhere else');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Reception Only', email: 'r@example.com',
           approved_for: 'RECEPTION', attending: null }),
    rsvp({ id: 2, full_name: 'Ceremony Guest', email: 'j@example.com',
           approved_for: 'JOINING', attending: null }),
  ];
  // Both hold a seat at the same table. The seat must not level them up.
  const u = unionAudience(rows, seats(['Reception Only', 'Ceremony Guest']));
  eq('both added', u.additions.length, 2);
  eq('the reception tier stays reception-only',
     u.additions.find(e => e.row.id === 1).joining, false);
  eq('the JOINING tier is JOINING',
     u.additions.find(e => e.row.id === 2).joining, true);
  eq('counted', u.joining, 1);
  eq('and counted', u.receptionOnly, 1);
  eq('the two counts cover the whole audience',
     u.joining + u.receptionOnly, u.audience.length);
}
{
  // An after-party-only guest with a reception seat. Still not a ceremony guest.
  const rows = [rsvp({ id: 1, full_name: 'Late Arrival', email: 'l@example.com',
                       approved_for: 'AFTERPARTY', attending: null })];
  const u = unionAudience(rows, seats(['Late Arrival']));
  eq('added by the seat', u.additions.length, 1);
  eq('but not to the ceremony', u.additions[0].joining, false);
}

console.log('\nWhat a seat grants, and what it can never grant');
{
  const rows = [
    rsvp({ id: 1, full_name: 'After Party Only', email: 'ap@example.com',
           approved_for: 'AFTERPARTY', attending: null }),
    rsvp({ id: 2, full_name: 'Ceremony Guest', email: 'j@example.com',
           approved_for: 'JOINING', attending: null }),
    rsvp({ id: 3, full_name: 'Rule A Guest', email: 'a@example.com',
           approved_for: 'RECEPTION' }),
  ];
  const u = unionAudience(rows, seats(['After Party Only', 'Ceremony Guest', 'Rule A Guest']));
  const keysFor = (id) => eventsForRecipient(
    u.audience.find(e => e.row.id === id)).map(e => e.key);

  // The seat is the evidence that they are coming to lunch, so the letter
  // about lunch has to say so.
  ok('a seat grants RECEPTION to an after-party tier',
     keysFor(1).includes('RECEPTION'), keysFor(1).join('+'));
  ok('and does not take away what they already had',
     keysFor(1).includes('AFTERPARTY'));
  ok('but it does NOT grant the ceremony',
     !keysFor(1).includes('JOINING'), keysFor(1).join('+'));

  ok('a JOINING tier keeps the ceremony — from approved_for, not the seat',
     keysFor(2).includes('JOINING'));

  // A rule A recipient's letter must be exactly what it was before any of
  // this existed.
  const entry = u.audience.find(e => e.row.id === 3);
  eq('a rule A recipient is untouched by seating',
     eventsForRecipient(entry).map(e => e.key).join('+'),
     eventsForGuest(entry.row).map(e => e.key).join('+'));
}
{
  // Exhaustive: no tier, seated, can ever come out holding JOINING.
  for (const tier of ['RECEPTION', 'AFTERPARTY', 'Reception + After Party', null, 'nonsense']) {
    const rows = [rsvp({ id: 1, full_name: 'Seated Guest', email: 's@example.com',
                         approved_for: tier, attending: null })];
    const u = unionAudience(rows, seats(['Seated Guest']));
    const added = u.additions[0];
    ok(`a seat + tier "${tier}" never yields JOINING`,
       !added || !eventsForRecipient(added).some(e => e.key === 'JOINING'));
    if (added) ok(`  …and is counted reception-only`, added.joining === false);
  }
}

/* ── 4 · The withheld name ───────────────────────────────────────────────── */

console.log('\nTunde Adeleke is held back, and reported');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Tunde Adeleke', email: 'tunde@example.com', attending: false }),
    rsvp({ id: 2, full_name: 'Adaeze Okonkwo', email: 'a@example.com', attending: null }),
  ];
  const u = unionAudience(rows, seats(['Mr Tunde Adeleke +1', 'Adaeze Okonkwo']));
  eq('not added', u.additions.length, 1);
  ok('and the one added is not him', u.additions[0].row.id === 2);
  eq('he is reported separately', u.withheld.length, 1);
  eq('by name', u.withheld[0].row.full_name, 'Tunde Adeleke');
  ok('with a reason', /RSVP/.test(u.withheld[0].reason));
  ok('and with his seat, so the decision can be made',
     u.withheld[0].seated.name === 'Mr Tunde Adeleke +1');
  ok('he is not in the audience',
     !emails(u.audience).includes('tunde@example.com'));
  eq('the withhold list is the one place he is named', WITHHELD.length, 1);
}
{
  // A title and a seat count must not smuggle him past the withhold list.
  const rows = [rsvp({ id: 1, full_name: 'Mr Tunde Adeleke', email: 't@example.com', attending: false })];
  const u = unionAudience(rows, seats(['Tunde Adeleke']));
  eq('a title does not defeat the hold', u.withheld.length, 1);
  eq('nothing added', u.additions.length, 0);
}
{
  // Someone who merely shares a first name must NOT be caught by the hold.
  const rows = [rsvp({ id: 1, full_name: 'Tunde Bakare', email: 'tb@example.com', attending: null })];
  const u = unionAudience(rows, seats(['Tunde Bakare']));
  eq('a different Tunde is added normally', u.additions.length, 1);
  eq('and is not withheld', u.withheld.length, 0);
}
{
  // If he ever qualifies under the RSVP rule, the hold does not remove him —
  // the hold governs AUTOMATIC ADDITION only, and Set A is never trimmed.
  const rows = [rsvp({ id: 1, full_name: 'Tunde Adeleke', email: 't@example.com', attending: true })];
  const u = unionAudience(rows, seats(['Tunde Adeleke']));
  eq('the hold does not remove a qualifying recipient', u.audience.length, 1);
  eq('and he is not double-reported', u.withheld.length, 0);
}

/* ── 5 · The union never shrinks the original ────────────────────────────── */

console.log('\nNo real recipient is ever mistaken for a test send');
{
  // The sender decides between a stable guest idempotency key and a
  // per-run test key on entry.source === 'test'. A guest carrying that
  // source would get a key that changes every run, and a second run would
  // email them a second time. Nothing here may produce it.
  const rows = [
    rsvp({ id: 1, full_name: 'Adaeze Okonkwo', email: 'a@example.com' }),
    rsvp({ id: 2, full_name: 'Seated Guest', email: 's@example.com', attending: null }),
  ];
  const u = unionAudience(rows, seats(['Adaeze Okonkwo', 'Seated Guest']));
  ok('every source is rsvp-rule or seating',
     u.audience.every(e => e.source === 'rsvp-rule' || e.source === 'seating'),
     u.audience.map(e => e.source).join(', '));
  ok('none is "test"', !u.audience.some(e => e.source === 'test'));
}

console.log('\nThe invariant, stated as a test');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Adaeze Okonkwo', email: 'a@example.com' }),
    rsvp({ id: 2, full_name: 'Chidi Eze',      email: 'c@example.com' }),
    rsvp({ id: 3, full_name: 'Ngozi Nwosu',    email: 'n@example.com' }),
    rsvp({ id: 4, full_name: 'Uche Obi', email: 'u@example.com', attending: null }),
  ];
  for (const plan of [
    [],
    ['Adaeze Okonkwo'],
    ['Nobody At All', 'Another Stranger'],
    ['Uche Obi'],
    ['Adaeze Okonkwo', 'Chidi Eze', 'Ngozi Nwosu', 'Uche Obi'],
  ]) {
    const u = unionAudience(rows, seats(plan));
    const audienceEmails = new Set(emails(u.audience));
    const everyOriginalSurvives = u.original.every(e =>
      audienceEmails.has(String(e.row.email).toLowerCase()));
    ok(`audience ⊇ original, plan of ${plan.length} seat(s)`,
       everyOriginalSurvives && u.audience.length >= u.original.length,
       `${u.original.length} original vs ${u.audience.length} final`);
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
