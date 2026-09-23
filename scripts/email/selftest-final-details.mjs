#!/usr/bin/env node
/**
 * Tests for the final-details letter. No network, no database, no API key.
 *
 *   npm run test:email:final-details
 *
 * ── What these are actually for ────────────────────────────────────────────
 * Two things can go wrong here that cannot be taken back once a send starts:
 * the wrong people receive it, and a guest reads about a part of the day they
 * were not invited to. Most of what follows is about those two.
 *
 * The third is quieter: the dress code is COPIED from src/lib/wedding.ts into
 * config.mjs because .mjs cannot import .ts. A copy drifts. So the site's own
 * file is parsed here and compared, character for character.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DRESS, WEDDING, SUBJECT_FINAL, CAMERA, REGISTRY_URL, SEATING_URL } from './config.mjs';
import { renderFinalDetails } from './final-details.mjs';
import {
  classifyForFinalDetails, selectForFinalDetails, ceremonyCount,
} from './final-details-recipients.mjs';
import { daysUntil } from './events.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const guest = (over = {}) => ({
  id: 1,
  full_name: 'Adaeze Okonkwo',
  email: 'adaeze@example.com',
  main_invite_status: 'APPROVED',
  attending: true,
  approved_for: 'JOINING',
  plus_one_requested: false,
  plus_one_status: null,
  plus_one_approved_for: null,
  email_status: null,
  ...over,
});

const SEND_DAY = new Date('2026-09-23T11:00:00Z');   // noon WAT, 23 September

/* ── The dress code must match the website, exactly ──────────────────────── */

console.log('\nDress code is the site\'s, not the email\'s');
{
  const src = readFileSync(join(ROOT, 'src/lib/wedding.ts'), 'utf8');
  const block = src.slice(src.indexOf('export const DRESS'));
  const body = block.slice(0, block.indexOf('} as const;'));

  const title = body.match(/title:\s*'([^']*)'/)?.[1];
  const invitation = body.match(/invitation:\s*'([^']*)'/)?.[1];
  const swatches = [...body.matchAll(/\['(#[0-9a-f]{6})',\s*'([^']+)'\]/gi)]
    .map(m => [m[1], m[2]]);

  ok('the site file was parsed', !!title && !!invitation && swatches.length > 0,
     `title=${title} swatches=${swatches.length}`);
  eq('title matches src/lib/wedding.ts', DRESS.title, title);
  eq('invitation matches src/lib/wedding.ts', DRESS.invitation, invitation);
  eq('same number of swatches', DRESS.swatches.length, swatches.length);
  eq('swatches match, in order, hex and name',
     JSON.stringify(DRESS.swatches), JSON.stringify(swatches));
  eq('nine colours, as printed in the guide', DRESS.swatches.length, 9);
}

/* ── Who receives it ─────────────────────────────────────────────────────── */

console.log('\nRecipients: included');
{
  eq('an approved, attending ceremony guest', classifyForFinalDetails(guest()).send, true);
  eq('an approved, attending reception guest',
     classifyForFinalDetails(guest({ approved_for: 'RECEPTION' })).send, true);
  eq('reception + after party',
     classifyForFinalDetails(guest({ approved_for: 'Reception + After Party' })).send, true);
  eq('already had the confirmation pack — still included',
     classifyForFinalDetails(guest({ email_status: 'Sent 2026-08-01' })).send, true);
  eq('a declined plus one is a completed decision',
     classifyForFinalDetails(guest({ plus_one_requested: true, plus_one_status: 'declined' })).send, true);
  eq('an approved plus one with a tier',
     classifyForFinalDetails(guest({
       plus_one_requested: true, plus_one_status: 'approved', plus_one_approved_for: 'RECEPTION',
     })).send, true);
}

