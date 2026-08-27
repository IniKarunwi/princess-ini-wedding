/**
 * The Wedding Confirmation & Information Pack — pure rendering, no I/O.
 *
 * Sent to guests who have ALREADY RSVP'd. It is not persuasion; it is the
 * answer to every question they would otherwise have to message about: where
 * am I going, what time, can I bring someone, what do I wear, how do I give.
 *
 * ── Where this design came from ────────────────────────────────────────────
 * Ported from the Banani export (WeddingNewsletter.jsx). Layout, spacing and
 * palette follow it closely; three constructs in the export cannot survive an
 * email client and were rebuilt rather than copied:
 *
 *   flex rows          → tables. Outlook renders through Word: no flexbox.
 *   the winding SVG    → a table timeline. Gmail strips inline <svg> entirely,
 *   timeline             and the labels were absolutely positioned, which is
 *                        unsupported in Outlook and unreliable in Gmail.
 *   the rotated map-pin→ a round cell. transform: rotate() does not exist in
 *   date marker          email; the pin is drawn as a circle instead.
 *
 * Everything else — the alternating cream bands, the gold eyebrow labels, the
 * ✦ ◆ ✦ dividers, the dark green footer — is carried over as specified.
 *
 * ── The one rule that matters ──────────────────────────────────────────────
 * A guest is shown ONLY the events they are invited to. Not greyed out, not
 * marked unavailable — absent. Someone invited to the Reception alone must
 * finish this email unaware that an After Party exists. Every section below
 * is built from that guest's own event list, never from the full set.
 */

import { WEDDING, REGISTRY_URL, BANK_ACCOUNTS, MAP_URL, PALETTE as P, TYPE, UPDATE, BACKDROP, LAYOUT, scaledHeight } from './config.mjs';
import { eventsForGuest, eventsForPlusOne, heroFor, daysUntil, plusOneState } from './events.mjs';
import { shellTop, shellBottom, esc, SERIF, SANS } from './chrome.mjs';
import { firstName } from './recipients.mjs';



/* ── Small parts ─────────────────────────────────────────────────────────── */

/** The gold letter-spaced eyebrow above every section heading. */
const eyebrow = (text) =>
  `<p style="margin:0 0 8px;font:600 11px/1.6 ${SANS};letter-spacing:3px;` +
  `text-transform:uppercase;color:${P.gold};">${esc(text)}</p>`;

/** Section heading, PT Serif 28. */
const heading = (text, marginBottom = '32px') =>
  `<h2 style="margin:0 0 ${marginBottom};font:700 28px/1.25 ${SERIF};color:${P.green};">${esc(text)}</h2>`;

/** ✦ ◆ ✦ — the ornament between sections. */
const divider = () => `
  <tr><td style="padding:32px 0;text-align:center;line-height:1;">
    <span style="color:${P.gold};font-size:18px;letter-spacing:8px;font-family:Georgia,serif;">&#10022; &#9670; &#10022;</span>
  </td></tr>`;

/**
 * A full-bleed artwork.
 *
 * `key` names the asset in ASSET_SIZE, so the height attribute is computed
 * from its real aspect ratio. Both dimensions are given for Outlook, and —
 * more importantly — so every client reserves the correct amount of space
 * before the image has loaded. Without a height the row has no size until the
 * bytes land, and the space where the artwork belongs reads as blank.
 *
 * `height:auto` in the inline style still wins wherever it is supported, so
 * the image stays fluid when the card is narrower than `width`.
 */
const artwork = (key, src, alt, width = LAYOUT.card) => {
  const height = scaledHeight(key, width);
  return `
  <img src="${esc(src)}" alt="${esc(alt)}" width="${width}"${height ? ` height="${height}"` : ''}
       style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;">`;
};

/**
 * One event badge: tick, name, time.
 *
 * The export used `display:flex` with a `gap`. Rebuilt as a three-cell table
 * row, which is the only layout primitive every client agrees on. The green
 * left rule is a border-left on the outer table, as in the design.
 */
