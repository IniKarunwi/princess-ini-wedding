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
 * A guest is shown only the events they are invited to. This letter is not an
 * enumeration of the day, so the rule mostly has nothing to bite on — with one
 * sharp exception. The no-personal-photography paragraph is about the CEREMONY.
 * A reception-only guest must not read it, because it would tell them a part of
 * the day exists that they were not invited to. So that block renders only for
 * guests whose own event list contains JOINING, and its absence is total: not
 * in the HTML, not in the plain text.
 *
 * ── The camera section is conditional by construction ──────────────────────
 * `CAMERA.enabled` is false in config.mjs. When it is false this file emits
 * nothing for it at all. See the comment there; removing the feature from the
 * email permanently means deleting that object and the one block below.
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
 * Returns { html, text, events, days, ceremony, camera } — the extra fields so
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

  // The ceremony paragraph is about a part of the day a reception-only guest
  // is not invited to. See the header.
  const ceremony = events.some(e => e.key === 'JOINING');
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
                  have you celebrate with us! Here is everything you need for Saturday.`, '0')}
        </td></tr>

        ${divider()}

        <!-- ── THE WEBSITE ───────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Everything in one place')}
          ${heading('Our Wedding Website', '14px')}
          ${para(`<a href="${esc(siteUrl)}" style="color:${P.green};text-decoration:underline;">${SITE}</a>
                  has all the details for the day &mdash; the venue, the timings and
                  everything else. If a question comes up this week, start there.`, '0')}
        </td></tr>

        ${divider()}

        <!-- ── THE RECEPTION SEATING ─────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('At the reception')}
          ${heading('Your Table', '14px')}
          ${para(`Our reception guest list is complete. On the day, simply give your
                  name to one of our ushers and they will show you to your table.`)}
          ${para(`If you&rsquo;d rather know in advance, you can look yourself up here:`, '20px')}
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

        <!-- ── DRESS CODE ────────────────────────────────────────────────── -->
        <!-- Wording and hexes are copied from src/lib/wedding.ts and asserted
             against it by selftest-final-details.mjs. Nothing here is written
             fresh for the email. -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('What to wear')}
          ${heading(DRESS.title, '14px')}
          ${para(esc(DRESS.invitation), '22px')}
          ${swatchRows()}
        </td></tr>

        ${divider()}

        <!-- ── VENUE ─────────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Where')}
          ${heading(WEDDING.venueName, '10px')}
          <p style="margin:0;font:400 16px/1.8 ${SANS};color:${P.muted};">
            ${esc(WEDDING.venueArea)}
          </p>
        </td></tr>
${ceremony ? `
        ${divider()}

        <!-- ── THE CEREMONY, PHONE-FREE ──────────────────────────────────── -->
        <!-- Ceremony guests only. A reception-only guest must not learn the
             service exists; see the header. -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('During the ceremony')}
          ${heading('A Phone-Free Service', '14px')}
          ${para(`We&rsquo;re having a no-personal-photography ceremony. We&rsquo;d love for
                  our media team to capture those special moments without phones getting
                  in the way &mdash; and more importantly, we&rsquo;d love for you to be
                  fully present with us.`, '0')}
        </td></tr>` : ''}
${camera ? `
        ${divider()}

        <!-- ── INSTANT CAMERA ────────────────────────────────────────────── -->
        <!-- Conditional on CAMERA.enabled (config.mjs), which is false. This
             block is absent from the HTML and the text when it is off. -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('A little wedding-day surprise')}
          ${heading('The Wedding Through Your Eyes', '14px')}
          ${para(`During the celebration, we&rsquo;d love to experience the day through
                  your eyes. Visit
                  <a href="${esc(CAMERA_URL)}" style="color:${P.green};text-decoration:underline;">${SITE}/wedding</a>
                  on Saturday and open our Instant Camera.`)}
          ${para(`Capture the candid moments around you &mdash; the laughs, the hugs, the
                  dancing, the reactions and the little things we might otherwise never
                  get to see.`)}
          ${para(`We&rsquo;re challenging you to capture up to ${CAMERA.moments} moments for
                  us throughout the celebration. They don&rsquo;t have to be
                  picture-perfect. We want to see the day as you saw it.`, '0')}
        </td></tr>` : ''}

        ${divider()}

        <!-- ── CLOSING ───────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 52px;text-align:center;">
          ${para(`Thank you for the love, the prayers and the support that have carried us
                  to this week. We cannot wait to see you.`)}
          <p style="margin:0 0 26px;font:italic 400 18px/1.7 ${SERIF};color:${P.greenMid};">
            See you in ${esc(countdown)}! &#10084;&#65039;
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
                <span style="font-weight:700;color:${P.ink};">P.S.</span>
                If you&rsquo;d like to bless us with a gift, our registry is at
                <a href="${esc(REGISTRY_URL)}" style="color:${P.green};text-decoration:underline;">ouish.co/princess-and-ini-wedding</a>.
                Your presence on Saturday is the gift.
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
    'celebrate with us! Here is everything you need for Saturday.',
    '',
    'OUR WEDDING WEBSITE',
    `  ${SITE} has all the details for the day — the venue, the timings and`,
    '  everything else. If a question comes up this week, start there.',
    '',
    'YOUR TABLE',
    '  Our reception guest list is complete. On the day, simply give your name',
    '  to one of our ushers and they will show you to your table.',
    '  If you’d rather know in advance, you can look yourself up here:',
    `  ${SEATING_URL}`,
    '',
    `WHAT TO WEAR — ${DRESS.title.toUpperCase()}`,
    `  ${DRESS.invitation}`,
    `  ${DRESS.swatches.map(([, n]) => n).join(' · ')}`,
    '',
    'WHERE',
    `  ${WEDDING.venueName}`,
    `  ${WEDDING.venueArea}`,
    '',
    ...(ceremony ? [
      'A PHONE-FREE SERVICE',
      "  We're having a no-personal-photography ceremony. We'd love for our",
      '  media team to capture those special moments without phones getting in',
      "  the way — and more importantly, we'd love for you to be fully present",
      '  with us.',
      '',
    ] : []),
    ...(camera ? [
      'THE WEDDING THROUGH YOUR EYES',
      "  During the celebration, we'd love to experience the day through your",
      `  eyes. Visit ${SITE}/wedding on Saturday and open our Instant Camera.`,
      '  Capture the candid moments around you — the laughs, the hugs, the',
      '  dancing, the reactions and the little things we might otherwise never',
      '  get to see.',
      `  We're challenging you to capture up to ${CAMERA.moments} moments for us`,
      "  throughout the celebration. They don't have to be picture-perfect. We",
      '  want to see the day as you saw it.',
      '',
    ] : []),
    'Thank you for the love, the prayers and the support that have carried us',
    'to this week. We cannot wait to see you.',
    '',
    `See you in ${countdown}!`,
    '',
    'With love,',
    WEDDING.couple,
    '',
    `P.S. If you'd like to bless us with a gift, our registry is at`,
    `     ${REGISTRY_URL}. Your presence on Saturday is the gift.`,
    '',
    `${WEDDING.venueName}, ${WEDDING.venueArea} — ${WEDDING.dateLong}`,
  ].join('\n');

  return { html, text, events, days, ceremony, camera };
}
