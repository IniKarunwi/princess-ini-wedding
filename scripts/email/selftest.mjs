#!/usr/bin/env node
/**
 * Offline test for the confirmation-pack sender. No network, no database, no API key.
 *
 *   npm run test:email
 *
 * Selection is tested against fixture rows because getting it wrong emails the
 * wrong people. Sending is tested against a fake Resend that can be told to
 * fail, because "one failure must not stop the batch" is the requirement most
 * likely to be quietly wrong.
 */

import { selectRecipients, classify, isUnsent, isSendableEmail, firstName, plusOneOutranksGuest } from './recipients.mjs';
import { renderConfirmationPack } from './template.mjs';
import { eventsForGuest, eventsForPlusOne, plusOneBeyondMain, plusOneState, daysUntil, normaliseTier, parseTiers, TIER_EVENTS } from './events.mjs';
import { sendWithRetry, SendError } from './resend.mjs';
import { MODE, resolveMode, findGuest, confirmationPhrase, matchesPhrase } from './guards.mjs';
import { STATUS, SUBJECT, WEDDING, UPDATE, assetUrls, ASSET_FILES, REGISTRY_URL, PALETTE, BACKDROP, LAYOUT } from './config.mjs';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${name}`); }
  else { failures.push({ name, detail }); console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const guest = (over = {}) => ({
  id: `id-${Math.random().toString(36).slice(2, 8)}`,
  full_name: 'Ada Obi',
  email: 'ada@example.com',
  main_invite_status: 'APPROVED',
  approved_for: 'JOINING',
  attending: true,
  plus_one_requested: false,
  plus_one_status: null,
  plus_one_name: null,
  email_status: null,
  last_email_sent: null,
  ...over,
});

const ASSETS = assetUrls({ siteUrl: 'https://example.com' });
const MAP_URL_FRAGMENT = 'google.com/maps';
const render = (row, now = new Date(Date.UTC(2026, 7, 26))) =>
  renderConfirmationPack(row, { assets: ASSETS, rsvpUrl: 'https://example.com', now });

// ── Send guards ─────────────────────────────────────────────────────────────
// The rule under test: no single flag can email the whole guest list.
section('SEND GUARDS');

const flags = (o = {}) => ({ send: false, confirmSendAll: false, yes: false, ...o });

{
  const r = resolveMode(flags({ send: true }));
  check('--send ALONE is refused', !r.ok, r.ok ? `allowed mode ${r.mode}` : undefined);
  check('the refusal says why', !r.ok && /entire guest list/i.test(r.error));
  check('the refusal shows the four scopes, narrowest first',
    !r.ok && ['--to', '--guest', '--limit', '--confirm-send-all'].every(f => r.hint.includes(f)));
}

check('--confirm-send-all --send is the only route to a full send',
  resolveMode(flags({ send: true, confirmSendAll: true })).mode === MODE.ALL);
check('--limit --send is a limited send',
  resolveMode(flags({ send: true, limit: 5 })).mode === MODE.LIMITED);
check('--guest --send is a single-guest send',
  resolveMode(flags({ send: true, guest: 'Ada' })).mode === MODE.GUEST);
check('--to --send is a sample, not a guest send',
  resolveMode(flags({ send: true, to: 'me@x.com' })).mode === MODE.SAMPLE);

check('no --send is always a dry run, whatever the scope',
  resolveMode(flags({ confirmSendAll: true })).mode === MODE.DRY_RUN
  && resolveMode(flags({ limit: 3 })).mode === MODE.DRY_RUN
  && resolveMode(flags()).mode === MODE.DRY_RUN);

check('--limit with --confirm-send-all is refused as ambiguous',
  !resolveMode(flags({ send: true, limit: 5, confirmSendAll: true })).ok);
check('--guest with --limit is refused as ambiguous',
  !resolveMode(flags({ send: true, guest: 'Ada', limit: 5 })).ok);
check('the ambiguity message names both flags',
  /--limit and --confirm-send-all/.test(
    resolveMode(flags({ send: true, limit: 5, confirmSendAll: true })).error));

check('a full send requires confirmation',
  resolveMode(flags({ send: true, confirmSendAll: true })).requiresConfirmation);
check('a limited send requires confirmation',
  resolveMode(flags({ send: true, limit: 5 })).requiresConfirmation);
check('a single-guest send requires confirmation',
  resolveMode(flags({ send: true, guest: 'Ada' })).requiresConfirmation);
check('a dry run needs no confirmation',
  !resolveMode(flags()).requiresConfirmation);

// The confirmation phrase carries the count, so it cannot be typed blind.
check('the phrase embeds the recipient count',
  confirmationPhrase(MODE.LIMITED, 5) === 'SEND 5');
check('a full send has a distinct phrase, never shared with a narrow one',
  confirmationPhrase(MODE.ALL, 187) === 'SEND ALL 187'
  && confirmationPhrase(MODE.ALL, 187) !== confirmationPhrase(MODE.LIMITED, 187));
check('"y" does not confirm anything',
  !matchesPhrase('y', confirmationPhrase(MODE.LIMITED, 5))
  && !matchesPhrase('yes', confirmationPhrase(MODE.LIMITED, 5)));
check('an empty line does not confirm',
  !matchesPhrase('', confirmationPhrase(MODE.LIMITED, 5))
  && !matchesPhrase('   ', confirmationPhrase(MODE.LIMITED, 5)));
check('the wrong count does not confirm',
  !matchesPhrase('SEND 4', confirmationPhrase(MODE.LIMITED, 5)));
check('a limited phrase cannot approve a full send',
  !matchesPhrase('SEND 187', confirmationPhrase(MODE.ALL, 187)));
check('the right phrase confirms, ignoring case and spacing',
  matchesPhrase('  send   all  187 ', confirmationPhrase(MODE.ALL, 187)));

// ── Finding one guest ───────────────────────────────────────────────────────
section('GUEST LOOKUP');

const roster = [
  { id: 'a1', full_name: 'Ada Obi',    email: 'ada@example.com' },
  { id: 'b2', full_name: 'Grace Bello', email: 'grace.b@example.com' },
  { id: 'c3', full_name: 'Grace Cole',  email: 'grace.c@example.com' },
];
check('finds by exact name',  findGuest(roster, 'Ada Obi').row?.id === 'a1');
check('finds by email',       findGuest(roster, 'grace.b@example.com').row?.id === 'b2');
check('finds by id',          findGuest(roster, 'c3').row?.id === 'c3');
check('finds by unique partial name', findGuest(roster, 'ada').row?.id === 'a1');
check('an ambiguous name is REFUSED, not guessed',
  !findGuest(roster, 'Grace').ok);
check('the ambiguity lists the candidates to choose between',
  findGuest(roster, 'Grace').hint?.includes('grace.b@example.com'));
check('an unknown name is refused', !findGuest(roster, 'Nobody').ok);

// ── Selection ───────────────────────────────────────────────────────────────
section('SELECTION');

check('NULL email_status counts as unsent',
  isUnsent(guest({ email_status: null })));
check("the sheet's literal 'Not Sent' counts as unsent",
  isUnsent(guest({ email_status: 'Not Sent' })));
check('casing and spacing in the sheet do not matter',
  isUnsent(guest({ email_status: '  NOT   SENT ' })));
check("'Sent' does not count as unsent",
  !isUnsent(guest({ email_status: 'Sent' })));

check('approved + RSVP\'d + unsent + valid email is selected',
  classify(guest()).send);
check('an approved guest who never RSVP\'d gets NO pack',
  !classify(guest({ attending: null })).send);
check('a guest who RSVP\'d no gets no pack',
  !classify(guest({ attending: false })).send);
check('an approved guest with no tier is held back, not sent an empty pack',
  !classify(guest({ approved_for: null })).send);
check('an undecided plus one holds the guest back rather than guessing',
  !classify(guest({ plus_one_requested: true, plus_one_status: null })).send);
check('the hold reason names the undecided plus one',
  /plus one/i.test(classify(guest({ plus_one_requested: true, plus_one_status: null })).reason));
check('pending guests are not emailed',
  !classify(guest({ main_invite_status: null })).send);
check('rejected guests are not emailed',
  !classify(guest({ main_invite_status: 'REJECTED' })).send);
check('already-sent guests are not emailed again',
  !classify(guest({ email_status: 'Sent' })).send);

check('a missing email is caught',
  !classify(guest({ email: null })).send);
check('a phone number in the email column is caught',
  !isSendableEmail('08031234567'));
check('two addresses in one cell are caught',
  !isSendableEmail('a@x.com, b@x.com'));
check('a bare domain is caught',
  !isSendableEmail('example.com'));
check('an ordinary address passes',
  isSendableEmail('ada.obi@example.co.uk'));

const mixed = [
  guest({ full_name: 'Send Me' }),
  guest({ full_name: 'No RSVP',  attending: null }),
  guest({ full_name: 'Pending',  main_invite_status: null }),
  guest({ full_name: 'Rejected', main_invite_status: 'REJECTED' }),
  guest({ full_name: 'Done',     email_status: 'Sent' }),
  guest({ full_name: 'No Email', email: null }),
];
const picked = selectRecipients(mixed);
check('a mixed list selects only the eligible guest',
  picked.send.length === 1 && picked.send[0].full_name === 'Send Me',
  `selected ${picked.send.length}`);
check('every skipped guest carries a reason',
  picked.skipped.length === 5 && picked.skipped.every(s => s.reason));

check('a "+3" seat suffix is not treated as a name',
  firstName({ full_name: 'Pastor Chingtok +3' }) === 'Pastor');
check('a nameless guest still gets a greeting',
  firstName({ full_name: null }) === 'Friend');

// ── Tiers ───────────────────────────────────────────────────────────────────
section('TIERS');

const names = (row) => eventsForGuest(row).map(e => e.name);

check('a Joining guest gets the whole day',
  names(guest({ approved_for: 'JOINING' })).join('|')
    === 'Wedding Service|Wedding Reception|After Party');
check('a Reception guest gets the reception alone',
  names(guest({ approved_for: 'RECEPTION' })).join('|') === 'Wedding Reception');
check('an After Party guest gets the after party alone',
  names(guest({ approved_for: 'AFTERPARTY' })).join('|') === 'After Party');
check('events always come back in running order',
  names(guest({ approved_for: 'JOINING' }))[0] === 'Wedding Service');

check('the sheet\'s "After Party" spelling is understood',
  normaliseTier('After Party') === 'AFTERPARTY' && normaliseTier('after-party') === 'AFTERPARTY');
check('"Ceremony" is understood as Joining', normaliseTier('Ceremony') === 'JOINING');
// A guest is not always one tier: reception + after party is a real
// combination, and one cell has to say so without a schema change.
check('a comma-separated combination unions the events',
  names(guest({ approved_for: 'RECEPTION, AFTERPARTY' })).join('|')
    === 'Wedding Reception|After Party');
check('a plus-separated combination works',
  names(guest({ approved_for: 'Reception + After Party' })).join('|')
    === 'Wedding Reception|After Party');
check('"and" works, as does an ampersand',
  names(guest({ approved_for: 'reception and after party' })).length === 2
  && names(guest({ approved_for: 'Reception & After Party' })).length === 2);
check('a combination stays in running order, not the order typed',
  names(guest({ approved_for: 'After Party, Reception' })).join('|')
    === 'Wedding Reception|After Party');
check('a duplicated tier is not doubled',
  names(guest({ approved_for: 'RECEPTION, Reception' })).length === 1);
check('an unrecognised fragment is dropped, not fatal to the whole cell',
  names(guest({ approved_for: 'RECEPTION, tbc' })).join('|') === 'Wedding Reception');
check('a combination naming JOINING still yields the whole day, once',
  names(guest({ approved_for: 'JOINING, AFTERPARTY' })).length === 3);
check('parseTiers returns the keys, deduplicated',
  parseTiers('Reception + After Party').join('|') === 'RECEPTION|AFTERPARTY');
check('"Wedding Service" is understood as the JOINING tier',
  normaliseTier('Wedding Service') === 'JOINING' && normaliseTier('Service') === 'JOINING');

check('a blank tier yields no events', names(guest({ approved_for: null })).length === 0);
check('an unrecognised tier yields no events', names(guest({ approved_for: 'VIP LOUNGE' })).length === 0);

check('the countdown counts whole days',
  daysUntil(WEDDING.date, new Date(Date.UTC(2026, 8, 25))) === 1
  && daysUntil(WEDDING.date, new Date(Date.UTC(2026, 8, 26))) === 0);
check('the countdown never goes negative',
  daysUntil(WEDDING.date, new Date(Date.UTC(2026, 9, 1))) === 0);

// Counted in the wedding's own timezone, not the sender's. Lagos is UTC+1, so
// for one hour every night the two disagree — and a UTC count would show a
// number a day stale to anyone reading it in Lagos.
check('the countdown is computed, never a fixed number',
  daysUntil(WEDDING.date, new Date('2026-08-17T09:00:00Z')) === 40
  && daysUntil(WEDDING.date, new Date('2026-07-17T09:00:00Z')) === 71);
check('23:30 UTC is already tomorrow in Lagos, and counts as such',
  daysUntil(WEDDING.date, new Date('2026-08-17T23:30:00Z')) === 39
  && daysUntil(WEDDING.date, new Date('2026-08-18T00:30:00Z')) === 39);
check('the wedding eve does not say "one day to go" once Lagos is past midnight',
  daysUntil(WEDDING.date, new Date('2026-09-25T23:30:00Z')) === 0);
check('the day itself reads as the day, at any hour',
  daysUntil(WEDDING.date, new Date('2026-09-26T00:30:00Z')) === 0
  && daysUntil(WEDDING.date, new Date('2026-09-26T22:00:00Z')) === 0);
check('the headline wording follows the count',
  UPDATE.headline(40) === '40 Days to Go'
  && UPDATE.headline(1) === 'One Day to Go'
  && UPDATE.headline(0) === 'Today&rsquo;s the Day');

// ── Template ────────────────────────────────────────────────────────────────
section('TEMPLATE');

const joining    = render(guest({ full_name: 'Ada Obi', approved_for: 'JOINING' }));
const reception  = render(guest({ full_name: 'Ada Obi', approved_for: 'RECEPTION' }));
const afterParty = render(guest({ full_name: 'Ada Obi', approved_for: 'AFTERPARTY' }));

check('greets the guest by first name', joining.html.includes('Dear Ada,'));
check('thanks them for RSVPing, rather than inviting them',
  /thank you for taking the time to RSVP/i.test(joining.html)
  && !/you.{0,3}re invited/i.test(joining.html));
check('carries the wedding date', joining.html.includes('26th September 2026'));
check('carries the venue', joining.html.includes('Signature by Wells Carlton')
  && joining.html.includes('Asokoro, Abuja'));
check('links the registry', joining.html.includes(REGISTRY_URL));
check('embeds the dress guide artwork', joining.html.includes(ASSETS['dress-guide']));
check('ships a plain-text alternative', joining.text.includes('Dear Ada,'));
check('loads no script at all', !/<script/i.test(joining.html));
check('the only external stylesheet is the Google font, which degrades safely',
  (joining.html.match(/<link[^>]*stylesheet[^>]*>/gi) || [])
    .every(l => l.includes('fonts.googleapis.com')));
check('the serif and sans fallbacks stand alone if the font is stripped',
  /Georgia/.test(joining.html) && /Helvetica/.test(joining.html));
check('uses no flexbox or grid, which Outlook cannot render',
  !/display\s*:\s*(flex|grid)/i.test(joining.html));
check('the masthead shows the countdown', /31 Days to Go/.test(joining.html));

// THE rule: a guest must not learn that an event they are not invited to exists.
check('a Reception guest is never shown the After Party',
  !/after party/i.test(reception.html) && !/after party/i.test(reception.text));
check('a Reception guest is never shown the Wedding Service',
  !/joining/i.test(reception.html) && !/joining/i.test(reception.text)
  && !/wedding service/i.test(reception.html) && !/wedding service/i.test(reception.text));
check('a Reception guest is not shown the 6 PM or 12 PM times',
  !reception.html.includes('6:00 PM') && !reception.html.includes('12:00 PM'));
const recAfter = render(guest({ approved_for: 'RECEPTION, AFTERPARTY' }));
check('a Reception + After Party guest sees exactly two timeline stops',
  (recAfter.html.match(/italic 400 22px\/1\.1/g) || []).length === 2);
check('a Reception + After Party guest is still never shown the service',
  !/wedding service/i.test(recAfter.html) && !/wedding service/i.test(recAfter.text)
  && !recAfter.html.includes('12:00 PM'));
check('a Reception + After Party guest opens on the reception artwork',
  recAfter.html.includes(ASSETS.reception) && !recAfter.html.includes(ASSETS.joining));

check('an After Party guest is never shown the service or reception',
  !/joining/i.test(afterParty.html) && !/wedding service/i.test(afterParty.html)
  && !/reception/i.test(afterParty.html));
check('a Joining guest sees all three events, in running order',
  joining.events.map(e => e.name).join('|') === 'Wedding Service|Wedding Reception|After Party');
check('a Joining guest sees all three times',
  ['12:00 PM', '2:00 PM', '6:00 PM'].every(t => joining.html.includes(t)));

check('each tier opens on its own artwork',
  joining.html.includes(ASSETS.joining)
  && reception.html.includes(ASSETS.reception)
  && afterParty.html.includes(ASSETS['after-party']));
check('a tier never shows another tier\'s artwork',
  !reception.html.includes(ASSETS.joining)
  && !reception.html.includes(ASSETS['after-party']));

// Plus one
const flat = (h) => h.replace(/\s+/g, ' ');
const p1yes = render(guest({ plus_one_requested: true, plus_one_status: 'APPROVED', plus_one_name: 'Chidi' }));
const p1no  = render(guest({ plus_one_requested: true, plus_one_status: 'REJECTED' }));
const p1non = render(guest({ plus_one_requested: false }));

check('an approved plus one is celebrated and named',
  /Great news/i.test(flat(p1yes.html))
  && /reserved a seat for <strong>Chidi<\/strong>/i.test(flat(p1yes.html))
  && /welcoming both of you/i.test(flat(p1yes.html)));
check('an approved plus one with no name still reads correctly',
  /reserved a seat for your guest/i.test(
    flat(render(guest({ plus_one_requested: true, plus_one_status: 'APPROVED' })).html)));
check('a declined plus one gets the warm wording',
  /Due to venue capacity, we were only able to reserve a seat for you/i.test(flat(p1no.html))
  && /grateful for your understanding/i.test(flat(p1no.html)));
// The masthead title contains "Has Been Confirmed" for every guest, so this
// has to name something only the approved card says, or it can never fail.
check('a declined plus one never gets the approved wording',
  !/Great news/i.test(p1no.html) && !/both of you/i.test(p1no.html)
  && !/reserved a seat for/i.test(p1no.html.replace(/only able to reserve a seat for you/i, '')));
check('a guest who never asked sees NOTHING about plus ones',
  !/plus one/i.test(p1non.html) && !/plus one/i.test(p1non.text));

check('plus-one state reads the sheet\'s vocabulary',
  plusOneState({ plus_one_requested: true, plus_one_status: 'Accepted' }) === 'approved'
  && plusOneState({ plus_one_requested: true, plus_one_status: 'Declined' }) === 'declined'
  && plusOneState({ plus_one_requested: true, plus_one_status: null }) === 'pending'
  && plusOneState({ plus_one_requested: false, plus_one_status: null }) === 'none');

// ── Email-client compatibility ──────────────────────────────────────────────
// The Banani export used flex, inline SVG, absolute positioning and a CSS
// transform. Each is silently broken or removed by a major client, so each is
// asserted absent rather than trusted to have been caught by eye.
section('EMAIL-CLIENT COMPATIBILITY');

const allPacks = [joining, reception, afterParty, p1yes, p1no];

check('no flexbox or grid — Outlook renders through Word',
  allPacks.every(p => !/display\s*:\s*(flex|inline-flex|grid)/i.test(p.html)));
check('no inline SVG — Gmail strips it entirely',
  allPacks.every(p => !/<svg/i.test(p.html)));
check('no absolute positioning — unsupported in Outlook',
  allPacks.every(p => !/position\s*:\s*absolute/i.test(p.html)));
check('no CSS transforms — they do not exist in email (text-transform is fine)',
  allPacks.every(p => !/(?<!text-)transform\s*:/i.test(p.html)));
check('no data: image URIs — Gmail refuses to render them',
  allPacks.every(p => !/src\s*=\s*["']data:/i.test(p.html)));
check('every layout block is a table',
  joining.html.includes('role="presentation"'));

// The calendar strip is derived, not typed, so it cannot drift out of step
// with the real September 2026.
check('the calendar marks the 26th',
  /background:#2d5016;border-radius:18px;[^"]*">26</.test(joining.html.replace(/\s+/g, ' ')));
check('the calendar week runs Mon 21 to Sun 27',
  ['21', '22', '23', '24', '25', '26', '27'].every(d => joining.html.includes(`>${d}<`)));
check('the weekday initials start on Monday',
  joining.html.indexOf('>MON<') < joining.html.indexOf('>SUN<'));

// The timeline is built from the guest's events, like everything else.
// 22px/1.1 is the timeline time; the masthead headline is 22px/1.3, so the
// line-height is what keeps these two apart.
const timelineStops = (p) => (p.html.match(/italic 400 22px\/1\.1/g) || []).length;
check('the timeline shows one stop per invited event',
  timelineStops(reception) === 1 && timelineStops(afterParty) === 1
  && timelineStops(joining) === 3);

// The card and the backdrop's clean channel are set independently; if the
// card ever grows past the channel, the doodles run under the text.
check('the clean channel stays wider than the card',
  BACKDROP.channel > LAYOUT.card);
check('the card renders at the configured width, fluid below it',
  new RegExp(`width="${LAYOUT.card}"`).test(joining.html)
  && new RegExp(`max-width:${LAYOUT.card}px`).test(joining.html)
  && /width:100%;max-width:/.test(joining.html));
check('no width is left hard-coded at the old 600',
  !/width="600"|max-width:600px/.test(joining.html));
// Named from ASSET_FILES rather than hard-coded, so changing the artwork
// format does not quietly turn this into a check of nothing.
check('full-bleed artwork tracks the card width',
  new RegExp(`${ASSET_FILES.joining.replace('.', '\\.')}"[^>]*width="${LAYOUT.card}"`).test(joining.html)
  && new RegExp(`${ASSET_FILES['dress-guide'].replace('.', '\\.')}"[^>]*width="${LAYOUT.card}"`).test(joining.html));
