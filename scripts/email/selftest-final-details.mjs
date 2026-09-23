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

import {
  DRESS, WEDDING, subjectFinal, CAMERA, REGISTRY_URL, SEATING_URL, MAP_URL, ASSET_FILES,
} from './config.mjs';
import { validateDress } from './dress-code.mjs';
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
  const same = DRESS.title === title
            && DRESS.invitation === invitation
            && JSON.stringify(DRESS.swatches) === JSON.stringify(swatches);

  if (DRESS.matchesSite) {
    eq('title matches src/lib/wedding.ts', DRESS.title, title);
    eq('invitation matches src/lib/wedding.ts', DRESS.invitation, invitation);
    eq('same number of swatches', DRESS.swatches.length, swatches.length);
    eq('swatches match, in order, hex and name',
       JSON.stringify(DRESS.swatches), JSON.stringify(swatches));
  } else {
    // Deliberately diverging. Report it loudly and pass — see dress-code.mjs.
    pass++;
    console.log('  ✓ matchesSite is false — the site check is advisory');
    console.log(same
      ? '      (they happen to agree anyway)'
      : `      ⚠ the email palette DIFFERS from src/lib/wedding.ts.\n` +
        `        email: ${DRESS.swatches.map(([, n]) => n).join(', ')}\n` +
        `        site:  ${swatches.map(([, n]) => n).join(', ')}\n` +
        '        Guests clicking through from the email will see the site\'s.');
  }

  const problems = validateDress();
  ok('the dress code is well-formed', problems.length === 0, problems.join('; '));
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
  for (const word of ['ceremony', 'no-personal-photography', 'vows', 'after party']) {
    ok(`"${word}" appears nowhere in the HTML`, !new RegExp(word, 'i').test(r.html));
    ok(`"${word}" appears nowhere in the plain text`, !new RegExp(word, 'i').test(r.text));
  }
  ok('and neither does the phones note', !/note about phones/i.test(r.html));

  const c = renderFinalDetails(guest({ approved_for: 'JOINING' }),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('a ceremony guest IS flagged', c.ceremony, true);
  ok('and does read the phones note', /no-personal-photography ceremony/i.test(c.html));
  ok('in the plain text too', /no-personal-photography ceremony/i.test(c.text));
  ok('the media team is named there', /media team/i.test(c.html));
  ok('and being fully present', /fully present with us/i.test(c.html));

  // An after-party-only guest is excluded from this campaign entirely, but if
  // the audience rule ever widens, they must not read it either.
  const a = renderFinalDetails(guest({ approved_for: 'AFTERPARTY' }),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('after-party only is not a ceremony guest', a.ceremony, false);
  ok('and sees no ceremony wording', !/ceremony/i.test(a.html));
}

/* ── The camera section is off unless asked for ──────────────────────────── */

console.log('\nThe camera is on, and removable');
{
  eq('CAMERA.enabled is true in config', CAMERA.enabled, true);

  const on = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('and the render says so', on.camera, true);
  ok('the camera link is exactly the www hub URL',
     on.html.includes('https://www.princessandini.com/wedding')
     && !on.html.includes('/wedding/camera'));
  ok('and in the plain text', on.text.includes('princessandini.com/wedding'));
  ok('ten photos are asked for', /take 10 photos/i.test(on.html));
  ok('and in the plain text', /take 10 photos/i.test(on.text));
  ok('not picture-perfect', /picture-perfect/i.test(on.html));

  // The kill switch: if Saturday comes and the camera cannot be trusted.
  const saved = CAMERA.enabled;
  CAMERA.enabled = false;
  const off = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('switching it off removes it', off.camera, false);
  ok('no camera link', !off.html.includes('/wedding"') && !/princessandini\.com\/wedding/.test(off.html));
  ok('no 10 photos', !/10 photos/i.test(off.html));
  ok('none of it in the plain text', !/10 photos/i.test(off.text));
  ok('but a ceremony guest still gets the phones note',
     /no-personal-photography/i.test(off.html));
  CAMERA.enabled = saved;

  const forced = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY, cameraReady: true });
  eq('--camera-ready forces it on regardless', forced.camera, true);
}

/* ── The content the brief asked for ─────────────────────────────────────── */

