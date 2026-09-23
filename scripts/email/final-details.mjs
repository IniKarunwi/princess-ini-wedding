/**
 * Wedding Update #3 — the final-details note. Pure rendering, no I/O.
 *
 * The last practical letter before the day: where to look things up, how the
 * reception seating works, what to wear, where the venue is, and — if it is
 * switched on — the Instant Camera. It asks for nothing back.
 *
 * ── No new artwork ─────────────────────────────────────────────────────────
 * This letter references exactly one image: backdrop.png, which has been
 * deployed since the confirmation pack and is already in 136 inboxes. There
 * is deliberately nothing here that needs this branch shipped before the mail
 * can be sent — an email whose pictures depend on a deploy is an email that
 * quietly renders wrong if the order slips. A homepage screenshot was tried
 * and removed for exactly that reason: it was decorative, and it would have
 * required deploying to make it resolve.
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
 * A guest is shown only the events they are invited to. The note about phones
 * names the CEREMONY, so it is gated on the JOINING tier: a reception-only
 * guest must not read it, because it would tell them a part of the day exists
 * that they were not invited to. Its absence is total — not in the HTML, not
 * in the plain text. Ten assertions check that.
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
  PALETTE as P, UPDATE_FINAL, MAP_URL, DOODLES,
} from './config.mjs';
import { eventsForGuest, daysUntil } from './events.mjs';
import { shellTop, shellBottom, esc, SERIF, SANS } from './chrome.mjs';
import { firstName } from './recipients.mjs';

const SITE = 'princessandini.com';

/**
 * How this letter signs off.
 *
 * Deliberately not WEDDING.couple, which is "Princess & IniOluwa" and is what
 * the two earlier letters and the footer of this one use. The couple asked for
 * the shorter form here; changing the shared constant would rewrite the
 * masthead of emails already in people's inboxes.
 */
const SIGN_OFF = 'Princess & Ini';

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
 * A wedding doodle, as an ordinary image.
 *
 * ── Why an <img> and not the backdrop ──────────────────────────────────────
 * The doodles were already here, as the tile behind the page — and almost
 * nobody saw them. They are drawn at 3–8.5% opacity outside an 840px clean
 * channel, so on anything narrower than that (a phone, a reading pane, a
 * preview panel) there is nothing to see; and a page-level background-image is
 * the first thing a mail client discards, which left this letter with no
 * artwork at all. See generate-doodles.mjs for the measurements.
 *
 * So these sit inside the card as images. Every rule here is about surviving
 * a client that is hostile to everything except <img>:
 *
 *   · width AND height attributes, so the row is the right size before the
 *     bytes arrive and the layout does not jump
 *   · display:block, because a bare <img> is inline and picks up a stray
 *     baseline gap underneath it in Outlook
 *   · border:0 and outline:none, for the blue border some clients draw
 *   · max-width:100% in the style, so a narrow phone scales rather than
 *     forcing a horizontal scroll
 *   · alt="" — decorative. With images blocked a client shows nothing, which
 *     is what you want; alt text would announce a picture nobody can see.
 *
 * The image itself is opaque and already the card's colour, so there is no
 * background to set behind it and nothing to go wrong in dark mode.
 *
 * Returns '' when the asset is not available, so a render with no assets
 * produces no <img> at all.
 */
const doodleImg = (assets, key) => {
  const src = assets?.[key];
  const size = DOODLES[key];
  if (!src || !size) return '';
  return `<img src="${esc(src)}" width="${size.width}" height="${size.height}" alt="" ` +
         `style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;` +
         `width:${size.width}px;max-width:100%;height:auto;">`;
};

/** The same, as its own table row. */
const doodleRow = (assets, key, padding) => {
  const img = doodleImg(assets, key);
  return img ? `\n        <tr><td align="center" style="padding:${padding};font-size:0;line-height:0;">
          ${img}
        </td></tr>` : '';
};

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

/**
 * Two centred rows, split as evenly as possible.
 *
 * Not hard-coded to five-and-four. The palette is the one thing likely to
 * change before the send, and a fixed split would leave a single orphan chip
 * on its own line the moment the count changed. Ceil-then-rest keeps the
 * wider row on top, which is how the printed guide sets it.
 */
