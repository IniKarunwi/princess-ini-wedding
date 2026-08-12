/**
 * The Wedding Confirmation & Information Pack — pure rendering, no I/O.
 *
 * Sent to guests who have ALREADY RSVP'd. It is not persuasion; it is the
 * answer to every question they would otherwise have to message about: where
 * am I going, what time, can I bring someone, what do I wear, how do I give.
 *
 * ── Why the markup looks like 2004 ─────────────────────────────────────────
 * Email HTML is not web HTML. Outlook renders through Word — no flexbox, no
 * grid, no border-radius on most elements, no background-image. Gmail strips
 * <style> blocks in several contexts. So: nested tables, inline styles only,
 * no web fonts, and every colour stated explicitly because dark-mode clients
 * invert anything left unpainted.
 *
 * ── The one rule that matters ──────────────────────────────────────────────
 * A guest is shown ONLY the events they are invited to. Not greyed out, not
 * marked unavailable — absent. Someone invited to the Reception alone must
 * finish this email unaware that an After Party exists. Every section below
 * is built from `events`, never from the full list.
 */

import { WEDDING, REGISTRY_URL, MAP_URL, PALETTE as P } from './config.mjs';
import { eventsForGuest, heroFor, daysUntil, plusOneState } from './events.mjs';
import { firstName } from './recipients.mjs';

/** Escapes text interpolated into HTML. Names come from a spreadsheet. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Type stacks. No web fonts — Gmail and Outlook ignore them, and a half-loaded
   display face looks worse than a well-set fallback. Georgia carries the
   invitation's serif warmth; the letter-spaced sans matches the artwork's
   small-caps labels. */
const SERIF  = "Georgia,'Times New Roman',Times,serif";
const SANS   = "'Helvetica Neue',Helvetica,Arial,sans-serif";

const label = (text, color = P.muted) =>
  `<p style="margin:0;font:400 11px/1.7 ${SANS};letter-spacing:.22em;` +
  `text-transform:uppercase;color:${color};">${esc(text)}</p>`;

/** The small gold fleuron used between sections in the printed suite. */
const divider = () => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:0 0 0 0;">
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="70" style="height:1px;background:${P.rule};font-size:0;line-height:0;">&nbsp;</td>
            <td style="padding:0 12px;font:400 13px/1 ${SERIF};color:${P.goldSoft};">&#10022;</td>
            <td width="70" style="height:1px;background:${P.rule};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

/** A full-bleed artwork. Width is set as an attribute for Outlook's benefit. */
const artwork = (src, alt) => `
  <tr><td style="padding:0;font-size:0;line-height:0;">
    <img src="${esc(src)}" alt="${esc(alt)}" width="600"
         style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
  </td></tr>`;