const eventBadge = (event) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:0 0 12px;background:${P.card};border:1px solid ${P.rule};border-left:3px solid ${P.greenMid};border-radius:8px;">
    <tr>
      <td width="48" valign="middle" style="padding:16px 0 16px 17px;">
        <!-- The circular tick. border-radius degrades to a square in Outlook,
             which is acceptable; the tick still reads. -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td width="28" height="28" align="center" valign="middle"
                  style="width:28px;height:28px;background:${P.greenMid};border-radius:14px;
                         font:700 14px/28px ${SANS};color:${P.card};text-align:center;">&#10003;</td></tr>
        </table>
      </td>
      <td valign="middle" style="padding:16px 8px 16px 0;">
        <div style="font:700 16px/1.3 ${SERIF};color:${P.green};letter-spacing:.5px;">${esc(event.name)}</div>
      </td>
      <td valign="middle" align="right" style="padding:16px 20px 16px 0;white-space:nowrap;">
        <div style="font:600 13px/1.3 ${SANS};color:${P.gold};letter-spacing:1px;text-transform:uppercase;">${esc(event.time)}</div>
      </td>
    </tr>
  </table>`;

/**
 * The September week strip, with the wedding day marked.
 *
 * The export laid this out with flex and marked the day using a rotated
 * teardrop (`border-radius:50% 50% 50% 0` + `transform:rotate(-45deg)`).
 * Neither works in email, so it is a fixed table of seven cells and the day is
 * a filled circle. Dates are derived from the wedding date rather than typed
 * in, so they cannot drift out of alignment with the real calendar.
 */
function calendarStrip() {
  const wedding = WEDDING.date;
  const dow = (wedding.getUTCDay() + 6) % 7;              // 0 = Monday
  const monday = new Date(Date.UTC(
    wedding.getUTCFullYear(), wedding.getUTCMonth(), wedding.getUTCDate() - dow));

  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + i)));

  const initials = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const monthName = wedding.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const headRow = initials.map(d =>
    `<td width="14%" align="center" style="padding:0 0 10px;font:700 9px/1.4 ${SANS};letter-spacing:1px;color:${P.faint};">${d}</td>`
  ).join('');

  const dayRow = days.map(d => {
    const n = d.getUTCDate();
    const isWedding = d.getUTCDate() === wedding.getUTCDate()
                   && d.getUTCMonth() === wedding.getUTCMonth();
    if (!isWedding) {
      return `<td width="14%" align="center" style="padding:4px 0;font:400 15px/36px ${SANS};color:${P.muted};">${n}</td>`;
    }
    return `<td width="14%" align="center" style="padding:4px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
        <tr><td width="36" height="36" align="center" valign="middle"
                style="width:36px;height:36px;background:${P.greenMid};border-radius:18px;
                       font:700 15px/36px ${SANS};color:${P.card};text-align:center;">${n}</td></tr>
      </table>
    </td>`;
  }).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:340px;margin:0 auto;">
      <tr><td align="center" style="padding:0 0 14px;font:600 13px/1.4 ${SANS};letter-spacing:2px;text-transform:uppercase;color:${P.ink};">
        ${esc(monthName)}
      </td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>${headRow}</tr>
          <tr>${dayRow}</tr>
        </table>
      </td></tr>
    </table>`;
}

/**
 * The day timeline.
 *
 * The export drew a hand-lettered winding path in SVG with the three times
 * absolutely positioned around it. Gmail removes inline SVG and Outlook
 * ignores absolute positioning, so the whole thing would have vanished or
 * collapsed into a heap.
 *
 * Rebuilt as a centre rule with the times alternating left and right of it,
 * which keeps the alternating rhythm and the connected-path feeling using
 * only table cells and borders. A dot sits on the rule at each stop.
 */
