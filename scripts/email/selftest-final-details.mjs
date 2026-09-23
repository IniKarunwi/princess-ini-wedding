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

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DRESS, WEDDING, subjectFinal, CAMERA, REGISTRY_URL, SEATING_URL, MAP_URL, ASSET_FILES, DOODLES, DAYS_TO_GO, UPDATE_FINAL,
} from './config.mjs';
import { validateDress } from './dress-code.mjs';
import { renderFinalDetails } from './final-details.mjs';
import {
  classifyForFinalDetails, selectForFinalDetails, ceremonyCount,
} from './final-details-recipients.mjs';

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

  ok('the opening, with the countdown as written down',
     /It&rsquo;s 2 days to our wedding/.test(r.html), r.html.match(/It&rsquo;s [^,]*/)?.[0]);
  ok('and in plain text', r.text.includes("It's 2 days to our wedding"));
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
  ok('and a pointer to the full guide', /full dress guide/i.test(r.html));
  ok('the formality is stated, not just the colours',
     /English Formal/i.test(r.html) && /Royal Garden Elegance/i.test(r.html));
  ok('black tie is named', /Black tie or formal tuxedos/i.test(r.html));
  ok('and the native-attire note', /traditional\/native attire/i.test(r.html));
  ok('fascinators are welcomed', /Fascinators/i.test(r.html));
  ok('all of it in the plain text too',
     /ENGLISH FORMAL/.test(r.text) && /ROYAL GARDEN ELEGANCE/.test(r.text)
     && /Black tie/.test(r.text));

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

console.log('\nNo asset depends on this branch being deployed');
{
  const assets = { backdrop: 'https://princessandini.com/email/backdrop.png' };
  const r = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY, assets });

  // Every image URL the letter emits, whatever the caller passes in.
  const srcs = [...r.html.matchAll(/(?:src|background)="([^"]+)"/g)].map(m => m[1]);
  const files = srcs
    .filter(u => /\/email\//.test(u))
    .map(u => u.split('/email/')[1].split('?')[0]);

  ok('only backdrop.png is referenced', files.every(f => f === 'backdrop.png'),
     [...new Set(files)].join(', ') || '(none)');
  ok('no homepage screenshot', !/website\.jpg/.test(r.html));
  ok('and it is gone from the asset map', !('website' in ASSET_FILES));
  ok('backdrop.png predates this branch — it shipped with the confirmation pack',
     ASSET_FILES.backdrop === 'backdrop.png');

  // Given only the backdrop, the letter emits no <img> at all: the doodles are
  // conditional on their own assets, never invented.
  ok('with only the backdrop, no <img> is emitted', !/<img/.test(r.html));

  // Rendered with no assets at all — which is what a caller that cannot reach
  // public/email/ produces — the letter must still be complete.
  const bare = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  ok('with no assets, nothing is broken', !/<img/.test(bare.html));
  ok('and the website section still reads', /Everything You Need Is Online/.test(bare.html));
  ok('the swatches are unaffected — they are table cells, not images',
     DRESS.swatches.every(([hex]) => bare.html.includes(hex)));
}

/* ── The doodles ─────────────────────────────────────────────────────────────
 * They were missing from the delivered email because the only artwork in the
 * letter was the page backdrop: a CSS background-image (plus VML), drawn at
 * 3–8.5% opacity and only outside an 840px clean channel. A client that drops
 * page backgrounds — most of them — showed flat beige, and so did every
 * window narrower than 840px even when it did not.
 *
 * These assertions are about the fix surviving: real <img> elements, sized,
 * decorative, and present for BOTH tiers. */

