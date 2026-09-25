#!/usr/bin/env node
/**
 * The one-off "1 Day to Go" send.
 *
 *   npm run test:email:one-more-day
 *
 * Two things are being defended, and they pull in opposite directions:
 *
 *   · it must reach exactly six named addresses and nobody else, however the
 *     RSVP table happens to look;
 *   · and each of those six must get the right letter, which does depend on
 *     the RSVP table.
 *
 * So the audience is asserted to be inert to the data, and the CONTENT is
 * asserted to follow it.
 */

import {
  RECIPIENTS, CAMPAIGN, DAYS, SUBJECT, HEADLINE, classify,
} from './one-more-day.mjs';
import { DAYS_TO_GO, subjectFinal } from './config.mjs';
import { renderFinalDetails } from './final-details.mjs';
import { CAMPAIGN as MAIN_CAMPAIGN, idempotencyKey } from './idempotency.mjs';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const rsvp = (over = {}) => ({
  id: 1, full_name: 'Adaeze Okonkwo', email: 'a@example.com',
  main_invite_status: 'APPROVED', attending: true, approved_for: 'JOINING', ...over,
});

/* ── The audience cannot move ────────────────────────────────────────────── */

console.log('\nSix addresses, and no way to get a seventh');
{
  eq('six', RECIPIENTS.length, 6);
  ok('frozen', Object.isFrozen(RECIPIENTS));
  ok('they are the six given', RECIPIENTS.join(',') === [
    'umohandikanbassey@gmail.com',
    'victorinyang2@gmail.com',
    'gracestevev@gmail.com',
    'clairebensonidoko@gmail.com',
    'fabiangabriel807@gmail.com',
    'Olamie23@gmail.com',
  ].join(','), RECIPIENTS.join(','));
  eq('no duplicates', new Set(RECIPIENTS.map(a => a.toLowerCase())).size, 6);

  // An RSVP table full of approved, attending, reception guests must not add
  // a single recipient. This is the property that keeps a one-off one-off.
  const crowd = Array.from({ length: 140 }, (_, i) =>
    rsvp({ id: i + 100, full_name: `Guest ${i}`, email: `guest${i}@example.com` }));
  const verdicts = classify(RECIPIENTS, crowd);
  eq('140 qualifying rows add nobody', verdicts.length, 6);
  ok('and the addresses are still ours',
     verdicts.every((v, i) => v.address === RECIPIENTS[i]));
}

/* ── Classification follows the data ─────────────────────────────────────── */

console.log('\nEach of the six gets the letter their tier earns');
{
  const rows = [
    rsvp({ id: 1, full_name: 'Umoh Andikan Bassey', email: 'umohandikanbassey@gmail.com',
           approved_for: 'JOINING' }),
    rsvp({ id: 2, full_name: 'Victor Inyang', email: 'victorinyang2@gmail.com',
           approved_for: 'RECEPTION' }),
    // Case and spacing differ from the list. An address is an address.
    rsvp({ id: 3, full_name: 'Grace Steve', email: '  GraceStevev@Gmail.com ',
           approved_for: 'JOINING' }),
    rsvp({ id: 4, full_name: 'Claire Benson-Idoko', email: 'clairebensonidoko@gmail.com',
           approved_for: 'Reception + After Party' }),
    // Not in the table at all.
    rsvp({ id: 5, full_name: 'Someone Else', email: 'nobody@example.com' }),
  ];
  const v = classify(RECIPIENTS, rows);
  const at = (addr) => v.find(x => x.address === addr);

  eq('a JOINING tier is JOINING', at('umohandikanbassey@gmail.com').joining, true);
  eq('a RECEPTION tier is not', at('victorinyang2@gmail.com').joining, false);
  ok('matching ignores case and stray spaces', at('gracestevev@gmail.com').matched,
     at('gracestevev@gmail.com').reason);
  eq('…and reads its tier', at('gracestevev@gmail.com').joining, true);
  eq('a combined tier is parsed, not guessed at',
     at('clairebensonidoko@gmail.com').events.map(e => e.key).join('+'),
     'RECEPTION+AFTERPARTY');
  eq('and is not a ceremony guest', at('clairebensonidoko@gmail.com').joining, false);

  const missing = at('fabiangabriel807@gmail.com');
  eq('an address with no row is not matched', missing.matched, false);
  ok('and says why', /no RSVP row/.test(missing.reason), missing.reason);
  ok('it is not guessed into JOINING', !missing.joining);
  eq('every address is accounted for', v.length, 6);
}

console.log('\nTwo rows on one address is reported, never resolved');
{
  const rows = [
    rsvp({ id: 1, full_name: 'One Person', email: 'Olamie23@gmail.com' }),
    rsvp({ id: 2, full_name: 'Another Person', email: 'olamie23@gmail.com' }),
  ];
  const v = classify(RECIPIENTS, rows).find(x => x.address === 'Olamie23@gmail.com');
  eq('not matched', v.matched, false);
  eq('flagged ambiguous', v.ambiguous, true);
  eq('with both rows shown', v.rows.length, 2);
  ok('and no tier is inferred', !v.joining);
}