function timeline(events) {
  const rule = (half) => `
    <td width="40" align="center" valign="top" style="width:40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" height="100%">
        <tr><td width="1" height="18" style="width:1px;height:18px;background:${half === 'first' ? 'transparent' : P.faint};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td width="9" height="9" style="width:9px;height:9px;background:${P.greenMid};border-radius:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td width="1" height="46" style="width:1px;height:46px;background:${half === 'last' ? 'transparent' : P.faint};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td>`;

  const stop = (event, index) => {
    const onLeft = index % 2 === 0;
    const half = index === 0 ? 'first' : (index === events.length - 1 ? 'last' : 'middle');

    const block = (align) => `
      <div style="font:italic 400 22px/1.1 ${SERIF};color:${P.greenMid};">${esc(event.time)}</div>
      <div style="margin-top:5px;font:700 10px/1.4 ${SANS};letter-spacing:2px;text-transform:uppercase;color:${P.ink};">${esc(event.name)}</div>`;

    return `
      <tr>
        <td width="45%" align="right" valign="top" style="padding:0 14px 0 0;">${onLeft ? block('right') : '&nbsp;'}</td>
        ${rule(half)}
        <td width="45%" align="left" valign="top" style="padding:0 0 0 14px;">${onLeft ? '&nbsp;' : block('left')}</td>
      </tr>`;
  };

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:400px;margin:0 auto;">
      ${events.map(stop).join('')}
      <tr>
        <td width="45%">&nbsp;</td>
        <td width="40" align="center" style="padding-top:2px;font:400 18px/1 Georgia,serif;color:${P.faint};">&#9825;</td>
        <td width="45%">&nbsp;</td>
      </tr>
    </table>`;
}

/**
 * The plus-one card.
 *
 * Returns '' when the guest never asked for one — a guest who did not request
 * a plus one should not be told anything about plus ones at all, and that
 * includes the section heading above it.
 */
/**
 * A compact line per event, for the plus one's own invitation.
 *
 * Deliberately lighter than the main guest's badge — this is their guest's
 * invitation shown inside theirs, so it should read as a nested detail rather
 * than compete with "Your Invitation" above it.
 */
const plusOneEventRow = (event, isLast) => `
  <tr>
    <td width="22" valign="top" style="padding:7px 0;">
      <span style="font:400 13px/1.4 ${SANS};color:${P.greenMid};">&#10003;</span>
    </td>
    <td valign="top" style="padding:7px 0;border-bottom:${isLast ? '0' : `1px solid ${P.plusRule}`};">
      <span style="font:700 14px/1.4 ${SERIF};color:${P.green};">${esc(event.name)}</span>
    </td>
    <td valign="top" align="right" style="padding:7px 0;border-bottom:${isLast ? '0' : `1px solid ${P.plusRule}`};white-space:nowrap;">
      <span style="font:600 12px/1.5 ${SANS};color:${P.gold};letter-spacing:1px;">${esc(event.time)}</span>
    </td>
  </tr>`;

/**
 * The plus-one card.
 *
 * Returns '' when the guest never asked for one — a guest who did not request
 * a plus one should not be told anything about plus ones at all, including
 * the heading above the card.
 *
 * When approved, the events listed are the PLUS ONE's own, from
 * plus_one_approved_for. They are not derived from the main guest's
 * invitation and do not fall back to it: a couple may seat someone's guest at
 * the reception without a place at the service, and the email has to be able
 * to say exactly that.
 */
function plusOneSection(state, plusOneName, plusOneEvents = []) {
  if (state === 'none' || state === 'pending') return '';

  const guestName = plusOneName ? esc(plusOneName) : 'your guest';

  const eventList = plusOneEvents.length ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin:16px 0 0;border-top:1px solid ${P.plusRule};">
          <tr><td colspan="3" style="padding:14px 0 6px;font:600 10px/1.6 ${SANS};letter-spacing:2.5px;text-transform:uppercase;color:${P.gold};text-align:left;">
            ${plusOneName ? `${guestName} is invited to` : 'Your guest is invited to'}
          </td></tr>
          ${plusOneEvents.map((e, i) => plusOneEventRow(e, i === plusOneEvents.length - 1)).join('')}
        </table>` : '';

  const body = state === 'approved' ? `
    <!-- Plus one: confirmed -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${P.plusBg};border:1px solid ${P.plusRule};border-radius:12px;">
      <tr><td style="padding:28px 32px;text-align:center;">
        <div style="font-size:32px;line-height:1;margin-bottom:12px;">&#127881;</div>
        <div style="font:700 19px/1.4 ${SERIF};color:${P.green};margin-bottom:10px;">
          Great news!
        </div>
        <div style="font:400 15px/1.7 ${SANS};color:${P.plusInk};">
          We&rsquo;ve reserved a seat for ${plusOneName ? `<strong>${guestName}</strong>` : 'your guest'}
          and look forward to welcoming both of you as we celebrate together.
        </div>
        ${eventList}
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid ${P.plusRule};font:400 13px/1.6 ${SANS};color:${P.muted};">
          Do share the timeline and dress guide below with them.
        </div>
      </td></tr>
    </table>` : `
    <!-- Plus one: not accommodated -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${P.card};border:1px solid ${P.rule};border-radius:12px;">
      <tr><td style="padding:28px 32px;text-align:center;">
        <!-- Read by someone who asked for a guest and is being told no. It
             says what happened and why, thanks them, and stops — there is no
             version of this that is improved by more words. -->
        <div style="font:400 15px/1.8 ${SANS};color:${P.ink};">
          Due to venue capacity, we were only able to reserve a seat for you.
          We truly wish we could accommodate everyone, and we&rsquo;re grateful for
          your understanding.
        </div>
      </td></tr>
    </table>`;

  return `
    <tr><td style="padding:0 56px 48px;">
      <div style="text-align:center;">
        ${eyebrow('Plus One Status')}
        ${heading('Your Guest', '28px')}
      </div>
      ${body}
    </td></tr>`;
}

