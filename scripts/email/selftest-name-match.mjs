#!/usr/bin/env node
/**
 * Tests for the seated-name matcher.
 *
 *   npm run test:email:name-match
 *
 * The twelve MUST-MATCH pairs are the real ones from the couple's own
 * reconciliation output. The MUST-NOT-MATCH pairs are the traps that a naive
 * edit-distance threshold falls into — several of them sit at distance 1,
 * closer than some of the pairs that should match, which is the whole reason
 * the typo tier is shaped the way it is rather than being a number.
 */

import {
  words, normalise, splitParty, distance, tierOf, matchOne, buildIndex,
  MIN_TYPO_WORD, MAX_TYPO_DISTANCE,
} from './name-match.mjs';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ── Normalisation ───────────────────────────────────────────────────────── */

console.log('\nNormalisation');
{
  eq('a title', normalise('Mr Olakunle Karunwi'), 'olakunle karunwi');
  eq('a title with a full stop', normalise('Mrs. Oluwatoyin Karunwi'), 'oluwatoyin karunwi');
  eq('a relationship label', normalise('Olakunle Karunwi (Father)'), 'olakunle karunwi');
  eq('a seat count', normalise('Shammah Karunwi +2'), 'shammah karunwi');
  eq('title AND seat count', normalise('Mr Olakunle Karunwi +5'), 'olakunle karunwi');
  eq('mixed case', normalise('Mrs OluwaToyin karunwi +4'), 'oluwatoyin karunwi');
  eq('a hyphen becomes a space', normalise('Victory-Usoro Namah'), 'victory usoro namah');
  eq('doubled spaces', normalise('Ada   Obi'), 'ada obi');

  // A title must not eat the only word left.
  eq('a lone title survives', normalise('Chief'), 'chief');
  eq('a surname that is also a title', normalise('Ada Chief'), 'ada chief');
}

console.log('\nSplitting a combined entry');
{
  const a = splitParty('Michael Coker + Nicole Coker');
  eq('two people', a.length, 2);
  eq('first', a[0], 'Michael Coker');
  eq('second', a[1], 'Nicole Coker');

  eq('a seat count is not a person',
     splitParty('Mr Olakunle Karunwi +5').length, 1);
  eq('ampersand', splitParty('Ada Obi & Chidi Eze').length, 2);
  eq('the word and', splitParty('Ada Obi and Chidi Eze').length, 2);
  eq('a comma is NOT a separator — "Obi, Ada" is one person',
     splitParty('Obi, Ada').length, 1);
}

/* ── The twelve real pairs ───────────────────────────────────────────────── */

console.log('\nThe twelve real pairs — all MUST match');
{
  const cases = [
    ['Olakunle Karunwi (Father)',            'Mr Olakunle Karunwi +5'],
    ['Oluwatoyin Karunwi (Mother)',          'Mrs OluwaToyin karunwi +4'],
    ['Shammah Karunwi (Brother)',            'Shammah Karunwi +2'],
    ['Shalom Karunwi (Brother)',             'Shalom Karunwi'],
    ['Fifunmi Karunwi (Sister)',             'Fifunmi Karunwi'],
    ['Abadi Emmanuel',                       'Emmanuel Abadi'],
    ['Kelechi Ayinkude',                     'Kelechi Anyikude'],
    ['Emediong Uko',                         'Emediong Emily Uko'],
    ['Toluwanimi Adesiya',                   'Toluwanimi Adesiyan'],
    ['Michael Coker + Nicole Coker',         'Michael Coker'],
    ['Jacob James Namah + Victory-Usoro Namah', 'Jacob James Namah'],
    ['Davies Emmanuel + Osatohamwen',        'Davies Emmanuel'],
  ];
  for (const [seated, rsvp] of cases) {
    const index = buildIndex([{ full_name: rsvp, email: 'x@example.com' }]);
    const r = matchOne(seated, index);
    ok(`${seated}  ↔  ${rsvp}`,
       r.matches.length === 1,
       r.ambiguity ? `ambiguous at ${r.ambiguity.tier}` : 'no match');
    if (r.matches.length === 1) {
      console.log(`      ${'via ' + r.matches[0].tier}`);
    }
  }
}

/* ── The traps ───────────────────────────────────────────────────────────── */