console.log('\nThe doodles are images, not a background');
{
  const assets = Object.fromEntries(Object.keys(ASSET_FILES)
    .map(k => [k, `https://princessandini.com/email/${ASSET_FILES[k]}`]));

  for (const tier of ['JOINING', 'RECEPTION']) {
    const r = renderFinalDetails({ ...guest(), approved_for: tier },
      { siteUrl: 'https://princessandini.com', now: SEND_DAY, assets });
    const imgs = [...r.html.matchAll(/<img[^>]*>/g)].map(m => m[0]);

    eq(`${tier}: three doodles`, imgs.length, 3);
    for (const key of Object.keys(DOODLES)) {
      ok(`${tier}: ${key} is present`, r.html.includes(`${key}.png`));
    }
    ok(`${tier}: every doodle carries width AND height`,
       imgs.every(i => /width="\d+"/.test(i) && /height="\d+"/.test(i)), imgs.join('\n'));
    ok(`${tier}: every doodle is decorative (alt="")`,
       imgs.every(i => /alt=""/.test(i)));
    ok(`${tier}: every doodle is display:block`,
       imgs.every(i => /display:block/.test(i)));
    ok(`${tier}: no doodle relies on a CSS background-image`,
       !/background-image[^;]*doodle/.test(r.html));
    ok(`${tier}: none would force a horizontal scroll on a phone`,
       imgs.every(i => /max-width:100%/.test(i)));
  }

  // The crest sits above the greeting, the sign-off flourish below the last
  // section — if they ever swap, the letter opens with champagne.
  const r = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: SEND_DAY, assets });
  ok('the crest comes before the greeting',
     r.html.indexOf('doodle-crest') < r.html.indexOf('Dear '));
  ok('the sign-off flourish comes after it',
     r.html.indexOf('doodle-signoff') > r.html.indexOf('Dear '));
  ok('and before the sign-off, not after it',
     r.html.indexOf('doodle-signoff') < r.html.indexOf('With love'));

  // Copy is untouched by all of this.
  const plain = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });
  eq('the plain text is unchanged by the doodles', plain.text, r.text);
}

console.log('\nThe declared sizes match the real files');
{
  // PNG: bytes 16–24 of the file are the IHDR width and height, big-endian.
  // Read directly rather than through an image library, so this test has no
  // dependency and cannot be skipped when one is missing.
  for (const [key, want] of Object.entries(DOODLES)) {
    const file = join(ROOT, 'public', 'email', ASSET_FILES[key]);
    if (!existsSync(file)) { ok(`${key}: the file exists`, false, file); continue; }
    const buf = readFileSync(file);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    // Rendered at 2x, displayed at 1x.
    eq(`${key} is twice its display width`, width, want.width * 2);
    eq(`${key} is twice its display height`, height, want.height * 2);
    ok(`${key} is a PNG`, buf.slice(1, 4).toString() === 'PNG');
    ok(`${key} is small enough to not delay the render`, buf.length < 40 * 1024,
       `${(buf.length / 1024).toFixed(1)}KB`);
  }
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

/* ── The countdown, which is written down and not computed ───────────────── */

console.log('\nThe countdown');
{
  // DAYS_TO_GO is the single place the number lives. These assertions are
  // what make changing it safe: set it, run this, and every visible
  // occurrence is checked against it rather than against a memory of the copy.
  eq('the campaign is pinned at two days', DAYS_TO_GO, 2);

  // The clock must not reach the letter. Rendered on three different days —
  // including the day after the wedding — the countdown does not move.
  const days = ['2026-09-20', '2026-09-24', '2026-09-27'].map(d =>
    renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: new Date(`${d}T11:00:00Z`) }));
  ok('the number does not depend on when it is rendered',
     days.every(r => r.days === DAYS_TO_GO), days.map(r => r.days).join(', '));
  ok('nor does the wording',
     days.every(r => /It&rsquo;s 2 days to our wedding/.test(r.html)));
  ok('nor the masthead', days.every(r => /2 Days to Go/.test(r.html)));

  // A send that crosses midnight is one run, and must not produce two
  // different letters. This is the case that made the number a constant.
  const before = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: new Date('2026-09-24T23:59:00Z') });
  const after = renderFinalDetails(guest(),
    { siteUrl: 'https://princessandini.com', now: new Date('2026-09-25T00:01:00Z') });
  eq('a send crossing midnight says the same thing on both sides', before.html, after.html);

  const r = renderFinalDetails(guest(), { siteUrl: 'https://princessandini.com', now: SEND_DAY });

  // Every visible occurrence of a day count, found rather than listed, so a
  // new one cannot be added without this test noticing.
  const inHtml = [...r.html.matchAll(/\b(\d+)\s+[Dd]ays?\b/g)].map(m => m[1]);
  const inText = [...r.text.matchAll(/\b(\d+)\s+[Dd]ays?\b/g)].map(m => m[1]);
  ok('every day count in the HTML is the pinned one',
     inHtml.length > 0 && inHtml.every(n => Number(n) === DAYS_TO_GO),
     inHtml.join(', '));
  ok('and in the plain text',
     inText.length > 0 && inText.every(n => Number(n) === DAYS_TO_GO),
     inText.join(', '));
  ok('no "3 days" survives anywhere', !/\b3\s+[Dd]ays?\b/.test(r.html + r.text));

  // The subject is built from the same constant as the letter, so the two
  // cannot disagree — which was the point of computing it, and is preserved.
  eq('the subject line, exactly',
     subjectFinal(DAYS_TO_GO),
     '2 Days to Go! \u{1F48D} \u00b7 Final Details for Our Wedding');

  // The wording for 1 and 0 still has to be right, in case this is ever
  // re-pinned closer to the day.
  ok('one day would read "Tomorrow"', /Tomorrow/i.test(subjectFinal(1)), subjectFinal(1));
  ok('the day itself says today', /Today/i.test(subjectFinal(0)), subjectFinal(0));
  ok('and the masthead has singular wording for it',
     /One Day to Go/.test(UPDATE_FINAL.headline(1)), UPDATE_FINAL.headline(1));
  ok('no stray HTML entity in a subject line',
     ![2, 1, 0].some(d => /&[a-z]+;/.test(subjectFinal(d))),
     [2, 1, 0].map(subjectFinal).join(' | '));
}

