/**
 * Wedding Update #3 — the final-details note. Pure rendering, no I/O.
 *
 * The last practical letter before the day: where to look things up, how the
 * reception seating works, what to wear, where the venue is, and — if it is
 * switched on — the Instant Camera. It asks for nothing back.
 *
 * ── Not a redesign ─────────────────────────────────────────────────────────
 * Every visual decision comes from the confirmation pack, by way of the
 * thirty-day note: the same shell from chrome.mjs, the same palette, type
 * stacks, card width, doodle backdrop, numbered masthead, gold eyebrow labels,
 * ✦ ◆ ✦ dividers and dark green footer. Only the content rows differ, which is
 * the point — a guest should recognise this as the next letter in the same
 * series before reading a word.
 *
 * ── The one rule that still applies ────────────────────────────────────────
 * A guest is shown only the events they are invited to. This letter does not
 * enumerate the day, and — deliberately — the phones paragraph names no part
 * of it. It says "a no-phones event" and "our media team", never "ceremony"
 * or "service", so a reception-only guest reads it without learning that a
 * service they were not invited to exists. An earlier draft said "ceremony"
 * and had to be gated on the JOINING tier; wording it this way removes the
 * gate rather than guarding it, which is the better fix.
 *
 * ── The camera section is conditional by construction ──────────────────────
 * `CAMERA.enabled` is true in config.mjs, because the camera is a WEDDING-DAY
 * feature and the day is Saturday. Setting it false is the kill switch: this
 * file then emits the phones paragraph alone, with no mention of the camera
 * in either body. Removing the feature from the email permanently means
 * deleting that object and the one branch below.
 */

import {
  WEDDING, REGISTRY_URL, SEATING_URL, CAMERA_URL, CAMERA, DRESS,
  PALETTE as P, UPDATE_FINAL,
} from './config.mjs';
import { eventsForGuest, daysUntil } from './events.mjs';
import { shellTop, shellBottom, esc, SERIF, SANS } from './chrome.mjs';
import { firstName } from './recipients.mjs';

const SITE = 'princessandini.com';

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

const para = (html, mb = '12px') =>
  `<p style="margin:0 0 ${mb};font:400 16px/1.8 ${SANS};color:${P.ink};">${html}</p>`;

/**
 * One colour chip.
 *
 * A bordered cell of flat colour with its name underneath — no image, because
 * every mail client renders a table cell's background and a good many block
 * remote images by default. The hairline border is what keeps Ivory visible
 * against the card, which is nearly the same value.
 */
const swatch = ([hex, name]) => `
  <td align="center" valign="top" style="padding:0 4px 10px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
      <tr><td width="46" height="34"
              style="width:46px;height:34px;background:${hex};border:1px solid ${P.rule};
                     border-radius:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="margin:6px 0 0;font:600 9px/1.4 ${SANS};letter-spacing:.8px;
              text-transform:uppercase;color:${P.muted};">${esc(name)}</p>
  </td>`;