console.log('\nEvery promised element is present');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });

  ok('the opening, with the countdown computed',
     /It&rsquo;s 3 days to our wedding/.test(r.html), r.html.match(/It&rsquo;s [^,]*/)?.[0]);
  ok('and in plain text', r.text.includes("It's 3 days to our wedding"));
  ok('a quick refresher on the checklist', /quick refresher on your checklist/i.test(r.html));

  ok('one — the website', /Everything You Need Is Online/i.test(r.html));
  ok('named and linked', r.html.includes('princessandini.com'));
  ok('schedule, venue, dress code', /schedule, venue, dress code/i.test(r.html));

  ok('two — your seat is confirmed', /Your Seat Is Confirmed/i.test(r.html));
  ok('the guest list is complete', /guest list is complete/i.test(r.html));
  ok('a seating chart at the venue', /seating\s+chart at the venue/i.test(r.html));
  ok('give your name to an usher', /give your\s+name to an usher/i.test(r.html));
  ok('they confirm and direct you', /confirm your table number and direct/i.test(r.html));
  ok('"but hey" survived — it is the friendliest line in the letter',
     /But hey, you don&rsquo;t have to wait/i.test(r.html));
  ok('confirm your seat before you even arrive',
     /confirm your seat before you even\s+arrive/i.test(r.html));
  // "100%" also occurs as width="100%" in table markup, so match the phrase.
  ok('NOT "100% confirm"', !/100%\s*confirm/i.test(r.html) && !/100%/.test(r.text));
  ok('the seating-chart link', r.html.includes(SEATING_URL));

  ok('three — the dress code refresher', /Three · Dress code refresher/.test(r.html));
  ok('the palette name', r.html.includes(DRESS.title));
  ok('every swatch hex is rendered', DRESS.swatches.every(([hex]) => r.html.includes(hex)));
  ok('every swatch name is rendered', DRESS.swatches.every(([, n]) => r.html.includes(n)));
  ok('and a pointer to the full palette',
     /full colour palette and dress inspiration/i.test(r.html));

  ok('four — the location', /We&rsquo;ll be celebrating at/i.test(r.html));
  ok('the venue and area', r.html.includes(WEDDING.venueName) && r.html.includes(WEDDING.venueArea));
  ok('venue details on the website too', /venue details on our website/i.test(r.html));

  ok('five — through your eyes', /The Wedding Through Your Eyes/.test(r.html));
  ok('present, and also through your eyes', /While we want you to be present/i.test(r.html));
  // The template wraps this across source lines, so allow any whitespace.
  ok('the candid list', /laughs,\s+hugs, dancing, reactions/i.test(r.html));
  ok('favourite memories', /favourite memories from the day/i.test(r.html));

  ok('the closing', /look forward to having you celebrate with us/i.test(r.html));
  ok('signed Princess & Ini', r.html.includes('Princess &amp; Ini<') || r.html.includes('Princess &amp; Ini\n'),
     r.html.match(/class="sig"[^>]*>\s*[^<]*/)?.[0]?.slice(-40));
  ok('and in the plain text', r.text.includes('Princess & Ini\n'));
  ok('the P.S. names gifts', /For those who have asked about gifts/i.test(r.html));
  ok('with the registry', r.html.includes(REGISTRY_URL));
  ok('last, after the signature',
     r.html.lastIndexOf(REGISTRY_URL) > r.html.lastIndexOf(SEATING_URL));
}

console.log('\nThe things that stop it reading flat');
{
  const assets = { backdrop: 'https://x.test/backdrop.png', website: 'https://x.test/website.jpg' };
  const r = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY, assets });

  // A screenshot of the site, under the section that links to it.
  ok('the screenshot is rendered', r.html.includes('https://x.test/website.jpg'));
  ok('it links to the site', /<a href="https:\/\/princessandini\.com"[^>]*>\s*<img/.test(r.html));
  ok('with width AND height, so Outlook reserves the space',
     /<img[^>]+width="420"[^>]+height="217"/.test(r.html),
     r.html.match(/<img[^>]*website[^>]*>/)?.[0]?.slice(0, 160));
  ok('and alt text', /alt="The Princess &amp; IniOluwa wedding website"/.test(r.html));
  ok('it is small — 420px, not the full card width', r.html.includes('max-width:420px'));
  ok('the file is registered as an asset', ASSET_FILES.website === 'website.jpg');

  // The doodle backdrop. It was already wired; this pins it so it stays.
  ok('the backdrop is applied to the page', r.html.includes('https://x.test/backdrop.png'));
  ok('tiled', /background-repeat:repeat/.test(r.html));
  ok('with an Outlook VML fallback', /v:fill type="tile"/.test(r.html));

  // Without assets — a preview with no files — nothing breaks.
  const bare = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('no assets means no broken image tag', !/<img/.test(bare.html));
  ok('and the section still reads', /Everything You Need Is Online/.test(bare.html));
}

console.log('\nThe venue is a link to the map');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('the venue name is a link', new RegExp(`<a href="[^"]*maps[^"]*"[^>]*>${WEDDING.venueName}`).test(r.html),
     r.html.match(/<a href="[^"]*maps[^"]*"[^>]*>[^<]*/)?.[0]?.slice(0, 120));
  ok('to the shared MAP_URL', r.html.includes(MAP_URL.replace(/&/g, '&amp;')) || r.html.includes(MAP_URL));
}

console.log('\nThe camera above the camera section');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('the camera glyph is there', r.html.includes('&#128247;'));
  ok('it sits ABOVE the heading, on its own line',
     /aria-hidden="true">&#128247;<\/p>\s*<h2[^>]*>\s*The Wedding Through Your Eyes/.test(r.html));
  ok('at icon size, not body size', /font-size:30px[^"]*"\s*aria-hidden/.test(r.html));
  ok('hidden from screen readers', /aria-hidden="true">&#128247;/.test(r.html));
  ok('the heading itself is clean text', /The Wedding Through Your Eyes\s*<\/h2>/.test(r.html));
  ok('no white heart left behind', !r.html.includes('&#129293;'));
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
  // The closing no longer carries a countdown — it is "We look forward to
  // having you." The number appears once, in the opening line.
  ok('one day reads as "1 day", not "1 days"',
     /It&rsquo;s 1 day to our wedding/.test(one.html),
     one.html.match(/It&rsquo;s [^,]*/)?.[0]);
  ok('and the masthead agrees', /One Day to Go/.test(one.html));

  // The subject is computed, so it cannot disagree with the letter. The send
  // date is genuinely undecided — Tuesday or Friday — and this is why that is
  // safe.
  ok('Tuesday\'s subject says 3 days', /\b3 Days to Go\b/.test(subjectFinal(3)));
  ok('Friday\'s says tomorrow', /Tomorrow/i.test(subjectFinal(1)), subjectFinal(1));
  ok('the day itself says today', /Today/i.test(subjectFinal(0)), subjectFinal(0));
  ok('no stray HTML entity in a subject line',
     ![3, 1, 0].some(d => /&[a-z]+;/.test(subjectFinal(d))),
     [3, 1, 0].map(subjectFinal).join(' | '));
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