/** One card in "Your Invitation" — a tick, the event, and a line about it. */
const inviteCard = (event) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:0 0 10px;background:${P.cream};border:1px solid ${P.rule};">
    <tr>
      <td width="46" valign="top" style="padding:16px 0 16px 18px;">
        <span style="font:400 17px/1 ${SANS};color:${P.gold};">&#10003;</span>
      </td>
      <td valign="top" style="padding:15px 20px 16px 0;">
        <p style="margin:0;font:400 17px/1.4 ${SERIF};color:${P.green};">${esc(event.name)}</p>
        <p style="margin:3px 0 0;font:400 13px/1.6 ${SERIF};color:${P.muted};">${esc(event.blurb)}</p>
      </td>
    </tr>
  </table>`;

/** One row of the schedule: time on the left, event on the right. */
const scheduleRow = (event, isLast) => `
  <tr>
    <td width="96" valign="top"
        style="padding:14px 0;border-bottom:${isLast ? '0' : `1px solid ${P.rule}`};">
      <p style="margin:0;font:400 15px/1.4 ${SERIF};color:${P.gold};">${esc(event.time)}</p>
    </td>
    <td valign="top"
        style="padding:14px 0;border-bottom:${isLast ? '0' : `1px solid ${P.rule}`};">
      <p style="margin:0;font:400 16px/1.4 ${SERIF};color:${P.green};">${esc(event.name)}</p>
    </td>
  </tr>`;

/**
 * The plus-one card.
 *
 * Returns '' when the guest never asked for one — a guest who did not request
 * a plus one should not be told anything about plus ones at all.
 */
function plusOneCard(state, plusOneName) {
  if (state === 'none' || state === 'pending') return '';

  const named = plusOneName ? ` ${esc(plusOneName)}` : '';

  if (state === 'approved') {
    return `
      <!-- Plus one: confirmed -->
      <tr><td style="padding:0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${P.cream};border:1px solid ${P.goldSoft};">
          <tr><td style="padding:24px 26px;text-align:center;">
            ${label('Your Plus One', P.gold)}
            <p style="margin:10px 0 0;font:400 19px/1.5 ${SERIF};color:${P.green};">
              &#127881; Your Plus One has been confirmed
            </p>
            <p style="margin:8px 0 0;font:400 15px/1.7 ${SERIF};color:${P.muted};">
              We&rsquo;re delighted to welcome both of you${named ? `, you and${named}` : ''}.
            </p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="height:26px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
  }

  // Declined. Warm on purpose — this is the paragraph most likely to be
  // forwarded to the person who is not coming.
  return `
    <!-- Plus one: not accommodated -->
    <tr><td style="padding:0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:${P.cream};border:1px solid ${P.rule};">
        <tr><td style="padding:24px 26px;text-align:center;">
          ${label('Your Plus One')}
          <p style="margin:10px 0 0;font:400 15px/1.75 ${SERIF};color:${P.ink};">
            Because seating is extremely limited, we&rsquo;re unfortunately unable
            to accommodate a Plus One for your invitation. We truly appreciate
            your understanding and can&rsquo;t wait to celebrate with you.
          </p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="height:26px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

/** The plain-text alternative. Every client shows this if HTML is blocked. */
function plainText({ name, events, days, state, plusOneName }) {
  const lines = [
    `Dear ${name},`,
    '',
    'Thank you for taking the time to RSVP to our wedding. We\'re truly grateful',
    'for your love, prayers and support, and we\'re so excited to celebrate this',
    'special day with you.',
    '',
    days > 0
      ? `We're now ${days} days away from saying "I do."`
      : 'Today is the day.',
    '',
    'YOUR INVITATION',
    ...events.map(e => `  - ${e.name}`),
    '',
    'SCHEDULE',
    ...events.map(e => `  ${e.time.padEnd(10)} ${e.name}`),
    '',
    'VENUE',
    `  ${WEDDING.venueName}`,
    `  ${WEDDING.venueArea}`,
    `  ${MAP_URL}`,
    '',
    `  ${WEDDING.dateLong}`,
  ];

  if (state === 'approved') {
    lines.push('', 'YOUR PLUS ONE',
      `  Confirmed. We're delighted to welcome both of you${plusOneName ? `, you and ${plusOneName}` : ''}.`);
  } else if (state === 'declined') {
    lines.push('', 'YOUR PLUS ONE',
      '  Because seating is extremely limited, we\'re unfortunately unable to',
      '  accommodate a Plus One for your invitation. We truly appreciate your',
      '  understanding and can\'t wait to celebrate with you.');
  }

  lines.push(
    '', 'WHAT TO WEAR',
    '  Eden in Full Bloom — garden colours, English formal. The full dress',
    '  guide is in the images of this email.',
    '', 'OUR REGISTRY',
    '  Many of you have asked how you\'d like to bless us as we begin this new',
    '  chapter together. If you\'d like to support us with a gift:',
    `  ${REGISTRY_URL}`,
    '',
    'We truly can\'t wait to celebrate with you. Thank you for being part of one',
    'of the most important days of our lives.',
    '',
    'With love,',
    WEDDING.couple,
  );

  return lines.join('\n');
}