console.log('\nPairs that MUST NOT match');
{
  const traps = [
    ['Ada Obi',         'Ade Obi',          'one letter, but a three-letter first name'],
    ['John Smith',      'Joan Smith',       'one letter, short first name'],
    ['Chidi Eze',       'Chidi Eke',        'one letter, three-letter surname'],
    ['Shalom Karunwi',  'Shammah Karunwi',  'two real siblings'],
    ['Emmanuel',        'Emmanuel Abadi',   'a single word must not claim a full name'],
    ['Ada Obi',         'Ada Obiora',       'a longer surname is a different name'],
    ['Peter Okafor',    'Paul Okafor',      'different first names, same surname'],
  ];
  for (const [seated, rsvp, why] of traps) {
    const index = buildIndex([{ full_name: rsvp, email: 'x@example.com' }]);
    const r = matchOne(seated, index);
    ok(`${seated}  ✗  ${rsvp}  (${why})`,
       r.matches.length === 0,
       r.matches.length ? `matched via ${r.matches[0].tier}` : '');
  }
}

console.log('\nWhy a distance threshold alone cannot work');
{
  // Recorded so the calibration is visible, not asserted from memory.
  const shouldMatch = distance('adesiya', 'adesiyan');
  const mustNot = distance('ada', 'ade');
  eq('a pair that should match is distance 1', shouldMatch, 1);
  eq('a pair that must not is ALSO distance 1', mustNot, 1);
  ok('so the rule is word length, not distance', MIN_TYPO_WORD === 6);
  ok('with a distance cap as well', MAX_TYPO_DISTANCE === 2);
  eq('a transposition counts as one edit', distance('anyikude', 'aniykude'), 1);
  eq('the real transposed pair is within the cap',
     distance('ayinkude', 'anyikude') <= MAX_TYPO_DISTANCE, true);
}

/* ── Tier order and uniqueness ───────────────────────────────────────────── */

console.log('\nTiers');
{
  eq('exact beats everything', tierOf(words('Ada Obi'), words('Ada Obi')), 'exact');
  eq('reordered', tierOf(words('Abadi Emmanuel'), words('Emmanuel Abadi')), 'reordered');
  eq('subset', tierOf(words('Emediong Uko'), words('Emediong Emily Uko')), 'subset');
  eq('typo', tierOf(words('Kelechi Ayinkude'), words('Kelechi Anyikude')), 'typo');
  eq('nothing', tierOf(words('Ada Obi'), words('Chidi Eze')), null);
}

console.log('\nUniqueness — two candidates is ambiguity, not a coin toss');
{
  const index = buildIndex([
    { full_name: 'Ada Obi', email: 'a1@example.com' },
    { full_name: 'Ada Obi', email: 'a2@example.com' },
  ]);
  const r = matchOne('Ada Obi', index);
  eq('not matched', r.matches.length, 0);
  ok('flagged as ambiguous', !!r.ambiguity);
  eq('at the exact tier', r.ambiguity.tier, 'exact');
  eq('with both rows', r.ambiguity.rows.length, 2);
}
{
  // Two people could each be a "subset" of the seated name. Refuse.
  const index = buildIndex([
    { full_name: 'Emediong Uko', email: 'a@example.com' },
    { full_name: 'Emily Uko', email: 'b@example.com' },
  ]);
  const r = matchOne('Emediong Emily Uko', index);
  ok('two subset candidates is ambiguity', r.matches.length === 0 && !!r.ambiguity,
     r.matches.length ? `matched ${r.matches[0].row.full_name}` : '');
}
{
  // An exact match must win over a speculative one on another row.
  const index = buildIndex([
    { full_name: 'Kelechi Anyikude', email: 'typo@example.com' },
    { full_name: 'Kelechi Ayinkude', email: 'exact@example.com' },
  ]);
  const r = matchOne('Kelechi Ayinkude', index);
  eq('the exact row wins', r.matches[0]?.row.email, 'exact@example.com');
  eq('via exact', r.matches[0]?.tier, 'exact');
}

console.log('\nA combined entry can confirm two invitations');
{
  const index = buildIndex([
    { full_name: 'Michael Coker', email: 'm@example.com' },
    { full_name: 'Nicole Coker', email: 'n@example.com' },
  ]);
  const r = matchOne('Michael Coker + Nicole Coker', index);
  eq('both matched', r.matches.length, 2);
  ok('and they are the two different rows',
     new Set(r.matches.map(m => m.row.email)).size === 2);
}
{
  // A part with no row of its own must not invalidate the part that matched.
  const index = buildIndex([{ full_name: 'Davies Emmanuel', email: 'd@example.com' }]);
  const r = matchOne('Davies Emmanuel + Osatohamwen', index);
  eq('the primary still matches', r.matches.length, 1);
  eq('and it is the right row', r.matches[0].row.email, 'd@example.com');
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