/* ── What the letter says ────────────────────────────────────────────────── */

console.log('\nOne day, in the subject and in the letter');
{
  eq('the subject is exactly what was asked for',
     SUBJECT, '1 Day to Go! \u{1F48D} · Final Details for Our Wedding');
  eq('DAYS is 1', DAYS, 1);
  ok('and the main campaign still says 2 — this did not move it', DAYS_TO_GO === 2);

  const row = rsvp({ full_name: 'Umoh Andikan Bassey', approved_for: 'JOINING' });
  const r = renderFinalDetails(row, {
    siteUrl: 'https://princessandini.com', days: DAYS, headline: HEADLINE });
  eq('the render reports one day', r.days, 1);
  ok('the masthead matches the subject', /1 Day to Go/.test(r.html),
     r.html.match(/>[^<]*Day to Go[^<]*</)?.[0]);
  ok('and does not say "One Day to Go", which would disagree with it',
     !/One Day to Go/.test(r.html));
  ok('the opening says 1 day, singular', /It&rsquo;s 1 day to our wedding/.test(r.html));
  ok('and so does the plain text', r.text.includes("It's 1 day to our wedding"));
  ok('no "2 days" survives', !/\b2 days?\b/i.test(r.html + r.text));

  // Without the override the letter is untouched — the 140 still say two.
  const untouched = renderFinalDetails(row, { siteUrl: 'https://princessandini.com' });
  eq('the default is still the constant', untouched.days, DAYS_TO_GO);
  ok('which still reads 2 days', /It&rsquo;s 2 days to our wedding/.test(untouched.html));
}

console.log('\nThe ceremony section follows the tier, not the list');
{
  for (const [tier, wants] of [['JOINING', true], ['RECEPTION', false], ['AFTERPARTY', false]]) {
    const r = renderFinalDetails(rsvp({ approved_for: tier }),
      { siteUrl: 'https://princessandini.com', days: DAYS });
    eq(`${tier} → ceremony section ${wants}`, r.ceremony, wants);
  }
  // An unmatched address gets the reception-only letter: it can never show
  // the ceremony to somebody who was not invited to it.
  const unknown = renderFinalDetails({ full_name: null, email: 'x@y.com' },
    { siteUrl: 'https://princessandini.com', days: DAYS, events: null });
  eq('an unmatched address sees no ceremony section', unknown.ceremony, false);
  ok('and is greeted without a name rather than a wrong one', /Dear Friend/.test(unknown.html));
}

/* ── It cannot disturb the campaign that already went ────────────────────── */

console.log('\nIt cannot collide with the 24th');
{
  ok('a namespace of its own', CAMPAIGN !== MAIN_CAMPAIGN, `${CAMPAIGN} vs ${MAIN_CAMPAIGN}`);
  eq('and it names the day', CAMPAIGN, 'one-more-day-2026-09-25');

  const mine = `${CAMPAIGN}:umohandikanbassey@gmail.com`;
  const theirs = idempotencyKey({ email: 'umohandikanbassey@gmail.com' });
  ok('so the same guest has two different keys', mine !== theirs);
  ok('and the 140 campaign key is unchanged',
     theirs === 'final-details-2026-09:umohandikanbassey@gmail.com', theirs);
}

console.log('\nNothing here can read an audience out of the database');
{
  const src = await import('node:fs').then(fs =>
    fs.readFileSync(new URL('./one-more-day.mjs', import.meta.url), 'utf8'));

  ok('it never imports the audience rules',
     !/final-details-recipients|union-audience|reconcile-seating/.test(src));
  // As FLAGS, not as prose: the header explains why they are absent, and a
  // grep that cannot tell the difference would fail on its own explanation.
  const code = src.split('\n').filter(l => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l)).join('\n');
  ok('it has no --confirm-send-all', !/confirm-send-all/.test(code));
  // --limit and --to appear once each, inside the error that explains they do
  // not exist. What matters is the parser: --send is the only option it takes.
  ok('the parser accepts only --send',
     /\['--send'\]\.includes\(a\)/.test(code) || /!\['--send'\]/.test(code), 'parser shape');
  ok('and nothing reads a limit or a target address',
     !/args\.includes\('--limit'\)/.test(code) && !/args\.includes\('--to'\)/.test(code));
  ok('and the only thing it sends to is RECIPIENTS',
     /to: v\.address/.test(src) && !/to: row\.email/.test(src));
  ok('it writes its own receipt, not the campaign\'s',
     /one-more-day-sent\.json/.test(src) && !/final-details-scheduled\.json/.test(src));
  ok('and it issues no write to Supabase',
     !/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(src));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