/* ── What may touch seating, and what it may do to it ────────────────────── */

console.log('\nIsolation');
{
  // The letter and rule A stay entirely clear of seating. The union rule does
  // read the published plan, but it reaches it through union-audience.mjs, so
  // neither of these two has to know it exists.
  for (const f of ['final-details.mjs', 'final-details-recipients.mjs']) {
    const src = readFileSync(join(ROOT, 'scripts/email', f), 'utf8');
    const imports = [...src.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map(m => m[1]);
    ok(`${f} imports nothing from the seating feature`,
       !imports.some(i => /seating|planner|features\//i.test(i)), imports.join(' '));
    ok(`${f} names no seating table`,
       !/seating_layouts|guest_photos|planner_settings/.test(src));
  }
  const rec = readFileSync(join(ROOT, 'scripts/email/final-details-recipients.mjs'), 'utf8');
  ok('rule A reads the RSVP table only',
     !/from '\.\/store|supabase\.storage/.test(rec));

  // The two files that DO read seating may only read it. A write verb is the
  // failure worth catching: this campaign must never be able to change where
  // anybody sits, and the draft plan is not what guests were shown.
  for (const f of ['prepare-final-details.mjs', 'union-audience.mjs']) {
    const src = readFileSync(join(ROOT, 'scripts/email', f), 'utf8');
    ok(`${f} never imports the planner or the seating feature`,
       ![...src.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)]
         .some(m => /seating\/|planner|features\//i.test(m[1])));
    ok(`${f} issues no write request`,
       !/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/i.test(src));
    ok(`${f} never reads the draft layout`, !/status=eq\.draft/.test(src));
  }
  const prep = readFileSync(join(ROOT, 'scripts/email/prepare-final-details.mjs'), 'utf8');
  ok('the sender delivers to the union audience',
     /unionAudience\(/.test(prep) && /audience\.audience/.test(prep));
  ok('and checks it before sending', /assertAudience\(audience\)/.test(prep));
  ok('a --to test reads neither table',
     prep.indexOf('args.send && args.to') < prep.indexOf('await fetchInputs()'));
}

/* ── Done ────────────────────────────────────────────────────────────────── */

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