/** The plain-text alternative. Every client shows this if HTML is blocked. */
function plainText({ name, events, days, state, plusOneName, plusOneEvents = [] }) {
  const lines = [
    UPDATE.label().toUpperCase(),
    days > 1 ? `${days} DAYS TO GO` : days === 1 ? 'ONE DAY TO GO' : "TODAY'S THE DAY",
    UPDATE.title,
    `Princess & IniOluwa  ·  ${WEDDING.dateHeadline}`,
    '',
    `Dear ${name},`,
    '',
    'Thank you for taking the time to RSVP to our wedding. We\'re truly grateful',
    'for your love, prayers and support.',
    '',
    'We\'re so excited to celebrate this special day with you.',
    '',
    'Your RSVP has now been reviewed, and below you\'ll find everything you need',
    'to know about your invitation, the parts of the celebration you\'ve been',
    'invited to, the venue, dress guide and a few final details before the big',
    'day.',
    '',
    'CONFIRMED FOR',
    ...events.map(e => `  ${e.time.padEnd(9)} ${e.name}`),
    '',
    events.length > 1
      ? `All ${events.length === 3 ? 'three' : 'these'} celebrations take place on ${WEDDING.dateLong}.`
      : `This takes place on ${WEDDING.dateLong}.`,
    '',
    'WHERE EVERYTHING WILL HAPPEN',
    `  ${WEDDING.venueName}`,
    `  ${WEDDING.venueArea}`,
    `  ${MAP_URL}`,
  ];

  if (state === 'approved') {
    lines.push('', 'YOUR GUEST',
      `  Great news! We've reserved a seat for ${plusOneName || 'your guest'} and look`,
      '  forward to welcoming both of you as we celebrate together.');
    if (plusOneEvents.length) {
      lines.push('', `  ${plusOneName || 'Your guest'} is invited to:`,
        ...plusOneEvents.map(e => `    ${e.time.padEnd(9)} ${e.name}`));
    }
    lines.push('  Do share the timeline and dress guide below with them.');
  } else if (state === 'declined') {
    lines.push('', 'YOUR GUEST',
      '  Due to venue capacity, we were only able to reserve a seat for you.',
      '  We truly wish we could accommodate everyone, and we\'re grateful for',
      '  your understanding.');
  }

  lines.push(
    '', 'DRESS GUIDE',
    '  Our celebration is inspired by the beauty of a flourishing garden —',
    '  Eden in Full Bloom. The full guide is in the images of this email.',
    '', 'WEDDING REGISTRY',
    '  Your presence means the world to us, and that is truly the greatest gift',
    '  we could receive. For those who have asked how they can support us as we',
    '  begin this new chapter together:',
    `  ${REGISTRY_URL}`,
    '',
    '  If you\'d prefer to make a direct transfer, you can also use:',
    ...BANK_ACCOUNTS.flatMap(a => [
      `    ${a.name}`,
      `    ${a.bank}`,
      `    ${a.number}`,
      '',
    ]),
    'Thank you for being part of one of the most important days of our lives.',
    '',
    'We truly can\'t wait to celebrate with you in Abuja.',
    '',
    'With love,',
    WEDDING.couple,
    '',
    `SATURDAY · 26 SEPTEMBER 2026`,
    `${WEDDING.venueName}, ${WEDDING.venueArea}`,
  );

  return lines.join('\n');
}

