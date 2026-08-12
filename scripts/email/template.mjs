/**
 * The invitation email — pure rendering, no I/O.
 *
 * Email HTML is not web HTML. Outlook renders through Word, Gmail strips
 * <style> blocks in some clients and all of it in others, and flexbox and grid
 * are unavailable. So: nested tables for layout, inline styles only, no
 * external CSS, no web fonts (they fall back to serif, which suits this).
 * Every colour is stated explicitly because dark-mode clients invert
 * unstyled backgrounds.
 */

import { WEDDING } from './config.mjs';
import { firstName } from './recipients.mjs';

const CREAM = '#fdf9f3';
const INK   = '#2c2418';
const GOLD  = '#b08d4f';
const MUTED = '#6b6152';

/** Escapes text interpolated into HTML. Names come from a spreadsheet. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function calendarUrl() {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text:   `${WEDDING.couple} Wedding`,
    dates:  WEDDING.calendarRange,
    location: `${WEDDING.venue}, Nigeria`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * Renders the invitation for one guest.
 *
 * `rsvpUrl` is the live site. Guests who were entered straight into the
 * planning sheet have never seen it, so the button is the whole point of the
 * email: it is what turns an approved guest into an RSVP.
 */
export function renderInvitation(row, { rsvpUrl }) {
  const name = firstName(row);
  const cal  = calendarUrl();

  const text = [
    `Dear ${name},`,
    '',
    `${WEDDING.bride} and ${WEDDING.groom} would be honoured by your presence`,
    'as they marry.',
    '',
    `  ${WEDDING.dateLong}`,
    `  ${WEDDING.venue}`,
    '',
    'Please let us know if you can join us:',
    `  ${rsvpUrl}`,
    '',
    `Add it to your calendar: ${cal}`,
    '',
    'With love,',
    WEDDING.couple,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(WEDDING.couple)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <!-- Preheader: the grey line clients show next to the subject. The spacer
       run stops the client from pulling body copy in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${esc(WEDDING.dateLong)} · ${esc(WEDDING.venue)}
    ${'&#8203;&nbsp;'.repeat(60)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${CREAM};padding:32px 12px;">
    <tr><td align="center">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;background:#ffffff;border:1px solid #ece3d4;border-radius:14px;">

        <tr><td style="height:8px;background:${GOLD};border-radius:13px 13px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:44px 40px 8px;text-align:center;">
          <p style="margin:0 0 22px;font:400 11px/1.6 Georgia,'Times New Roman',serif;
                    letter-spacing:.24em;text-transform:uppercase;color:${MUTED};">
            Together with their families
          </p>
          <p style="margin:0 0 10px;font:400 34px/1.25 Georgia,'Times New Roman',serif;color:${INK};">
            ${esc(WEDDING.bride)} <span style="color:${GOLD};">&amp;</span> ${esc(WEDDING.groom)}
          </p>
          <p style="margin:0;font:italic 400 16px/1.6 Georgia,'Times New Roman',serif;color:${MUTED};">
            request the pleasure of your company
          </p>
        </td></tr>

        <tr><td style="padding:26px 40px 0;">
          <table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr><td style="height:1px;background:#e6dcc9;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:26px 40px 0;text-align:center;">
          <p style="margin:0 0 6px;font:400 19px/1.5 Georgia,'Times New Roman',serif;color:${INK};">
            ${esc(WEDDING.dateLong)}
          </p>
          <p style="margin:0;font:400 15px/1.6 Georgia,'Times New Roman',serif;color:${MUTED};">
            ${esc(WEDDING.venue)}
          </p>
        </td></tr>

        <tr><td style="padding:30px 40px 0;">
          <p style="margin:0;font:400 16px/1.75 Georgia,'Times New Roman',serif;color:${INK};">
            Dear ${esc(name)},
          </p>
          <p style="margin:14px 0 0;font:400 16px/1.75 Georgia,'Times New Roman',serif;color:${INK};">
            We would love to have you with us on our wedding day. Please let us
            know whether you can make it — it helps us plan the seating and
            make sure there is a place waiting for you.
          </p>
        </td></tr>

        <tr><td style="padding:30px 40px 0;text-align:center;">
          <!-- Bulletproof button: the table gives Outlook a background it will
               actually paint, since it ignores background on <a>. -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr><td style="background:${GOLD};border-radius:999px;">
              <a href="${esc(rsvpUrl)}"
                 style="display:inline-block;padding:15px 40px;font:400 15px/1 Georgia,'Times New Roman',serif;
                        letter-spacing:.1em;text-transform:uppercase;color:#ffffff;text-decoration:none;">
                RSVP
              </a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;font:400 13px/1.6 Georgia,'Times New Roman',serif;color:${MUTED};">
            <a href="${esc(cal)}" style="color:${MUTED};">Add to calendar</a>
          </p>
        </td></tr>

        <tr><td style="padding:34px 40px 44px;text-align:center;">
          <p style="margin:0;font:italic 400 16px/1.6 Georgia,'Times New Roman',serif;color:${INK};">
            With love,
          </p>
          <p style="margin:6px 0 0;font:400 18px/1.5 Georgia,'Times New Roman',serif;color:${GOLD};">
            ${esc(WEDDING.couple)}
          </p>
        </td></tr>
      </table>

      <p style="max-width:560px;margin:18px auto 0;font:400 12px/1.6 Georgia,'Times New Roman',serif;color:#9b917f;text-align:center;">
        If the button does not work, open this link:<br>
        <a href="${esc(rsvpUrl)}" style="color:#9b917f;">${esc(rsvpUrl)}</a>
      </p>

    </td></tr>
  </table>
</body>
</html>`;

  return { html, text };
}