console.log('\nRecipients: excluded');
{
  const no = (label, over, bucket) => {
    const v = classifyForFinalDetails(guest(over));
    ok(label, v.send === false && v.bucket === bucket,
       `send=${v.send} bucket=${v.bucket} reason=${v.reason}`);
  };
  no('never RSVP\'d — no seat to promise', { attending: null }, 'no-rsvp');
  no('RSVP\'d no', { attending: false }, 'not-attending');
  no('not approved', { main_invite_status: 'PENDING' }, 'not-approved');
  no('no decision at all', { main_invite_status: null }, 'not-approved');
  no('approved to nothing', { approved_for: null }, 'no-tier');
  no('unrecognised tier', { approved_for: 'VIP LOUNGE' }, 'no-tier');
  no('after party only — the letter promises a reception seat',
     { approved_for: 'AFTERPARTY' }, 'no-reception');
  no('plus one requested, undecided',
     { plus_one_requested: true, plus_one_status: null }, 'plus-one-undecided');
  no('plus one approved with no tier',
     { plus_one_requested: true, plus_one_status: 'approved', plus_one_approved_for: null },
     'plus-one-undecided');
  no('no address', { email: null }, 'no-email');
  no('unusable address', { email: 'adaeze at example dot com' }, 'no-email');
  no('two addresses in one cell', { email: 'a@x.com, b@y.com' }, 'no-email');
}

console.log('\nRecipients: the whole list');
{
  const rows = [
    guest({ id: 1 }),
    guest({ id: 2, email: 'ADAEZE@example.com' }),          // same inbox, different case
    guest({ id: 3, email: 'chidi@example.com', approved_for: 'RECEPTION' }),
    guest({ id: 4, email: 'ngozi@example.com', attending: null }),
    guest({ id: 5, email: 'tobi@example.com', approved_for: 'AFTERPARTY' }),
  ];
  const { recipients, excluded, duplicates } = selectForFinalDetails(rows);

  eq('two recipients', recipients.length, 2);
  eq('one duplicate address, reported not dropped', duplicates.length, 1);
  eq('two exclusions', excluded.length, 2);
  eq('every row is accounted for',
     recipients.length + duplicates.length + excluded.length, rows.length);
  eq('de-duplication is case-insensitive', duplicates[0].row.id, 2);
  eq('one of the recipients is a ceremony guest', ceremonyCount(recipients), 1);
}

/* ── A reception guest must not learn the ceremony exists ────────────────── */

console.log('\nThe rule: only your own events');
{
  const r = renderFinalDetails(guest({ approved_for: 'RECEPTION' }),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY });

  eq('not flagged as a ceremony guest', r.ceremony, false);
  for (const word of ['ceremony', 'phone-free', 'no-personal-photography', 'service', 'vows']) {
    ok(`"${word}" appears nowhere in the HTML`, !new RegExp(word, 'i').test(r.html));
    ok(`"${word}" appears nowhere in the plain text`, !new RegExp(word, 'i').test(r.text));
  }

  const c = renderFinalDetails(guest({ approved_for: 'JOINING' }),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('a ceremony guest IS flagged', c.ceremony, true);
  ok('and does read the phone-free paragraph', /no-personal-photography/i.test(c.html));
  ok('in the plain text too', /no-personal-photography/i.test(c.text));
}

/* ── The camera section is off unless asked for ──────────────────────────── */

console.log('\nThe camera is off by default');
{
  eq('CAMERA.enabled is false in config', CAMERA.enabled, false);

  const off = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('and the render says so', off.camera, false);
  ok('no Instant Camera in the HTML', !/instant camera/i.test(off.html));
  ok('none in the plain text', !/instant camera/i.test(off.text));
  ok('no link to /wedding', !off.html.includes('princessandini.com/wedding'));
  ok('no mention of 10 moments', !/10 moments/i.test(off.html));

  const on = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY, cameraReady: true });
  eq('--camera-ready turns it on for review', on.camera, true);
  ok('the section appears', /instant camera/i.test(on.html));
  ok('with the challenge', /up to 10 moments/i.test(on.html));
  ok('and in the plain text', /instant camera/i.test(on.text));

  ok('turning it on adds only that section',
     on.html.length > off.html.length && off.html.length > 4000,
     `off=${off.html.length} on=${on.html.length}`);
}

/* ── The content the brief asked for ─────────────────────────────────────── */