const swatchRows = () => {
  const s = DRESS.swatches;
  const half = Math.ceil(s.length / 2);
  const rows = s.length <= 5 ? [s] : [s.slice(0, half), s.slice(half)];
  return rows.filter(r => r.length).map(r => `
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
 * `events` overrides which parts of the day this guest is shown. It exists for
 * one case: a guest who holds a seat in the published plan but whose RSVP row
 * does not name the Reception. The seat is the evidence that they are coming
 * to the reception, and the sender grants that explicitly rather than this
 * file guessing at it. The default is the RSVP tier, unchanged. It cannot be
 * used to smuggle in a ceremony invitation: `ceremony` below still reads the
 * JOINING key, and the only caller that passes this — unionAudience — never
 * puts JOINING there.
 *
 * Returns { html, text, events, days, ceremony, camera } — the extra fields so
 * the sender can assert what it is about to send rather than trusting this
 * function's word for it.
 */
export function renderFinalDetails(row, {
  siteUrl, now = new Date(), assets, cameraReady = false, events: eventsOverride = null,
} = {}) {
  const name = firstName(row);
  const events = eventsOverride ?? eventsForGuest(row);
  const days = daysUntil(WEDDING.date, now);
  const backdrop = assets?.backdrop ?? null;

  // The phones note names the CEREMONY, so it is gated on the tier. See the
  // block itself for why that matters.
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
        </td></tr>${doodleRow(assets, 'doodle-crest', '4px 24px 26px')}

        <!-- ── OPENING ───────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${para(`Dear ${esc(name)},`)}
          ${para(`It&rsquo;s ${esc(countdown)} to our wedding, and we&rsquo;re so excited to
                  have you celebrate with us!`, '10px')}
          ${para(`Here&rsquo;s a quick refresher on your checklist for the day.`, '0')}
        </td></tr>

        ${divider()}

        <!-- ── 1 — THE WEBSITE ───────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('One')}
          ${heading('Everything You Need Is Online', '14px')}
          ${para(`Our wedding website is live at
                  <a href="${esc(siteUrl)}" style="color:${P.green};text-decoration:underline;">${SITE}</a>.`)}
          ${para(`If you&rsquo;re ever in doubt about the schedule, venue, dress code or any
                  other details, you&rsquo;ll find everything you need there.`, '0')}

        </td></tr>

        ${divider()}

        <!-- ── 2 — YOUR SEAT ─────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Two')}
          ${heading('Your Seat Is Confirmed', '14px')}
          ${para(`Our reception guest list is complete, and there&rsquo;ll be a seating
                  chart at the venue. All you need to do when you arrive is give your
                  name to an usher. They&rsquo;ll confirm your table number and direct
                  you to your seat.`)}
          ${para(`But hey, you don&rsquo;t have to wait until the wedding day! Visit our
                  seating chart, search for your name, and your table number will be
                  displayed. That way, you can confirm your seat before you even
                  arrive.`, '20px')}
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

        <!-- ── 3 — DRESS CODE ────────────────────────────────────────────── -->
        <!-- Wording and hexes are copied from src/lib/wedding.ts and asserted
             against it by selftest-final-details.mjs. Nothing here is written
             fresh for the email. -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Three · Dress code refresher')}
          ${heading(DRESS.title, '14px')}
          ${para(esc(DRESS.invitation), '22px')}
          ${swatchRows()}

          <!-- The formality, which the colours do not convey. Two stacked
               blocks rather than side-by-side columns: Outlook's table model
               makes two equal columns of unequal text unreliable, and on a
               phone they would stack anyway. -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="margin:22px 0 0;">
            ${[DRESS.gentlemen, DRESS.ladies].map((side, i) => `
            <tr><td style="padding:${i ? '16px' : '0'} 0 0;">
              <p style="margin:0 0 6px;font:700 10px/1.6 ${SANS};letter-spacing:2.5px;
                        text-transform:uppercase;color:${P.gold};text-align:center;">
                ${esc(side.label)}
              </p>
              ${side.notes.map(n => `
              <p style="margin:0 0 4px;font:400 14px/1.7 ${SANS};color:${P.muted};text-align:center;">
                ${esc(n)}
              </p>`).join('')}
            </td></tr>`).join('')}
          </table>

          ${para(`You can see the full dress guide on
                  <a href="${esc(siteUrl)}" style="color:${P.green};text-decoration:underline;">${SITE}</a>.`,
                  '0')}
        </td></tr>

        ${divider()}

        <!-- ── 4 — LOCATION ──────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Four')}
          ${heading('The Location', '14px')}
          ${para(`We&rsquo;ll be celebrating at
                  <a href="${esc(MAP_URL)}" style="color:${P.green};text-decoration:underline;">${esc(WEDDING.venueName)}</a>,
                  ${esc(WEDDING.venueArea)}.`)}
          ${para(`You&rsquo;ll also find the venue details on our website.`, '0')}
        </td></tr>
${ceremony ? `
        ${divider()}

        <!-- ── A NOTE ABOUT PHONES — CEREMONY GUESTS ONLY ────────────────── -->
        <!-- This names the CEREMONY, which a reception-only guest is not
             invited to. Rendering it for them would tell them a part of the
             day exists that they were excluded from — the one rule this whole
             email system is built on. So it is gated on the JOINING tier and
             its absence is total: not in the HTML, not in the plain text. -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Before we begin')}
          ${heading('A Little Note About Phones', '14px')}
          ${para(`We&rsquo;re having a no-personal-photography ceremony. We&rsquo;d love
                  for our media team to capture our special moments without phones
                  getting in the way &mdash; and, more importantly, we&rsquo;d love for
                  you to be fully present with us.`, '0')}
        </td></tr>` : ''}
${camera ? `
        ${divider()}

        <!-- ── 5 — THE WEDDING THROUGH YOUR EYES ─────────────────────────── -->
        <!-- Conditional on CAMERA.enabled (config.mjs). With the flag off this
             block is absent from the HTML and the plain text. -->
        <tr><td class="pad" style="padding:0 56px 8px;text-align:center;">
          ${eyebrow('Five')}
          <!-- The camera sits ABOVE the heading, on its own line, rather than
               beside it. Set apart it reads as an icon and says "photography"
               before a word is read; inline it was just punctuation. -->
          <p style="margin:0 0 6px;font-size:30px;line-height:1;" aria-hidden="true">&#128247;</p>
          <h2 style="margin:0 0 14px;font:700 26px/1.25 ${SERIF};color:${P.green};">
            The Wedding Through Your Eyes
          </h2>
          ${para(`While we want you to be present, we also want to experience our
                  wedding through your eyes.`)}
          ${para(`During the celebration, visit
                  <a href="${esc(CAMERA_URL)}" style="color:${P.green};text-decoration:underline;">${SITE}/wedding</a>
                  and open our Instant Camera.`)}
          ${para(`We&rsquo;re challenging you to take ${CAMERA.moments} photos for us
                  throughout the celebration. They don&rsquo;t have to be
                  picture-perfect &mdash; we want the candid moments too: the laughs,
                  hugs, dancing, reactions and little things happening around you that
                  we might otherwise never get to see.`)}
          ${para(`Those may end up being some of our favourite memories from the day.`, '0')}
        </td></tr>` : ''}

        <!-- The one divider that carries a drawing rather than the glyph
             rule, so the turn into the closing is marked. -->
        ${doodleRow(assets, 'doodle-divider', '30px 56px') || divider()}

        <!-- ── CLOSING ───────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:0 56px 52px;text-align:center;">
          ${doodleImg(assets, 'doodle-signoff')
            ? `<div style="margin:0 0 18px;">${doodleImg(assets, 'doodle-signoff')}</div>` : ''}
          <p style="margin:0 0 26px;font:italic 400 18px/1.7 ${SERIF};color:${P.greenMid};">
            We look forward to having you celebrate with us.
          </p>
          <p style="margin:0 0 8px;font:400 14px/1.6 ${SANS};color:${P.muted};letter-spacing:1px;">
            With love,
          </p>
          <div class="sig" style="font:italic 400 36px/1.3 ${SERIF};color:${P.green};">
            ${esc(SIGN_OFF)}
          </div>

          <!-- ── P.S. REGISTRY ──────────────────────────────────────────── -->
          <!-- A postscript, not a section — the smallest thing on the page,
               which is the right weight for it three days out. -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="margin:34px 0 0;">
            <tr><td style="border-top:1px solid ${P.rule};padding:18px 0 0;">
              <p style="margin:0;font:400 14px/1.7 ${SANS};color:${P.muted};">
                <span style="font-weight:700;color:${P.ink};">P.S.</span>
                For those who have asked about gifts, our wedding registry is available at
                <a href="${esc(REGISTRY_URL)}" style="color:${P.green};text-decoration:underline;">ouish.co/princess-and-ini-wedding</a>.
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
    `It's ${countdown} to our wedding, and we're so excited to have you celebrate`,
    'with us!',
    "Here's a quick refresher on your checklist for the day.",
    '',
    'ONE — EVERYTHING YOU NEED IS ONLINE',
    `  Our wedding website is live at ${SITE}.`,
    "  If you're ever in doubt about the schedule, venue, dress code or any",
    "  other details, you'll find everything you need there.",
    '',
    'TWO — YOUR SEAT IS CONFIRMED',
    "  Our reception guest list is complete, and there'll be a seating chart at",
    '  the venue. All you need to do when you arrive is give your name to an',
    "  usher. They'll confirm your table number and direct you to your seat.",
    "  But hey, you don't have to wait until the wedding day! Visit our seating",
    '  chart, search for your name, and your table number will be displayed.',
    '  That way, you can confirm your seat before you even arrive.',
    `  ${SEATING_URL}`,
    '',
    `THREE — DRESS CODE REFRESHER — ${DRESS.title.toUpperCase()}`,
    `  ${DRESS.invitation}`,
    `  ${DRESS.swatches.map(([, n]) => n).join(' · ')}`,
    '',
    `  ${DRESS.gentlemen.label.toUpperCase()}`,
    ...DRESS.gentlemen.notes.map(n => `    ${n}`),
    `  ${DRESS.ladies.label.toUpperCase()}`,
    ...DRESS.ladies.notes.map(n => `    ${n}`),
    '',
    `  You can see the full dress guide on ${SITE}.`,
    '',
    'FOUR — THE LOCATION',
    `  We'll be celebrating at ${WEDDING.venueName}, ${WEDDING.venueArea}.`,
    "  You'll also find the venue details on our website.",
    '',
    ...(ceremony ? [
      'A LITTLE NOTE ABOUT PHONES',
      "  We're having a no-personal-photography ceremony. We'd love for our",
      '  media team to capture our special moments without phones getting in',
      "  the way — and, more importantly, we'd love for you to be fully present",
      '  with us.',
      '',
    ] : []),
    ...(camera ? [
      'FIVE — THE WEDDING THROUGH YOUR EYES',
      '  While we want you to be present, we also want to experience our',
      '  wedding through your eyes.',
      `  During the celebration, visit ${SITE}/wedding and open our Instant`,
      '  Camera.',
      `  We're challenging you to take ${CAMERA.moments} photos for us throughout the`,
      "  celebration. They don't have to be picture-perfect — we want the candid",
      '  moments too: the laughs, hugs, dancing, reactions and little things',
      '  happening around you that we might otherwise never get to see.',
      '  Those may end up being some of our favourite memories from the day.',
      '',
    ] : []),
    'We look forward to having you celebrate with us.',
    '',
    'With love,',
    SIGN_OFF,
    '',
    'P.S. For those who have asked about gifts, our wedding registry is',
    `     available at ${REGISTRY_URL}`,
    '',
    `${WEDDING.venueName}, ${WEDDING.venueArea} — ${WEDDING.dateLong}`,
  ].join('\n');

  return { html, text, events, days, ceremony, camera };
}
