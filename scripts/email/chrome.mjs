/**
 * The shell every wedding email sits inside — head, styles, doodle backdrop,
 * card, footer.
 *
 * Extracted from template.mjs so the confirmation pack and every later update
 * share one shell rather than diverging copies of it. The design notes in the
 * comments below were written for the confirmation pack; they hold unchanged
 * for anything else this project sends.
 *
 * The extraction was verified byte-for-byte: the confirmation pack renders
 * identical HTML before and after, for all three tiers.
 */

import { WEDDING, PALETTE as P, TYPE, BACKDROP, LAYOUT } from './config.mjs';

/** Escapes text interpolated into HTML. Names come from a spreadsheet. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const SERIF = TYPE.serif;
export const SANS  = TYPE.sans;

/**
 * Everything above the first content row: doctype, head, styles, the VML
 * backdrop, the preheader and the open of the page and card tables.
 *
 * `preheader` is the grey line shown beside the subject in the inbox. It is
 * inserted RAW so entities such as &middot; survive — callers must escape any
 * guest-supplied text they put in it. The zero-width spacer run after it stops
 * the client pulling body copy in.
 */
export function shellTop({ backdrop, preheader }) {
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(WEDDING.couple)} &middot; ${esc(WEDDING.dateLong)}</title>
<!-- Honoured by Apple Mail and iOS Mail; stripped by Gmail and Outlook, which
     fall back to Georgia and Helvetica. The design holds either way. -->
<link rel="stylesheet" href="${TYPE.webfont}">
<!--[if mso]>
<style>body,table,td,p,a,h1,h2,div{font-family:Georgia,'Times New Roman',serif !important;}</style>
<![endif]-->
<style>
  /* Phones only. Gmail's app honours this; the layout is fluid regardless. */
  @media only screen and (max-width:${LAYOUT.mobile}px) {
    .pad      { padding-left:24px !important; padding-right:24px !important; }
    .pad-sm   { padding-left:20px !important; padding-right:20px !important; }
    .h1       { font-size:26px !important; }
    .h2       { font-size:23px !important; }
    .sig      { font-size:28px !important; }
    .stack    { display:block !important; width:100% !important; }
    /* On a phone there is no room either side of the card for flourishes, so
       the quiet margin shrinks rather than squeezing the content. */
    .page     { padding:24px 12px !important; }
  }
  /* iOS turns any 10-digit run into a tap-to-call link. Suppressed above by
     format-detection; this undoes the styling for clients that linkify it
     anyway, so an account number never looks or behaves like a phone number. */
  a[x-apple-data-detectors] {
    color: inherit !important; text-decoration: none !important;
    font-size: inherit !important; font-family: inherit !important;
    font-weight: inherit !important; line-height: inherit !important;
  }
  /* One tap selects the whole account number rather than dragging for it.
     Honoured by Apple Mail, iOS Mail and Gmail in a browser; ignored
     elsewhere, where the number is still ordinary selectable text. */
  .acct {
    -webkit-user-select: all; -moz-user-select: all; -ms-user-select: all; user-select: all;
  }
</style>
</head>
<body style="margin:0;padding:0;background:${P.page};-webkit-font-smoothing:antialiased;">

  <!-- Outlook desktop ignores CSS background-image entirely; VML is the only
       way it will tile one. If this is stripped or fails, the flat colour
       below shows and the email is exactly what it was before the doodles. -->
  ${backdrop ? `<!--[if gte mso 9]>
  <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
    <v:fill type="tile" src="${esc(backdrop)}" color="${P.page}"/>
  </v:background>
  <![endif]-->` : ''}

  <!-- Preheader: the grey line beside the subject in the inbox. The spacer run
       stops the client pulling body copy in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${preheader}
    ${'&#8203;&nbsp;'.repeat(60)}
  </div>

  <!-- ── PAGE ──────────────────────────────────────────────────────────────
       The doodles live here and nowhere else. Every card below paints its own
       opaque ground, so nothing is ever drawn behind a button or inside an
       information card — that is a property of the stacking, not a rule to
       remember.

       background-size pins the 2x tile back to its intended size. The colour
       is stated first so it is what shows while the image loads, and what
       remains if images are blocked. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         ${backdrop ? `background="${esc(backdrop)}" ` : ''}style="background-color:${P.page};${backdrop ? `
                background-image:url('${esc(backdrop)}');background-repeat:repeat;
                background-position:center top;background-size:${BACKDROP.tileWidth}px auto;` : ''}">
    <tr><td class="page" align="center" style="padding:56px 28px;">

      <table role="presentation" width="${LAYOUT.card}" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:${LAYOUT.card}px;background:${P.card};border-radius:4px;overflow:hidden;
                    box-shadow:0 8px 48px rgba(45,30,10,0.12);">
`;
}

/** The footer band, the reply note, and the close of every tag opened above. */
export function shellBottom({ rsvpUrl }) {
  return `
        <!-- ── FOOTER ────────────────────────────────────────────────────── -->
        <tr><td class="pad" style="padding:28px 56px;text-align:center;background:${P.green};">
          <p style="margin:0 0 6px;font:400 12px/1.6 ${SANS};color:${P.footerInk};letter-spacing:1px;">
            SATURDAY &middot; 26 SEPTEMBER 2026
          </p>
          <p style="margin:0;font:400 12px/1.6 ${SANS};color:${P.footerSub};">
            ${esc(WEDDING.venueName)}, ${esc(WEDDING.venueArea)}
          </p>
        </td></tr>
      </table>

      <table role="presentation" width="${LAYOUT.card}" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:${LAYOUT.card}px;">
        <tr><td style="padding:20px 24px 0;text-align:center;">
          <p style="margin:0;font:400 12px/1.7 ${SANS};color:${P.muted};">
            Need to change anything? Simply reply to this email &mdash; it reaches us directly.
          </p>
          <p style="margin:8px 0 0;font:400 12px/1.7 ${SANS};color:${P.muted};">
            <a href="${esc(rsvpUrl)}" style="color:${P.muted};">${esc(rsvpUrl)}</a>
          </p>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
}
