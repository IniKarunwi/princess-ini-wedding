/**
 * Wedding Update #2 — the thirty-day note. Pure rendering, no I/O.
 *
 * Short and informational: where to stay, and the registry. Not an invitation
 * and not a confirmation, so it asks for nothing back and carries no RSVP link.
 *
 * ── Not a redesign ─────────────────────────────────────────────────────────
 * Every visual decision comes from the confirmation pack: the same shell from
 * chrome.mjs, the same palette, type stacks, card width, doodle backdrop,
 * masthead, gold eyebrow labels, ✦ ◆ ✦ dividers and dark green footer. Only
 * the content rows differ, which is the point — a guest should recognise this
 * as the next letter in the same series before reading a word.
 *
 * ── Why it carries no artwork ──────────────────────────────────────────────
 * The hero watercolours belong to the invitation. Repeating one here would
 * make a short informational note look like a second invitation, which is the
 * exact confusion the numbered masthead exists to prevent. The backdrop stays,
 * so the email is still unmistakably ours.
 *
 * ── The one rule that still applies ────────────────────────────────────────
 * A guest is shown only the events they are invited to. This email does not
 * enumerate the day, so the rule mostly has nothing to bite on — but the
 * closing line names what they are coming to, and that is built from their own
 * event list, never from the full set.
 */

import {
  WEDDING, REGISTRY_URL, STAY, PALETTE as P, UPDATE_THIRTY, LAYOUT,
} from './config.mjs';
import { eventsForGuest, daysUntil } from './events.mjs';
import { shellTop, shellBottom, esc, SERIF, SANS } from './chrome.mjs';
import { firstName } from './recipients.mjs';

/** The gold letter-spaced eyebrow, as in the confirmation pack. */
const eyebrow = (text) =>
  `<p style="margin:0 0 8px;font:600 11px/1.6 ${SANS};letter-spacing:3px;` +
  `text-transform:uppercase;color:${P.gold};">${esc(text)}</p>`;

const heading = (text, mb = '20px') =>
  `<h2 style="margin:0 0 ${mb};font:700 26px/1.25 ${SERIF};color:${P.green};">${esc(text)}</h2>`;

const divider = () => `
  <tr><td style="padding:30px 0;text-align:center;line-height:1;">
    <span style="color:${P.gold};font-size:18px;letter-spacing:8px;font-family:Georgia,serif;">&#10022; &#9670; &#10022;</span>
  </td></tr>`;

/**
 * One hotel row: name on the left, area on the right.
 *
 * The name is a link to a Google Maps search, not to a booking site. We have
 * no rates, no allocation and no affiliate arrangement, so anything that
 * looked like a booking link would be a lie — and the question a guest
 * actually has is where this is relative to Asokoro, which Maps answers.
 *
 * Underlined rather than merely coloured: Outlook strips link colour often
 * enough that colour alone cannot be the only signal a thing is clickable.
 */
const hotelRow = ([name, area], last) => `
  <tr>
    <td valign="top" style="padding:8px 0;${last ? '' : `border-bottom:1px solid ${P.rule};`}">
      <a href="${esc(STAY.mapUrl(name, area))}"
         style="font:700 15px/1.4 ${SERIF};color:${P.green};text-decoration:underline;">${esc(name)}</a>
    </td>
    <td valign="top" align="right" style="padding:8px 0;white-space:nowrap;${last ? '' : `border-bottom:1px solid ${P.rule};`}">
      <span style="font:600 11px/1.5 ${SANS};color:${P.muted};letter-spacing:1.5px;text-transform:uppercase;">${esc(area)}</span>
    </td>
  </tr>`;

const band = ({ label, hotels }) => `
  <tr><td style="padding:0 0 6px;">
    <p style="margin:18px 0 4px;font:700 11px/1.6 ${SANS};letter-spacing:2.5px;
              text-transform:uppercase;color:${P.gold};">${esc(label)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${hotels.map((h, i) => hotelRow(h, i === hotels.length - 1)).join('')}
    </table>
  </td></tr>`;

/**
 * Renders the thirty-day update for one guest.
 *
 * Returns { html, text, events } — `events` so the sender can assert what it
 * is about to send rather than trusting this function.
 */