/**
 * Renders the pack for one guest.
 *
 * @param row      the rsvps row
 * @param assets   { joining, reception, 'after-party', 'dress-guide' } URLs
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

  const heroAlt = hero === 'joining'
    ? `${WEDDING.couple} — Joining Ceremony invitation`
    : hero === 'reception'
      ? `${WEDDING.couple} — Reception invitation`
      : `${WEDDING.couple} — After Party invitation`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(WEDDING.couple)} &middot; ${esc(WEDDING.dateLong)}</title>
<!--[if mso]>
<style>body,table,td,p,a{font-family:Georgia,'Times New Roman',serif !important;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:${P.cream};-webkit-font-smoothing:antialiased;">

  <!-- Preheader: the grey line beside the subject in the inbox. The spacer run
       stops the client pulling body copy in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Everything you need for ${esc(WEDDING.dateLong)} &middot; ${esc(WEDDING.venueArea)}
    ${'&#8203;&nbsp;'.repeat(60)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${P.cream};">
    <tr><td align="center" style="padding:28px 12px 40px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;background:${P.card};border:1px solid ${P.rule};">

        <!-- Gold rule, as on the printed suite -->
        <tr><td style="height:6px;background:${P.gold};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- ── HERO ──────────────────────────────────────────────────────── -->
        ${heroSrc ? artwork(heroSrc, heroAlt) : ''}

        <!-- ── THANK YOU ─────────────────────────────────────────────────── -->
        <tr><td style="padding:38px 40px 0;text-align:center;">
          ${label('Thank you for RSVPing', P.gold)}
          <p style="margin:16px 0 0;font:italic 400 27px/1.35 ${SERIF};color:${P.green};">
            ${esc(WEDDING.bride)} &amp; ${esc(WEDDING.groom)}
          </p>
        </td></tr>

        <tr><td style="padding:24px 40px 0;">
          <p style="margin:0;font:400 16px/1.8 ${SERIF};color:${P.ink};">
            Dear ${esc(name)},
          </p>
          <p style="margin:14px 0 0;font:400 16px/1.8 ${SERIF};color:${P.ink};">
            Thank you for taking the time to RSVP to our wedding. We&rsquo;re truly
            grateful for your love, prayers and support, and we&rsquo;re so excited
            to celebrate this special day with you.
          </p>
          <p style="margin:14px 0 0;font:400 16px/1.8 ${SERIF};color:${P.ink};">
            Below are all the important details you&rsquo;ll need for the day.
          </p>
        </td></tr>

        <!-- ── COUNTDOWN ─────────────────────────────────────────────────── -->
        <tr><td style="padding:28px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:${P.cream};border-top:1px solid ${P.rule};border-bottom:1px solid ${P.rule};">
            <tr><td style="padding:22px 20px;text-align:center;">
              ${days > 0 ? `
              <p style="margin:0;font:400 40px/1 ${SERIF};color:${P.green};">${days}</p>
              <p style="margin:8px 0 0;font:400 11px/1.7 ${SANS};letter-spacing:.22em;text-transform:uppercase;color:${P.muted};">
                days until we say &ldquo;I do&rdquo;
              </p>` : `
              <p style="margin:0;font:italic 400 24px/1.3 ${SERIF};color:${P.green};">Today is the day</p>`}
            </td></tr>
          </table>
        </td></tr>

        <!-- ── YOUR INVITATION ───────────────────────────────────────────── -->
        <!-- Built from the guest's own event list, so an uninvited part of the
             day cannot leak into the markup. -->
        <tr><td style="padding:34px 40px 0;text-align:center;">
          ${divider()}
          <p style="margin:20px 0 4px;font:400 22px/1.35 ${SERIF};color:${P.green};">Your Invitation</p>
          <p style="margin:0 0 20px;font:400 14px/1.7 ${SERIF};color:${P.muted};">
            You are warmly invited to ${events.length > 1 ? 'the following' : 'our'}:
          </p>
        </td></tr>

        <tr><td style="padding:0 40px;">
          ${events.map(inviteCard).join('')}
        </td></tr>

        <!-- ── SCHEDULE ──────────────────────────────────────────────────── -->
        <tr><td style="padding:30px 40px 0;text-align:center;">
          ${label('Schedule')}
        </td></tr>
        <tr><td style="padding:6px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${events.map((e, i) => scheduleRow(e, i === events.length - 1)).join('')}
          </table>
        </td></tr>

        <!-- ── VENUE ─────────────────────────────────────────────────────── -->
        <tr><td style="padding:30px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:${P.green};">
            <tr><td style="padding:26px 26px;text-align:center;">
              ${label('Venue', P.goldSoft)}
              <p style="margin:12px 0 0;font:400 21px/1.4 ${SERIF};color:#ffffff;">
                ${esc(WEDDING.venueName)}
              </p>
              <p style="margin:5px 0 0;font:400 15px/1.6 ${SERIF};color:${P.goldSoft};">
                ${esc(WEDDING.venueArea)}
              </p>
              <p style="margin:14px 0 0;font:400 14px/1.6 ${SERIF};color:#ffffff;">
                ${esc(WEDDING.dateLong)}
              </p>
              <p style="margin:16px 0 0;">
                <a href="${esc(MAP_URL)}"
                   style="font:400 12px/1 ${SANS};letter-spacing:.16em;text-transform:uppercase;
                          color:${P.goldSoft};text-decoration:none;border-bottom:1px solid ${P.goldSoft};
                          padding-bottom:3px;">
                  Open in maps
                </a>
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="height:26px;font-size:0;line-height:0;">&nbsp;</td></tr>

        ${plusOneCard(state, row.plus_one_name)}

        <!-- ── DRESS GUIDE ───────────────────────────────────────────────── -->
        <!-- The artwork already carries the palette and both attire guides.
             Nothing is restated here; it would only ever disagree with it. -->
        <tr><td style="padding:8px 40px 0;text-align:center;">
          ${divider()}
          <p style="margin:20px 0 4px;font:400 22px/1.35 ${SERIF};color:${P.green};">What to Wear</p>
          <p style="margin:0 0 18px;font:italic 400 15px/1.7 ${SERIF};color:${P.gold};">
            Eden in Full Bloom
          </p>
        </td></tr>
        ${artwork(assets['dress-guide'], 'Dress guide — Eden in Full Bloom: garden colour palette, English formal for gentlemen, royal garden elegance for ladies')}
        <tr><td style="height:30px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- ── REGISTRY ──────────────────────────────────────────────────── -->
        <tr><td style="padding:0 40px;text-align:center;">
          ${divider()}
          <p style="margin:20px 0 0;font:400 22px/1.35 ${SERIF};color:${P.green};">Our Registry</p>
          <p style="margin:12px 0 0;font:400 16px/1.8 ${SERIF};color:${P.ink};text-align:left;">
            Many of you have asked how you&rsquo;d like to bless us as we begin this
            new chapter together. If you&rsquo;d like to support us with a gift,
            we&rsquo;ve prepared our wedding registry below.
          </p>
        </td></tr>

        <tr><td style="padding:24px 40px 0;text-align:center;">
          <!-- Bulletproof button: the table gives Outlook a background it will
               actually paint, since it ignores background on <a>. -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr><td style="background:${P.gold};">
              <a href="${esc(REGISTRY_URL)}"
                 style="display:inline-block;padding:16px 38px;font:400 13px/1 ${SANS};
                        letter-spacing:.16em;text-transform:uppercase;color:#ffffff;text-decoration:none;">
                View Our Wedding Registry
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- ── CLOSING ───────────────────────────────────────────────────── -->
        <tr><td style="padding:38px 40px 0;text-align:center;">
          ${divider()}
        </td></tr>
        <tr><td style="padding:22px 40px 44px;text-align:center;">
          <p style="margin:0;font:400 16px/1.8 ${SERIF};color:${P.ink};">
            We truly can&rsquo;t wait to celebrate with you. Thank you for being part
            of one of the most important days of our lives.
          </p>
          <p style="margin:22px 0 0;font:italic 400 16px/1.6 ${SERIF};color:${P.muted};">
            With love,
          </p>
          <p style="margin:6px 0 0;font:italic 400 25px/1.4 ${SERIF};color:${P.green};">
            ${esc(WEDDING.couple)}
          </p>
        </td></tr>

        <tr><td style="height:6px;background:${P.gold};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;">
        <tr><td style="padding:20px 24px 0;text-align:center;">
          <p style="margin:0;font:400 12px/1.8 ${SERIF};color:#9d9484;">
            Need to change anything? Simply reply to this email &mdash; it reaches us directly.
          </p>
          <p style="margin:8px 0 0;font:400 12px/1.8 ${SERIF};color:#9d9484;">
            <a href="${esc(rsvpUrl)}" style="color:#9d9484;">${esc(rsvpUrl)}</a>
          </p>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;

  return {
    html,
    text: plainText({ name, events, days, state, plusOneName: row.plus_one_name }),
    events,
    days,
    plusOne: state,
    hero,
  };
}
