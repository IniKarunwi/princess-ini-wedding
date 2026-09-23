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

/* ── No guest learns about an event they were not invited to ─────────────── */

console.log('\nThe rule: only your own events');
{
  // The phones paragraph deliberately names no part of the day — "a no-phones
  // event", "our media team", never "ceremony" or "service". So it is safe for
  // every tier, and needs no gate. This asserts the wording keeps that promise:
  // if someone reintroduces "ceremony", this fails.
  for (const tier of ['JOINING', 'RECEPTION', 'AFTERPARTY']) {
    const r = renderFinalDetails(guest({ approved_for: tier }),
      { siteUrl: 'https://princessandini.com', now: SEND_DAY });
    for (const word of ['ceremony', 'service', 'vows', 'after party']) {
      ok(`${tier}: "${word}" is not named in the HTML`, !new RegExp(word, 'i').test(r.html));
      ok(`${tier}: nor in the plain text`, !new RegExp(word, 'i').test(r.text));
    }
  }

  const r = renderFinalDetails(guest({ approved_for: 'RECEPTION' }),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('the phones paragraph still reaches a reception-only guest',
     /no-phones event/i.test(r.html));
  ok('and in their plain text', /no-phones event/i.test(r.text));
}

/* ── The camera section is off unless asked for ──────────────────────────── */

console.log('\nThe camera is on, and removable');
{
  eq('CAMERA.enabled is true in config', CAMERA.enabled, true);

  const on = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('and the render says so', on.camera, true);
  ok('the link is the hub, not the camera route',
     on.html.includes('https://princessandini.com/wedding')
     && !on.html.includes('/wedding/camera'));
  ok('ten pictures are asked for', /take 10 pictures/i.test(on.html));
  ok('and in the plain text', /take 10 pictures/i.test(on.text));
  ok('not picture-perfect', /picture-perfect/i.test(on.html));

  // The kill switch: if Saturday comes and the camera cannot be trusted.
  const saved = CAMERA.enabled;
  CAMERA.enabled = false;
  const off = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('switching it off removes it', off.camera, false);
  // The bare string "/wedding" also occurs in a source comment citing
  // src/lib/wedding.ts, so match the URL a guest could actually click.
  ok('no camera link', !off.html.includes('princessandini.com/wedding')
     && !off.html.includes('href="https://princessandini.com/wedding"'));
  ok('no 10 pictures', !/10 pictures/i.test(off.html));
  ok('none of it in the plain text', !/10 pictures/i.test(off.text));
  ok('but the no-phones paragraph survives on its own',
     /no-phones event/i.test(off.html) && /no-phones event/i.test(off.text));
  CAMERA.enabled = saved;

  const forced = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY, cameraReady: true });
  eq('--camera-ready forces it on regardless', forced.camera, true);
}

/* ── The content the brief asked for ─────────────────────────────────────── */

console.log('\nEvery promised element is present');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });

  ok('the opening line, with the countdown computed',
     /It&rsquo;s 3 days to our wedding/.test(r.html), r.html.match(/It&rsquo;s [^,]*/)?.[0]);
  ok('and in plain text', r.text.includes("It's 3 days to our wedding"));
  ok('a refresher, not an announcement', /refresher on everything/i.test(r.html));

  ok('first, the website', /First/.test(r.html) && r.html.includes('princessandini.com'));
  ok('in doubt, go there', /in doubt about any detail/i.test(r.html));

  ok('second, the table', /Second/.test(r.html));
  ok('the guest list is complete', /guest list is complete/i.test(r.html));
  ok('a seating chart at the venue', /seating chart at\s+the venue/i.test(r.html));
  ok('say your name at the door', /say your name at the door/i.test(r.html));
  ok('an usher confirms the table number', /usher will confirm your table number/i.test(r.html));
  ok("and you don't have to wait", /don&rsquo;t have to wait until Saturday/i.test(r.html));
  ok('the seating-chart link', r.html.includes(SEATING_URL));

  ok('third, the dress code', /Third/.test(r.html) && r.html.includes(DRESS.title));
  ok('every swatch hex is rendered', DRESS.swatches.every(([hex]) => r.html.includes(hex)));
  ok('every swatch name is rendered', DRESS.swatches.every(([, n]) => r.html.includes(n)));

  ok('the location', r.html.includes(WEDDING.venueName) && r.html.includes(WEDDING.venueArea));

  ok('finally, the phones and the camera', /Finally/.test(r.html));
  ok('the media team is named', /media team/i.test(r.html));

  ok('we look forward to having you', /look forward to having you/i.test(r.html));
  ok('signed by the couple',
     r.html.includes(WEDDING.couple.replace('&', '&amp;')) && r.text.includes(WEDDING.couple));
  ok('the registry is last, after the signature',
     r.html.includes(REGISTRY_URL)
     && r.html.lastIndexOf(REGISTRY_URL) > r.html.lastIndexOf(SEATING_URL));
  ok('labelled as the wedding registry', /Wedding registry:/i.test(r.html));
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
  ok('and the section still reads', /Everything Is On Our Website/.test(bare.html));
}

console.log('\nDress code says more than colour');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('formal dresses are named', /formal dresses/i.test(r.html));
  ok('elegant gowns are named', /elegant gowns/i.test(r.html));
  ok('and it is in the plain text too',
     /formal dresses and elegant gowns/i.test(r.text));
  ok('set apart from the colour line', /<em>Formal dresses/.test(r.html));
}

console.log('\nThe venue is a link to the map');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('the venue name is a link', new RegExp(`<a href="[^"]*maps[^"]*"[^>]*>${WEDDING.venueName}`).test(r.html),
     r.html.match(/<a href="[^"]*maps[^"]*"[^>]*>[^<]*/)?.[0]?.slice(0, 120));
  ok('to the shared MAP_URL', r.html.includes(MAP_URL.replace(/&/g, '&amp;')) || r.html.includes(MAP_URL));
  ok('and the guest is told it is tappable', /Tap the name for directions/i.test(r.html));
}

console.log('\nA camera beside the camera section');
{
  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('the camera glyph is there', r.html.includes('&#128247;'));
  ok('next to the heading', /&#128247;<\/span> Through Your Eyes/.test(r.html));
  ok('and hidden from screen readers', /aria-hidden="true">&#128247;/.test(r.html));
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