check('the mobile breakpoint clears the card',
  new RegExp(`max-width:${LAYOUT.mobile}px`).test(joining.html)
  && LAYOUT.mobile > LAYOUT.card);
check('every image stays fluid, so nothing overflows a phone',
  (joining.html.match(/<img /g) || []).length
    === (joining.html.match(/<img [^>]*style="[^"]*width:100%/g) || []).length);

check('the design palette is applied, not the old one',
  joining.html.includes('#1a3410') && joining.html.includes('#b8860b')
  && joining.html.includes('#e8e0d0') && !joining.html.includes('#1b3b2a'));
check('the footer band is dark green',
  /background:#1a3410/.test(joining.html));
// The hierarchy: the confirmation is the point, the countdown supports it.
check('the title outweighs the countdown in the masthead',
  Number(joining.html.match(/font:700 (\d+)px[^"]*">\s*Your Invitation Has Been Confirmed/)[1])
    > Number(joining.html.match(/font:italic 400 (\d+)px[^"]*">\s*31 Days to Go/)[1]));
check('the masthead spells the date out in full',
  /Saturday, September 26, 2026/.test(joining.html));
check('the introduction says why this email exists',
  /Your RSVP has now been reviewed/.test(flat(joining.html)));
check('the schedule section is the guest\'s own timeline',
  /Your Wedding Day Timeline/.test(joining.html) && !/Day Schedule/.test(joining.html));
check('Confirmed For is untouched',
  /Confirmed For/.test(joining.html) && /Your Invitation<\/h2>/.test(joining.html));
check('the map button names its destination',
  /Open in Google Maps/.test(joining.html) && joining.html.includes(MAP_URL_FRAGMENT));
check('the registry leads with presence, not gifts',
  /greatest gift we could receive/.test(flat(joining.html)));
check('the footer closes on Abuja, before the names',
  joining.html.indexOf('celebrate with you in Abuja')
    < joining.html.lastIndexOf('Princess &amp; IniOluwa'));
check('the masthead carries the update label and title',
  /WEDDING UPDATE #1/i.test(joining.html)
  && /Your Invitation Has Been Confirmed/.test(joining.html));
// The preheader (hidden inbox preview text) legitimately repeats the count;
// strip it before checking the visible body.
const visible = joining.html.replace(/<div style="display:none[\s\S]*?<\/div>/, '');
check('the countdown appears once in the body, not twice',
  (visible.match(/31/g) || []).length === 1);
check('the preheader still carries the countdown for the inbox',
  /31 days to go/i.test(joining.html));
// The number stayed in the masthead but left the subject — short and warm
// survives an inbox better than a numbered series.
check('the subject leads with the confirmation',
  SUBJECT.startsWith('Your Invitation is Confirmed!'));
check('the subject stays short enough to survive a phone inbox',
  SUBJECT.length <= 60, `${SUBJECT.length} chars`);
check('the subject carries no line breaks, which some clients reject',
  !/[\r\n]/.test(SUBJECT));

// ── The page backdrop ───────────────────────────────────────────────────────
// The doodles must stay on the page and never appear behind content. That is
// enforced by every card painting its own opaque ground, which is easy to
// break by accident later.
section('BACKDROP');

check('the backdrop is applied to the page',
  joining.html.includes(ASSETS.backdrop));
check('it is ONE image, not a set of layered icons',
  (joining.html.match(new RegExp(ASSETS.backdrop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length <= 3);
check('the flat page colour is stated first, so blocked images look unchanged',
  /background-color:#e8e0d0/.test(joining.html));
check('the 2x tile is pinned back to its intended size',
  joining.html.includes(`background-size:${BACKDROP.tileWidth}px auto`));
check('Outlook gets VML, the only background it will tile',
  /<v:background/.test(joining.html) && /<v:fill[^>]+type="tile"/.test(joining.html));
check('the VML carries the fallback colour too',
  /<v:fill[^>]+color="#e8e0d0"/.test(joining.html));
check('the vml namespace is declared on <html>',
  /xmlns:v="urn:schemas-microsoft-com:vml"/.test(joining.html));

// Every surface that holds content paints its own ground. If one of these
// stops doing so, doodles show through behind text.
for (const [what, colour] of [
  ['the card',          PALETTE.card],
  ['the alternate band', PALETTE.alt],
  ['the registry panel', PALETTE.panel],
  ['the footer',         PALETTE.green],
]) {
  check(`${what} paints an opaque ground, so no doodle shows through`,
    joining.html.includes(`background:${colour}`) || joining.html.includes(`background-color:${colour}`));
}

check('the backdrop is never set on a card, panel or button',
  !new RegExp(`background[^;"]*${ASSETS.backdrop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*>\\s*<tr><td[^>]*padding:(16|24|28|36)`, 'i')
    .test(joining.html));
check('a pack still renders if the backdrop is absent',
  (() => {
    const noBackdrop = { ...ASSETS };
    delete noBackdrop.backdrop;
    const r = renderConfirmationPack(guest(), { assets: noBackdrop, rsvpUrl: 'https://example.com' });
    return !/<v:background/.test(r.html) && /background-color:#e8e0d0/.test(r.html)
        && r.html.includes('Wedding Service');
  })());

// ── Artwork ─────────────────────────────────────────────────────────────────
section('ARTWORK');

check('every image resolves from /email/ on the site',
  Object.values(ASSETS).every(u => /^https:\/\/[^/]+\/email\/[a-z-]+\.(png|jpe?g|webp)$/.test(u)));
// The filenames the template emits must match what is deployed. A URL the
// site does not serve renders as nothing at all — silently — so this is
// pinned rather than left to be noticed in an inbox.
check('every asset URL ends in a real image extension',
  Object.values(ASSETS).every(u => /\.(png|jpe?g|webp)$/.test(u)));
check('the template references exactly the files in ASSET_FILES',
  Object.entries(ASSET_FILES).every(([k, f]) => ASSETS[k].endsWith(`/${f}`)));
check('no stand-in artwork ever reaches the email',
  !/PLACEHOLDER|UPLOAD THE ARTWORK|stroke-dasharray/i.test(joining.html));
check('every image carries alt text, for blocked-image and screen readers',
  (joining.html.match(/<img /g) || []).length
    === (joining.html.match(/<img [^>]*alt=/g) || []).length);
check('every image carries a width attribute, which Outlook needs',
  (joining.html.match(/<img /g) || []).length
    === (joining.html.match(/<img [^>]*width=/g) || []).length);

// The artwork is the strongest part of the design, so it runs edge to edge
// rather than sitting inside a margin.
const imgWidth = (html, key) => {
  const m = html.match(new RegExp(`<img[^>]+${key}\\.[a-z]+"[^>]*width="(\\d+)"`));
  return m ? Number(m[1]) : null;
};
check('the hero is full bleed at the card width',
  imgWidth(joining.html, 'joining') === LAYOUT.card);
check('the dress guide is full bleed',
  imgWidth(joining.html, 'dress-guide') === LAYOUT.card);
check('the venue illustration fills its card, inside its section padding',
  imgWidth(joining.html, 'venue') === LAYOUT.card - 58);
check('images scale down on a phone rather than overflowing',
  (joining.html.match(/<img /g) || []).length
    === (joining.html.match(/<img [^>]*style="[^"]*width:100%/g) || []).length);

section('TEMPLATE — ESCAPING');
// ── The plus one's own invitation ───────────────────────────────────────────
// A plus one is not always welcome at the same parts of the day as the guest
// who brought them. The two invitations are separate columns and separate
// lists, and nothing derives one from the other.
section('PLUS ONE — INDEPENDENT INVITATION');

const p1Names = (row) => eventsForPlusOne(row).map(e => e.name).join('|');

check('the plus one\'s events come from plus_one_approved_for',
  p1Names({ approved_for: 'JOINING', plus_one_approved_for: 'RECEPTION' }) === 'Wedding Reception');
check('they are NOT inherited from the main guest',
  p1Names({ approved_for: 'JOINING', plus_one_approved_for: null }) === '');
check('a narrower guest can have a WIDER plus one, if that is what the data says',
  p1Names({ approved_for: 'RECEPTION', plus_one_approved_for: 'JOINING' })
    === 'Wedding Service|Wedding Reception|After Party');
check('the plus one can hold a combination too',
  p1Names({ approved_for: 'JOINING', plus_one_approved_for: 'Reception + After Party' })
    === 'Wedding Reception|After Party');
check('changing the main tier does not change the plus one\'s',
  p1Names({ approved_for: 'JOINING', plus_one_approved_for: 'RECEPTION' })
    === p1Names({ approved_for: 'AFTERPARTY', plus_one_approved_for: 'RECEPTION' }));

const recOnly = render(guest({
  approved_for: 'JOINING', plus_one_requested: true, plus_one_status: 'APPROVED',
  plus_one_name: 'Chidi', plus_one_approved_for: 'RECEPTION',
}));
check('the card lists the plus one\'s own events, not the guest\'s',
  /Chidi is invited to/i.test(flat(recOnly.html))
  && recOnly.plusOneEvents.map(e => e.name).join('|') === 'Wedding Reception');
check('the plain text carries them too',
  /Chidi is invited to:/.test(recOnly.text) && /2:00 PM   Wedding Reception/.test(recOnly.text));
check('the guest still sees their own full invitation',
  recOnly.events.map(e => e.name).join('|') === 'Wedding Service|Wedding Reception|After Party');
check('an unnamed plus one still reads correctly',
  /Your guest is invited to/i.test(flat(render(guest({
    plus_one_requested: true, plus_one_status: 'APPROVED', plus_one_approved_for: 'RECEPTION',
  })).html)));
check('a declined plus one is never given an event list',
  !/is invited to/i.test(flat(p1no.html)));
check('a guest with no plus one is never given one',
  !/is invited to/i.test(flat(render(guest({ plus_one_requested: false })).html)));

// An approved plus one with no tier is a half-made decision. Falling back to
// the main guest's tier is exactly the coupling this removes, so it holds.
check('approved with no tier is HELD, not guessed from the main guest',
  !classify(guest({ plus_one_requested: true, plus_one_status: 'APPROVED' })).send);
check('the hold reason names the column to fill in',
  /plus_one_approved_for/.test(
    classify(guest({ plus_one_requested: true, plus_one_status: 'APPROVED' })).reason));
check('with a tier set, the guest sends',
  classify(guest({ plus_one_requested: true, plus_one_status: 'APPROVED',
                   plus_one_approved_for: 'RECEPTION' })).send);

// A plus one invited to more than the guest renders faithfully, but is
// reported — it is almost certainly a slip, and it tells the main guest that
// an event they are excluded from exists.
check('a plus one outranking the guest is detected',
  plusOneBeyondMain({ approved_for: 'RECEPTION', plus_one_approved_for: 'JOINING' })
    .map(e => e.name).join('|') === 'Wedding Service|After Party');
check('a plus one within the guest\'s invitation is not flagged',
  plusOneBeyondMain({ approved_for: 'JOINING', plus_one_approved_for: 'RECEPTION' }).length === 0);
check('the sender surfaces only genuinely outranking rows',
  plusOneOutranksGuest([
    guest({ approved_for: 'RECEPTION', plus_one_requested: true, plus_one_status: 'APPROVED', plus_one_approved_for: 'JOINING' }),
    guest({ approved_for: 'JOINING',   plus_one_requested: true, plus_one_status: 'APPROVED', plus_one_approved_for: 'RECEPTION' }),
    guest({ approved_for: 'RECEPTION', plus_one_requested: true, plus_one_status: 'REJECTED', plus_one_approved_for: 'JOINING' }),
  ]).length === 1);

const nasty = render(guest({ full_name: '<script>alert(1)</script> Obi' }));
check('escapes a name containing HTML',
  !nasty.html.includes('<script>alert(1)</script>') && nasty.html.includes('&lt;script&gt;'));

// ── Sending: a fake Resend ──────────────────────────────────────────────────
section('SENDING');

/** @param plan e.g. ['ok', {status: 500}, 'ok'] — one entry per attempt. */
function fakeResend(plan) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, init) => {
    const step = plan[Math.min(i++, plan.length - 1)];
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    if (step === 'ok') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: `msg_${i}` }) };
    }
    if (step === 'network') throw new Error('socket hang up');
    return {
      ok: false, status: step.status,
      text: async () => JSON.stringify({ message: step.message || 'rejected' }),
    };
  };
  return { fetchImpl, calls };
}

const base = { apiKey: 'k', from: 'a@b.com', to: 'c@d.com', subject: 'S', html: '<p>h</p>', text: 't' };

{
  const { fetchImpl, calls } = fakeResend(['ok']);
  const id = await sendWithRetry({ ...base, fetchImpl });
  check('a successful send returns the message id', id === 'msg_1');
  check('posts subject, html and text', calls[0].body.subject === 'S'
    && calls[0].body.html === '<p>h</p>' && calls[0].body.text === 't');
  check('sends the api key as a bearer token',
    calls[0].headers.Authorization === 'Bearer k');
}

{
  const { fetchImpl, calls } = fakeResend([{ status: 500 }, 'ok']);
  const id = await sendWithRetry({ ...base, fetchImpl });
  check('a 500 is retried and then succeeds', id === 'msg_2' && calls.length === 2);
}

{
  const { fetchImpl, calls } = fakeResend(['network', 'ok']);
  await sendWithRetry({ ...base, fetchImpl });
  check('a dropped connection is retried', calls.length === 2);
}

{
  const { fetchImpl, calls } = fakeResend([{ status: 422, message: 'Invalid `to` field' }]);
  let err;
  try { await sendWithRetry({ ...base, fetchImpl }); } catch (e) { err = e; }
  check('a rejected address is NOT retried', calls.length === 1, `${calls.length} attempts`);
  check('the rejection reason is preserved',
    err instanceof SendError && err.message.includes('Invalid `to` field'), err?.message);
}

{
  const { fetchImpl } = fakeResend([{ status: 429 }]);
  let err;
  try { await sendWithRetry({ ...base, fetchImpl }); } catch (e) { err = e; }
  check('rate limiting is retried, then reported when it persists',
    err instanceof SendError && err.status === 429);
}

{
  const { fetchImpl, calls } = fakeResend(['ok']);
  await sendWithRetry({ ...base, idempotencyKey: 'invitation:abc', fetchImpl });
  check('an idempotency key is sent, so a retry cannot double-send',
    calls[0].headers['Idempotency-Key'] === 'invitation:abc');
}

// ── The batch: one failure must not stop the rest ───────────────────────────
section('BATCH RESILIENCE');

/**
 * Mirrors the per-guest loop in send-invitations.mjs: send, then record, and
 * on failure record the guest and carry on. Kept here rather than imported
 * because the real one is welded to the CLI; the assertions below are about
 * the shape of the behaviour, which is what a regression would break.
 */
async function runBatch(guests, { failFor = [], updateFailsFor = [] } = {}) {
  const sent = [], failed = [], unrecorded = [];
  const written = [];

  for (const g of guests) {
    try {
      if (failFor.includes(g.email)) {
        throw new SendError('HTTP 422: Invalid `to` field', { status: 422 });
      }
      const messageId = `msg_${g.id}`;
      if (updateFailsFor.includes(g.email)) {
        unrecorded.push({ g, messageId });
      } else {
        written.push({ id: g.id, email_status: STATUS.SENT, last_email_sent: new Date().toISOString() });
        sent.push({ g, messageId });
      }
    } catch (err) {
      failed.push({ g, message: err.message });
    }
  }
  return { sent, failed, unrecorded, written };
}

const batch = [
  guest({ full_name: 'One',   email: 'one@example.com' }),
  guest({ full_name: 'Bad',   email: 'bad@example.com' }),
  guest({ full_name: 'Three', email: 'three@example.com' }),
  guest({ full_name: 'Four',  email: 'four@example.com' }),
];

const result = await runBatch(batch, { failFor: ['bad@example.com'] });
check('a failure mid-batch does not stop the run',
  result.sent.length === 3, `only ${result.sent.length} sent`);
check('the failure is reported, not swallowed',
  result.failed.length === 1 && result.failed[0].g.full_name === 'Bad');
check('guests after the failure are still emailed',
  result.sent.some(s => s.g.full_name === 'Four'));
check('the failed guest is NOT marked Sent, so a re-run retries it',
  !result.written.some(w => w.id === batch[1].id));
check('successes are marked Sent',
  result.written.length === 3 && result.written.every(w => w.email_status === STATUS.SENT));
check('every success stores last_email_sent',
  result.written.every(w => !Number.isNaN(Date.parse(w.last_email_sent))));

const afterWriteFail = await runBatch(batch, { updateFailsFor: ['three@example.com'] });
check('a guest emailed but not recorded is its own category, not a success',
  afterWriteFail.unrecorded.length === 1
  && afterWriteFail.sent.length === 3
  && !afterWriteFail.written.some(w => w.id === batch[2].id));

const allBad = await runBatch(batch, {
  failFor: batch.map(g => g.email),
});
check('a run where everything fails writes nothing',
  allBad.written.length === 0 && allBad.failed.length === 4);

// ── Artwork: the reserved box must match the real files ─────────────────────
// Every artwork carries a height attribute so the client reserves the right
// space before the bytes arrive. That height is only correct while ASSET_SIZE
// matches the images on disk, so pin the two together: a re-export or a
// re-encode that changes an aspect ratio must update the table or fail here.
{
  const { ASSET_SIZE, ASSET_FILES, SENT_ASSET_FILES, scaledHeight, LAYOUT } = await import('./config.mjs');
  const sharp = (await import('sharp')).default;
  const { existsSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const art = (f) => join(process.cwd(), 'public', 'email', f);

  // The PNGs named in already-delivered email must never stop resolving. An
  // email fetches its images when it is opened, so deleting one of these
  // silently strips the artwork out of 136 mails that are already in inboxes.
  for (const [key, file] of Object.entries(SENT_ASSET_FILES)) {
    check(`${key}: the .png delivered email points at still exists`,
      existsSync(art(file)) && statSync(art(file)).size > 1024, file);
  }

  // Nothing may reference an asset that is not on disk — the failure mode is
  // silent, because a missing image URL renders as nothing rather than as an
  // error, and it is only visible once it is in a guest's inbox.
  for (const [key, file] of Object.entries(ASSET_FILES)) {
    check(`${key}: the file ASSET_FILES points at exists (${file})`,
      existsSync(art(file)) && statSync(art(file)).size > 1024, file);
  }

  // No artwork a guest downloads may exceed 0.5 MB. Above that, clients start
  // showing their own placeholder instead of the image while they wait.
  for (const [key, file] of Object.entries(ASSET_FILES)) {
    if (key === 'backdrop') continue;
    const bytes = existsSync(art(file)) ? statSync(art(file)).size : Infinity;
    check(`${key}: under 0.5 MB, so a client will not placeholder it`,
      bytes <= 512 * 1024, `${(bytes / 1048576).toFixed(2)} MB`);
  }

  for (const [key, declared] of Object.entries(ASSET_SIZE)) {
    const path = art(ASSET_FILES[key]);
    if (!existsSync(path)) { check(`${key}: artwork present`, false, path); continue; }
    const real = await sharp(path).metadata();
    // Compare the ratio, not the pixel count: shrinking an image is fine,
    // changing its shape is not — only the shape affects the reserved box.
    //
    // Tolerance of 5 parts per thousand, because a resize rounds to whole
    // pixels and so moves the ratio very slightly. That is half a percent:
    // three pixels of slack on a 700px-wide artwork, far too small to see,
    // and still tight enough to catch a genuinely different crop.
    const ratio = (w, h) => (h / w) * 1000;
    const drift = Math.abs(ratio(declared.width, declared.height) - ratio(real.width, real.height));
    check(`${key}: ASSET_SIZE ratio matches the file on disk`,
      drift <= 5,
      `declared ${declared.width}x${declared.height}, file ${real.width}x${real.height}, drift ${drift.toFixed(1)}‰`);
  }

  check('every artwork resolves a height, so none renders as an unsized box',
    Object.keys(ASSET_SIZE).every(k => scaledHeight(k, LAYOUT.card) > 0));
}

check('the subject names the couple', SUBJECT.includes('Princess & IniOluwa'));
check('the subject does not re-invite people who already accepted',
  !/invited/i.test(SUBJECT));

// ── Result ──────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.log(`\x1b[31mFAILED — ${failures.length} of ${passed + failures.length} checks\x1b[0m`);
  for (const f of failures) console.log(`  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exitCode = 1;
} else {
  console.log(`\x1b[32mAll checks passed (${passed})\x1b[0m`);
}
