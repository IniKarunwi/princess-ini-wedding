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
  RECIPIENTS, CAMPAIGN, DAYS, SUBJECT, HEADLINE, prepare,
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
  ok('the list is frozen', Object.isFrozen(RECIPIENTS));
  ok('and so is every entry', RECIPIENTS.every(r => Object.isFrozen(r)));
  eq('no duplicate addresses',
     new Set(RECIPIENTS.map(r => r.email.toLowerCase())).size, 6);

  const expected = [
    ['umohandikanbassey@gmail.com', 'Andikan'],
    ['victorinyang2@gmail.com', 'Victor'],
    ['gracestevev@gmail.com', 'Gracemary'],
    ['clairebensonidoko@gmail.com', 'Claire'],
    ['fabiangabriel807@gmail.com', 'Fabian'],
    ['Olamie23@gmail.com', 'Ola'],
  ];
  for (const [i, [email, name]] of expected.entries()) {
    eq(`${i + 1}. ${email}`, RECIPIENTS[i].email, email);
    eq(`   greeted as ${name}`, RECIPIENTS[i].name, name);
    eq('   confirmed JOINING', RECIPIENTS[i].tier, 'JOINING');
  }

  // prepare() takes the list and nothing else. There is no second argument
  // for a database to arrive through, which is what keeps this at six.
  // (.length is 0 because the one parameter has a default, so the signature
  // is checked in the source instead of inferred from the function object.)
  const v = prepare();
  eq('six verdicts', v.length, 6);
  eq('all six JOINING', v.filter(x => x.joining).length, 6);
  eq('none reception-only', v.filter(x => !x.joining).length, 0);
}

/* ── The overrides are the whole truth ──────────────────────────────────── */

console.log('\nNames and tiers are supplied, never derived');
{
  const v = prepare();
  const at = (e) => v.find(x => x.email === e);

  eq('the greeting is the supplied name, verbatim',
     at('gracestevev@gmail.com').row.full_name, 'Gracemary');
  eq('a JOINING tier opens the whole day',
     at('gracestevev@gmail.com').events.map(e => e.key).join('+'),
     'JOINING+RECEPTION+AFTERPARTY');
  ok('every one of the six is a ceremony guest', v.every(x => x.joining));

  // The file must not read the rsvps table at all any more.
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('./one-more-day.mjs', import.meta.url), 'utf8');
  const code = src.split('\n')
    .filter(l => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l))
    .join('\n');
  ok('no rsvps table is named', !/rest\/v1|\bTABLE\b/.test(code), 'database reference');
  ok('no Supabase credentials are read', !/SUPABASE_/.test(code));
  ok('prepare has exactly one parameter, and it defaults to the list',
     /export function prepare\(recipients = RECIPIENTS\)/.test(code));
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
  ok('and the only thing it sends to is the frozen list',
     /to: v\.email/.test(src) && !/to: row\.email/.test(src));
  ok('it writes its own receipt, not the campaign\'s',
     /one-more-day-sent\.json/.test(src) && !/final-details-scheduled\.json/.test(src));
  ok('and it issues no write to Supabase',
     !/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(src));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