export function renderThirtyDayUpdate(row, { assets, siteUrl, now = new Date() } = {}) {
  const name = firstName(row);
  const events = eventsForGuest(row);
  const days = daysUntil(WEDDING.date, now);
  const backdrop = assets?.backdrop ?? null;

  const html = shellTop({
    backdrop,
    preheader: `Where to stay in Abuja, and our registry &middot; ${esc(WEDDING.venueName)}`,
  }) + `
        <!-- ── MASTHEAD ──────────────────────────────────────────────────── -->
        <!-- Same masthead as the confirmation pack, one number on. The number
             is what tells a guest this is the series continuing rather than a
             second invitation. -->
        <tr><td class="pad" style="padding:44px 56px 32px;text-align:center;">
          <p style="margin:0 0 14px;font:700 11px/1.6 ${SANS};letter-spacing:3px;
                    text-transform:uppercase;color:${P.gold};">
            ${esc(UPDATE_THIRTY.label())}
          </p>
          <table role="presentation" width="28" cellpadding="0" cellspacing="0" border="0" align="center"
                 style="margin:0 auto 14px;">
            <tr><td height="1" style="height:1px;background:${P.rule};font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
          <h1 class="h1" style="margin:0 0 8px;font:700 32px/1.2 ${SERIF};color:${P.green};">
            ${UPDATE_THIRTY.headline(days)} &#128141;
          </h1>
          <p style="margin:0;font:400 15px/1.6 ${SANS};color:${P.muted};letter-spacing:.5px;">
            ${esc(UPDATE_THIRTY.title)}
          </p>
        </td></tr>

        <!-- ── OPENING ───────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          <p style="margin:0 0 12px;font:400 16px/1.7 ${SANS};color:${P.ink};">Dear ${esc(name)},</p>
          <p style="margin:0;font:400 16px/1.8 ${SANS};color:${P.ink};">
            We&rsquo;re officially one month away! As you make your plans for
            Abuja, we wanted to share two helpful updates ahead of the big day:
            where to stay, and our wedding registry.
          </p>
        </td></tr>

        ${divider()}

        <!-- ── WHERE TO STAY ─────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;">
          <div style="text-align:center;">
            ${eyebrow('For guests travelling in')}
            ${heading('Where to Stay', '12px')}
            <p style="margin:0 0 4px;font:400 15px/1.7 ${SANS};color:${P.muted};">
              ${esc(STAY.intro)}
            </p>
          </div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${STAY.bands.map(band).join('')}
          </table>

          <!-- The farther-out option, set apart so the trade-off is stated
               rather than buried among the others. -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="margin:22px 0 0;background:${P.alt};border-radius:8px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font:700 10px/1.6 ${SANS};letter-spacing:2px;
                        text-transform:uppercase;color:${P.gold};">
                Don&rsquo;t mind a longer drive?
              </p>
              <p style="margin:0 0 4px;font:400 15px/1.5 ${SERIF};color:${P.green};">
                <a href="${esc(STAY.mapUrl(STAY.farther.name, STAY.farther.area))}"
                   style="color:${P.green};text-decoration:underline;">${esc(STAY.farther.name)}</a>,
                ${esc(STAY.farther.area)}
              </p>
              <p style="margin:0;font:400 13px/1.6 ${SANS};color:${P.muted};">
                ${esc(STAY.farther.note)}
              </p>
            </td></tr>
          </table>

          <p style="margin:14px 0 0;font:400 12px/1.6 ${SANS};color:${P.muted};text-align:center;">
            These are suggestions to help you plan &mdash; no rooms are held on
            your behalf, so do book directly and early.
          </p>
        </td></tr>

        ${divider()}

        <!-- ── REGISTRY ──────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Our registry')}
          ${heading('If You\u2019d Like to Bless Us', '14px')}
          <p style="margin:0 0 24px;font:400 15px/1.8 ${SANS};color:${P.ink};">
            If you&rsquo;d like to bless us with a gift as we begin this new
            chapter, we&rsquo;ve put together a wedding registry with some
            things we&rsquo;re excited to have in our new home.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr><td style="background:${P.greenMid};border-radius:4px;">
              <a href="${esc(REGISTRY_URL)}"
                 style="display:inline-block;padding:15px 38px;font:700 12px/1 ${SANS};
                        letter-spacing:2.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;">
                View Our Registry &rarr;
              </a>
            </td></tr>
          </table>
        </td></tr>

        ${divider()}

        <!-- ── CLOSING ───────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 52px;text-align:center;">
          <p style="margin:0 0 12px;font:400 16px/1.8 ${SANS};color:${P.ink};">
            We&rsquo;re so grateful for your love, prayers and support as we
            count down to the big day.
          </p>
          <p style="margin:0 0 26px;font:italic 400 18px/1.7 ${SERIF};color:${P.greenMid};">
            See you in ${days === 1 ? 'one day' : `${days} days`}! &#10084;&#65039;
          </p>
          <p style="margin:0 0 8px;font:400 14px/1.6 ${SANS};color:${P.muted};letter-spacing:1px;">
            With love,
          </p>
          <div class="sig" style="font:italic 400 36px/1.3 ${SERIF};color:${P.green};">
            ${esc(WEDDING.couple)}
          </div>
        </td></tr>
` + shellBottom({ rsvpUrl: siteUrl });

  /* ── Plain text ──────────────────────────────────────────────────────────
     Every multipart email needs one, and a guest whose client blocks HTML
     must get the same information rather than an apology. */
  const line = (s = '') => s;
  const text = [
    `${UPDATE_THIRTY.label().toUpperCase()} — ${UPDATE_THIRTY.headline(days).replace(/&rsquo;/g, "'")}`,
    UPDATE_THIRTY.title,
    '',
    `Dear ${name},`,
    '',
    "We're officially one month away! As you make your plans for Abuja, we",
    'wanted to share two helpful updates ahead of the big day: where to stay,',
    'and our wedding registry.',
    '',
    'WHERE TO STAY',
    `  ${STAY.intro}`,
    '',
    ...STAY.bands.flatMap(b => [
      `  ${b.label.toUpperCase()}`,
      ...b.hotels.map(([n, a]) => `    ${n} — ${a}`),
      '',
    ]),
    "  DON'T MIND A LONGER DRIVE?",
    `    ${STAY.farther.name}, ${STAY.farther.area}`,
    `    ${STAY.farther.note}`,
    '',
    '  These are suggestions to help you plan — no rooms are held on your',
    '  behalf, so do book directly and early.',
    '',
    'OUR REGISTRY',
    "  If you'd like to bless us with a gift as we begin this new chapter,",
    "  we've put together a wedding registry with some things we're excited",
    '  to have in our new home.',
    `  ${REGISTRY_URL}`,
    '',
    "We're so grateful for your love, prayers and support as we count down to",
    'the big day.',
    '',
    `See you in ${days === 1 ? 'one day' : `${days} days`}!`,
    '',
    'With love,',
    WEDDING.couple,
    '',
    `${WEDDING.venueName}, ${WEDDING.venueArea} — ${WEDDING.dateLong}`,
  ].map(line).join('\n');

  return { html, text, events, days };
}