/** Nine swatches, five then four, so neither row is an orphan. */
const swatchRows = () => {
  const s = DRESS.swatches;
  const rows = [s.slice(0, 5), s.slice(5)];
  return rows.map(r => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
           style="margin:0 auto;">
      <tr>${r.map(swatch).join('')}</tr>
    </table>`).join('');
};

/**
 * Renders the final-details letter for one guest.
 *
 * `cameraReady` overrides CAMERA.enabled for a preview or a test — it lets the
 * copy be reviewed without committing the feature. It never persists anywhere.
 *
 * Returns { html, text, events, days, camera } — the extra fields so
 * the sender can assert what it is about to send rather than trusting this
 * function's word for it.
 */
export function renderFinalDetails(row, {
  siteUrl, now = new Date(), assets, cameraReady = false,
} = {}) {
  const name = firstName(row);
  const events = eventsForGuest(row);
  const days = daysUntil(WEDDING.date, now);
  const backdrop = assets?.backdrop ?? null;

  const camera = cameraReady || CAMERA.enabled;

  const countdown = days > 1 ? `${days} days` : days === 1 ? '1 day' : 'no time at all';

  const html = shellTop({
    backdrop,
    preheader: `Everything you need for Saturday &middot; ${esc(WEDDING.venueName)}, ${esc(WEDDING.venueArea)}`,
  }) + `
        <!-- ── MASTHEAD ──────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:44px 56px 32px;text-align:center;">
          <p style="margin:0 0 14px;font:700 11px/1.6 ${SANS};letter-spacing:3px;
                    text-transform:uppercase;color:${P.gold};">
            ${esc(UPDATE_FINAL.label())}
          </p>
          <table role="presentation" width="28" cellpadding="0" cellspacing="0" border="0" align="center"
                 style="margin:0 auto 14px;">
            <tr><td height="1" style="height:1px;background:${P.rule};font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
          <h1 class="h1" style="margin:0 0 8px;font:700 32px/1.2 ${SERIF};color:${P.green};">
            ${UPDATE_FINAL.headline(days)} &#128141;
          </h1>
          <p style="margin:0;font:400 15px/1.6 ${SANS};color:${P.muted};letter-spacing:.5px;">
            ${esc(UPDATE_FINAL.title)}
          </p>
        </td></tr>

        <!-- ── OPENING ───────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${para(`Dear ${esc(name)},`)}
          ${para(`It&rsquo;s ${esc(countdown)} to our wedding, and we&rsquo;re so excited to
                  have you celebrate with us! Here&rsquo;s a refresher on everything
                  you need for the day.`, '0')}
        </td></tr>

        ${divider()}

        <!-- ── FIRST: THE WEBSITE ────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('First')}
          ${heading('Everything Is On Our Website', '14px')}
          ${para(`Our website is up at
                  <a href="${esc(siteUrl)}" style="color:${P.green};text-decoration:underline;">${SITE}</a>.
                  If you&rsquo;re ever in doubt about any detail, that is where to find it.`, '0')}
        </td></tr>

        ${divider()}

        <!-- ── SECOND: YOUR TABLE ────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Second')}
          ${heading('Your Table', '14px')}
          ${para(`Our reception guest list is complete, and there is a seating chart at
                  the venue. All you need to do is say your name at the door &mdash; an
                  usher will confirm your table number and show you to your seat.`)}
          ${para(`But you don&rsquo;t have to wait until Saturday. Search your name on our
                  seating chart and it will show you your table, so you can confirm your
                  seat right now.`, '20px')}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr><td style="background:${P.greenMid};border-radius:4px;">
              <a href="${esc(SEATING_URL)}"
                 style="display:inline-block;padding:15px 38px;font:700 12px/1 ${SANS};
                        letter-spacing:2.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;">
                Find Your Table &rarr;
              </a>
            </td></tr>
          </table>
        </td></tr>

        ${divider()}

        <!-- ── THIRD: DRESS CODE ─────────────────────────────────────────── -->
        <!-- Wording and hexes are copied from src/lib/wedding.ts and asserted
             against it by selftest-final-details.mjs. Nothing here is written
             fresh for the email. -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Third')}
          ${heading(DRESS.title, '14px')}
          ${para(esc(DRESS.invitation), '22px')}
          ${swatchRows()}
        </td></tr>

        ${divider()}

        <!-- ── THE LOCATION ──────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('The location')}
          ${heading(WEDDING.venueName, '10px')}
          <p style="margin:0;font:400 16px/1.8 ${SANS};color:${P.muted};">
            ${esc(WEDDING.venueArea)}
          </p>
        </td></tr>