console.log('\nEvery promised element is present');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });

  ok('the opening line, with the countdown computed',
     /It&rsquo;s 3 days to our wedding/.test(r.html), r.html.match(/It&rsquo;s [^,]*/)?.[0]);
  ok('and in plain text', r.text.includes("It's 3 days to our wedding"));
  ok('the website is named as the source', r.html.includes('princessandini.com'));
  ok('the guest list is described as complete', /guest list is complete/i.test(r.html));
  ok('the usher instruction', /give your\s+name to one of our ushers/i.test(r.html));
  ok('the seating-chart link', r.html.includes(SEATING_URL));
  ok('the dress code title', r.html.includes(DRESS.title));
  ok('every swatch hex is rendered',
     DRESS.swatches.every(([hex]) => r.html.includes(hex)));
  ok('every swatch name is rendered',
     DRESS.swatches.every(([, n]) => r.html.includes(n)));
  ok('the venue', r.html.includes(WEDDING.venueName) && r.html.includes(WEDDING.venueArea));
  ok('the registry, as a P.S.', /P\.S\./.test(r.html) && r.html.includes(REGISTRY_URL));
  ok('the registry is the last thing before the footer',
     r.html.lastIndexOf(REGISTRY_URL) > r.html.lastIndexOf(SEATING_URL));
  ok('a warm closing', /cannot wait to see you/i.test(r.html));
  // esc() turns the ampersand in "Princess & IniOluwa" into &amp;, so the raw
  // string is correctly absent — check the escaped form the guest actually sees.
  ok('signed by the couple',
     r.html.includes(WEDDING.couple.replace('&', '&amp;')) && r.text.includes(WEDDING.couple));
}

console.log('\nIt is the next letter in the same series');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('numbered #3 in the masthead', /Wedding Update #3/.test(r.html));
  ok('the shared footer is present', /SATURDAY &middot; 26 SEPTEMBER 2026/.test(r.html));
  ok('the ✦ ◆ ✦ divider is used', r.html.includes('&#10022; &#9670; &#10022;'));
  ok('one <html> document', (r.html.match(/<html/g) ?? []).length === 1);
  ok('it closes', r.html.trim().endsWith('</html>'));
  ok('a preheader for the inbox preview', /Everything you need for Saturday/.test(r.html));
  ok('no unresolved template holes', !/\$\{/.test(r.html));
  ok('no "undefined" leaked into the markup', !/undefined/.test(r.html));
  ok('nor into the text', !/undefined/.test(r.text));
}

/* ── The countdown, and the one hard-coded number ────────────────────────── */

console.log('\nThe countdown');
{
  eq('noon on 23 September is 3 days out', daysUntil(WEDDING.date, SEND_DAY), 3);
  eq('the 24th is 2', daysUntil(WEDDING.date, new Date('2026-09-24T11:00:00Z')), 2);
  eq('the 25th is 1', daysUntil(WEDDING.date, new Date('2026-09-25T11:00:00Z')), 1);

  const one = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: new Date('2026-09-25T11:00:00Z') });
  ok('one day reads as "1 day", not "1 days"', /in 1 day!/.test(one.html),
     one.html.match(/See you in [^!]*/)?.[0]);
  ok('and the masthead agrees', /One Day to Go/.test(one.html));

  ok('the subject line says 3 days', /\b3 Days\b/i.test(SUBJECT_FINAL));
  ok('which is only true for a send on the 23rd',
     daysUntil(WEDDING.date, SEND_DAY) === 3);
}

/* ── Nothing here reaches the seating data ───────────────────────────────── */

console.log('\nIsolation');
{
  const files = ['final-details.mjs', 'final-details-recipients.mjs', 'prepare-final-details.mjs'];
  for (const f of files) {
    const src = readFileSync(join(ROOT, 'scripts/email', f), 'utf8');
    const imports = [...src.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map(m => m[1]);
    ok(`${f} imports nothing from the seating feature`,
       !imports.some(i => /seating|planner|features\//i.test(i)), imports.join(' '));
    ok(`${f} names no seating table`,
       !/seating_layouts|guest_photos|planner_settings/.test(src));
  }
  const rec = readFileSync(join(ROOT, 'scripts/email/final-details-recipients.mjs'), 'utf8');
  ok('the recipient rules read the RSVP table only',
     !/from '\.\/store|supabase\.storage/.test(rec));
}

/* ── Done ────────────────────────────────────────────────────────────────── */

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