/**
 * Renders the pack for one guest.
 *
 * @param row      the rsvps row
 * @param assets   artwork URLs, keyed as in config.ASSET_FILES
 * @param rsvpUrl  the live site, linked from the footer
 * @param now      injected so the countdown is testable
 */
export function renderConfirmationPack(row, { assets, rsvpUrl, now = new Date() }) {
  const name   = firstName(row);
  const events = eventsForGuest(row);
  const days   = daysUntil(WEDDING.date, now);
  const state  = plusOneState(row);
  const hero   = heroFor(events);
  const heroSrc = hero ? assets[hero] : null;
  const backdrop = assets.backdrop ?? null;
  // The plus one's own invitation, independent of the main guest's.
  const plusOneEvents = state === 'approved' ? eventsForPlusOne(row) : [];

  // Named from the event itself, so the alt text cannot drift from the label.
  const heroAlt = events.length
    ? `${WEDDING.couple} — ${events[0].name} invitation`
    : `${WEDDING.couple} invitation`;

  // "All three celebrations take place on…" only reads correctly for three.
  const allOnDay = events.length === 1
    ? `This takes place on ${WEDDING.dateLong}`
    : `All ${events.length === 3 ? 'three ' : ''}celebrations take place on ${WEDDING.dateLong}`;

  const html = shellTop({
    backdrop,
    preheader: `${days > 0 ? `${days} days to go` : 'Today is the day'} &middot; ${esc(WEDDING.venueName)}, ${esc(WEDDING.venueArea)}`,
  }) + `
        <!-- ── MASTHEAD ──────────────────────────────────────────────────── -->
        <!-- The numbered label does the work here: it tells a guest who has
             already RSVP'd that this is not another invitation, and that more
             will follow. See UPDATE in config.mjs. -->
        <tr><td class="pad" style="padding:44px 56px 32px;text-align:center;">
          <p style="margin:0 0 14px;font:700 11px/1.6 ${SANS};letter-spacing:3px;
                    text-transform:uppercase;color:${P.gold};">
            ${esc(UPDATE.label())}
          </p>
          <table role="presentation" width="28" cellpadding="0" cellspacing="0" border="0" align="center"
                 style="margin:0 auto 14px;">
            <tr><td height="1" style="height:1px;background:${P.rule};font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
          <!-- The countdown steps back so the confirmation carries the
               section. It was 22px italic against a 32px title, close enough
               in weight that the eye landed on the number first — which is
               not why this email was sent. -->
          <p style="margin:0 0 12px;font:italic 400 17px/1.3 ${SERIF};color:${P.muted};">
            ${UPDATE.headline(days)}
          </p>
          <h1 class="h1" style="margin:0 0 14px;font:700 34px/1.25 ${SERIF};color:${P.green};">
            ${esc(UPDATE.title)}
          </h1>
          <p style="margin:0;font:600 12px/1.7 ${SANS};letter-spacing:2px;color:${P.muted};">
            ${esc(WEDDING.couple)} &bull; ${esc(WEDDING.dateHeadline)}
          </p>
        </td></tr>

        <!-- ── HERO ──────────────────────────────────────────────────────── -->
        <!-- Full bleed. The invitation artwork is the strongest thing in the
             email, so it runs edge to edge rather than sitting inside a
             margin: an 85% inset made it read as an illustration ON the card
             instead of as the card's own face. -->
        ${heroSrc ? `
        <tr><td style="padding:0;font-size:0;line-height:0;">
          ${artwork(hero, heroSrc, heroAlt)}
        </td></tr>` : ''}

        <!-- ── GREETING ──────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:38px 56px 40px;text-align:center;">
          <p style="margin:0 0 12px;font:400 16px/1.7 ${SANS};color:${P.ink};">Dear ${esc(name)},</p>
          <p style="margin:0 0 12px;font:400 16px/1.8 ${SANS};color:${P.ink};">
            Thank you for taking the time to RSVP to our wedding. We&rsquo;re truly
            grateful for your love, prayers and support.
          </p>
          <p style="margin:0 0 12px;font:400 16px/1.8 ${SANS};color:${P.ink};">
            We&rsquo;re so excited to celebrate this special day with you.
          </p>
          <p style="margin:0 0 12px;font:400 16px/1.8 ${SANS};color:${P.ink};">
            Your RSVP has now been reviewed, and below you&rsquo;ll find everything you
            need to know about your invitation, the parts of the celebration
            you&rsquo;ve been invited to, the venue, dress guide and a few final
            details before the big day.
          </p>

        </td></tr>

        ${divider()}

        <!-- ── YOUR INVITATION ───────────────────────────────────────────── -->
        <!-- Built from the guest's own event list, so an uninvited part of the
             day cannot leak into the markup. -->
        <tr><td class="pad" style="padding:0 56px 48px;">
          <div style="text-align:center;">
            ${eyebrow('Confirmed For')}
            ${heading('Your Invitation')}
          </div>
          ${events.map(eventBadge).join('')}
          <p style="margin:20px 0 0;font:400 13px/1.6 ${SANS};color:${P.muted};text-align:center;">
            ${esc(allOnDay)}
          </p>
        </td></tr>

        <!-- ── DAY SCHEDULE ──────────────────────────────────────────────── -->
        <tr><td class="pad-sm" style="padding:48px 40px 56px;background:${P.alt};">
          <div style="text-align:center;">
            ${eyebrow('Saturday, 26 September 2026')}
            ${heading('Your Wedding Day Timeline', '48px')}
          </div>
          ${calendarStrip()}
          <div style="height:48px;font-size:0;line-height:0;">&nbsp;</div>
          ${timeline(events)}
        </td></tr>

        <!-- ── VENUE ─────────────────────────────────────────────────────── -->
        <tr><td class="pad-sm" style="padding:48px 28px;text-align:center;">
          ${eyebrow('Where Everything Will Happen')}
          <h2 class="h2" style="margin:0 0 8px;font:700 28px/1.25 ${SERIF};color:${P.green};">
            ${esc(WEDDING.venueName)}
          </h2>
          <p style="margin:0 0 28px;font:400 14px/1.6 ${SANS};color:${P.muted};letter-spacing:1px;">
            ${esc(WEDDING.venueArea)}
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border:1px solid ${P.rule};border-radius:12px;overflow:hidden;background:${P.card};">
            ${assets.venue ? `<tr><td style="font-size:0;line-height:0;">${artwork('venue', assets.venue, `${WEDDING.venueName} — watercolour illustration`, LAYOUT.card - 58)}</td></tr>` : ''}
            <tr><td style="padding:24px 32px;border-top:1px solid ${P.rule};text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr><td style="border:1px solid ${P.greenMid};border-radius:4px;">
                  <a href="${esc(MAP_URL)}"
                     style="display:inline-block;padding:12px 32px;font:700 12px/1 ${SANS};
                            letter-spacing:2.5px;text-transform:uppercase;color:${P.green};text-decoration:none;">
                    &#128205; Open in Google Maps
                  </a>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${state === 'approved' || state === 'declined' ? divider() : ''}

        ${plusOneSection(state, row.plus_one_name, plusOneEvents)}

        <!-- ── DRESS GUIDE ───────────────────────────────────────────────── -->
        <!-- The artwork already carries the palette and both attire guides.
             Nothing is restated here; it would only ever disagree with it. -->
        <tr><td style="padding:36px 0 0;background:${P.alt};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="pad" style="padding:0 56px 24px;text-align:center;">
              ${eyebrow('What to Wear')}
              <h2 class="h2" style="margin:0 0 12px;font:700 28px/1.25 ${SERIF};color:${P.green};">Dress Guide</h2>
              <p style="margin:0;font:400 15px/1.6 ${SANS};color:${P.muted};">
                Our celebration is inspired by the beauty of a flourishing garden &mdash; Eden in Full Bloom.
              </p>
            </td></tr>
            <tr><td style="font-size:0;line-height:0;">
              ${artwork('dress-guide', assets['dress-guide'], 'Dress Guide — Eden in Full Bloom: garden colour palette, English formal for gentlemen, royal garden elegance for ladies')}
            </td></tr>
          </table>
        </td></tr>

        <!-- ── REGISTRY ──────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:56px 56px 48px;text-align:center;">
          ${eyebrow('A Note on Gifts')}
          <h2 class="h2" style="margin:0 0 20px;font:700 28px/1.25 ${SERIF};color:${P.green};">Wedding Registry</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border:1px solid ${P.rule};border-radius:16px;background:${P.panel};">
            <tr><td class="pad-sm" style="padding:36px 40px;text-align:center;">
              <p style="margin:0 0 16px;font:italic 400 17px/1.8 ${SERIF};color:${P.ink};">
                Your presence means the world to us, and that is truly the
                greatest gift we could receive.
              </p>
              <p style="margin:0 0 28px;font:400 15px/1.8 ${SANS};color:${P.muted};">
                For those who have asked how they can support us as we begin this
                new chapter together, we&rsquo;ve created a wedding registry below.
              </p>
              <table role="presentation" width="48" cellpadding="0" cellspacing="0" border="0" align="center"
                     style="margin:0 auto 28px;">
                <tr><td height="1" style="height:1px;background:${P.gold};font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <!-- Bulletproof button: the table gives Outlook a background it
                   will actually paint, since it ignores background on <a>. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr><td style="background:${P.greenMid};border-radius:4px;">
                  <a href="${esc(REGISTRY_URL)}"
                     style="display:inline-block;padding:16px 40px;font:600 14px/1 ${SANS};
                            letter-spacing:2px;text-transform:uppercase;color:${P.card};text-decoration:none;">
                    View Our Wedding Registry
                  </a>
                </td></tr>
              </table>
              <p style="margin:16px 0 0;font:400 12px/1.6 ${SANS};color:${P.muted};">
                ouish.co/princess-and-ini-wedding
              </p>

              <!-- Direct transfer: the quieter alternative, inside the same
                   panel and below the registry, so the registry keeps the only
                   heading and the only button. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin:32px 0 0;border-top:1px solid ${P.rule};">
                <tr><td style="padding:26px 0 0;text-align:center;">
                  <p style="margin:0;font:400 15px/1.7 ${SANS};color:${P.muted};">
                    If you&rsquo;d prefer to make a direct transfer, you can also use:
                  </p>
                </td></tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin:18px 0 0;border:1px solid ${P.rule};border-radius:12px;background:${P.card};">
                ${BANK_ACCOUNTS.map((a, i) => `
                <tr><td style="padding:18px 22px;${i ? `border-top:1px solid ${P.rule};` : ''}text-align:center;">
                  <div style="font:700 16px/1.4 ${SERIF};color:${P.green};">${esc(a.name)}</div>
                  <div style="margin-top:4px;font:400 13px/1.6 ${SANS};letter-spacing:1px;color:${P.muted};">${esc(a.bank)}</div>
                  <!-- Digits unbroken and unspaced: whatever is copied has to
                       paste straight into a banking app. The letter-spacing is
                       presentational and does not travel with the selection. -->
                  <div class="acct" style="margin-top:6px;font:600 18px/1.4 ${SANS};letter-spacing:2px;color:${P.ink};
                              -webkit-user-select:all;-moz-user-select:all;-ms-user-select:all;user-select:all;">${esc(a.number)}</div>
                </td></tr>`).join('')}
                <tr><td style="padding:0 22px 16px;text-align:center;">
                  <div style="font:400 11px/1.5 ${SANS};letter-spacing:1px;text-transform:uppercase;color:${P.faint};">
                    Tap and hold to copy
                  </div>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${divider()}

        <!-- ── CLOSING ───────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:8px 56px 56px;text-align:center;">
          <p style="margin:0 0 12px;font:400 16px/1.8 ${SANS};color:${P.ink};">
            We truly can&rsquo;t wait to celebrate with you.
          </p>
          <p style="margin:0 0 26px;font:400 16px/1.8 ${SANS};color:${P.ink};">
            Thank you for being part of one of the most important days of our lives.
          </p>
          <p style="margin:0 0 30px;font:italic 400 18px/1.7 ${SERIF};color:${P.greenMid};">
            We truly can&rsquo;t wait to celebrate with you in Abuja.
          </p>
          <p style="margin:0 0 8px;font:400 14px/1.6 ${SANS};color:${P.muted};letter-spacing:1px;">
            With love,
          </p>
          <div class="sig" style="font:italic 400 36px/1.3 ${SERIF};color:${P.green};">
            ${esc(WEDDING.couple)}
          </div>
        </td></tr>
` + shellBottom({ rsvpUrl });


  return {
    html,
    text: plainText({ name, events, days, state, plusOneName: row.plus_one_name, plusOneEvents }),
    events,
    days,
    plusOne: state,
    plusOneEvents,
    hero,
  };
}