${camera ? `
        ${divider()}

        <!-- ── FINALLY: PHONES, AND THE INSTANT CAMERA ───────────────────── -->
        <!-- Conditional on CAMERA.enabled (config.mjs). With the flag off this
             block is absent from the HTML and the plain text, and the phones
             paragraph below stands on its own. -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Finally')}
          ${heading('Through Your Eyes', '14px')}
          ${para(`It&rsquo;s a no-phones event &mdash; we&rsquo;d love our media team to have
                  no restrictions as they capture our special moments.`)}
          ${para(`But we&rsquo;d also love to experience our wedding through your eyes.
                  Please take ${CAMERA.moments} pictures for us at
                  <a href="${esc(CAMERA_URL)}" style="color:${P.green};text-decoration:underline;">${SITE}/wedding</a>.`)}
          ${para(`They don&rsquo;t have to be picture-perfect &mdash; just the cute and
                  interesting moments we might otherwise never get to see.`, '0')}
        </td></tr>` : `
        ${divider()}

        <!-- ── FINALLY: PHONES ───────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Finally')}
          ${heading('A No-Phones Celebration', '14px')}
          ${para(`It&rsquo;s a no-phones event &mdash; we&rsquo;d love our media team to have
                  no restrictions as they capture our special moments, and we&rsquo;d love
                  you to be fully present with us.`, '0')}
        </td></tr>`}

        ${divider()}

        <!-- ── CLOSING ───────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 52px;text-align:center;">
          <p style="margin:0 0 26px;font:italic 400 18px/1.7 ${SERIF};color:${P.greenMid};">
            We look forward to having you. &#10084;&#65039;
          </p>
          <p style="margin:0 0 8px;font:400 14px/1.6 ${SANS};color:${P.muted};letter-spacing:1px;">
            With love,
          </p>
          <div class="sig" style="font:italic 400 36px/1.3 ${SERIF};color:${P.green};">
            ${esc(WEDDING.couple)}
          </div>

          <!-- ── P.S. REGISTRY ──────────────────────────────────────────── -->
          <!-- A postscript, not a section. It is the last thing mentioned and
               the smallest thing on the page, which is the right weight for
               it three days out. -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="margin:34px 0 0;">
            <tr><td style="border-top:1px solid ${P.rule};padding:18px 0 0;">
              <p style="margin:0;font:400 14px/1.7 ${SANS};color:${P.muted};">
                <span style="font-weight:700;color:${P.ink};">Wedding registry:</span>
                <a href="${esc(REGISTRY_URL)}" style="color:${P.green};text-decoration:underline;">ouish.co/princess-and-ini-wedding</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
` + shellBottom({ rsvpUrl: siteUrl });

  /* ── Plain text ──────────────────────────────────────────────────────────
     Every multipart email needs one, and a guest whose client blocks HTML must
     get the same information rather than an apology. The two conditional
     blocks are conditional here too — a reception-only guest's plain text has
     no ceremony paragraph, and neither version mentions the camera when it is
     off. */
  const text = [
    `${UPDATE_FINAL.label().toUpperCase()} — ${UPDATE_FINAL.headline(days).replace(/&rsquo;/g, "'")}`,
    UPDATE_FINAL.title,
    '',
    `Dear ${name},`,
    '',
    `It's ${countdown} to our wedding, and we're so excited to have you`,
    "celebrate with us! Here's a refresher on everything you need for the day.",
    '',
    'FIRST — EVERYTHING IS ON OUR WEBSITE',
    `  Our website is up at ${SITE}. If you're ever in doubt about any detail,`,
    '  that is where to find it.',
    '',
    'SECOND — YOUR TABLE',
    '  Our reception guest list is complete, and there is a seating chart at',
    '  the venue. All you need to do is say your name at the door — an usher',
    '  will confirm your table number and show you to your seat.',
    "  But you don't have to wait until Saturday. Search your name on our",
    '  seating chart and it will show you your table, so you can confirm your',
    '  seat right now.',
    `  ${SEATING_URL}`,
    '',
    `THIRD — ${DRESS.title.toUpperCase()}`,
    `  ${DRESS.invitation}`,
    `  ${DRESS.swatches.map(([, n]) => n).join(' · ')}`,
    '',
    'THE LOCATION',
    `  ${WEDDING.venueName}`,
    `  ${WEDDING.venueArea}`,
    '',
    ...(camera ? [
      'FINALLY — THROUGH YOUR EYES',
      "  It's a no-phones event — we'd love our media team to have no",
      '  restrictions as they capture our special moments.',
      "  But we'd also love to experience our wedding through your eyes.",
      `  Please take ${CAMERA.moments} pictures for us at ${SITE}/wedding.`,
      "  They don't have to be picture-perfect — just the cute and interesting",
      '  moments we might otherwise never get to see.',
      '',
    ] : [
      'FINALLY — A NO-PHONES CELEBRATION',
      "  It's a no-phones event — we'd love our media team to have no",
      "  restrictions as they capture our special moments, and we'd love you to",
      '  be fully present with us.',
      '',
    ]),
    'We look forward to having you.',
    '',
    'With love,',
    WEDDING.couple,
    '',
    `Wedding registry: ${REGISTRY_URL}`,
    '',
    `${WEDDING.venueName}, ${WEDDING.venueArea} — ${WEDDING.dateLong}`,
  ].join('\n');

  return { html, text, events, days, camera };
}
