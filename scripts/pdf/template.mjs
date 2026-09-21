/**
 * The printed Invitation & Guest Guide — one HTML document per tier.
 *
 * For guests we have no email address for. They are invited BY this document,
 * their seats are guaranteed, and there is nothing for them to RSVP to — so
 * the confirmation-pack copy is reworked rather than copied: no "thank you for
 * taking the time to RSVP", no RSVP button, no countdown that would be stale
 * by the time it is printed.
 *
 * ── Why it imports events.mjs ──────────────────────────────────────────────
 * The one rule that governs the email governs this too: a guest is shown ONLY
 * the events they are invited to. Someone invited to the Reception alone must
 * finish this document unaware that an After Party exists.
 *
 * Rather than restate that rule here — where it could quietly drift from the
 * email's version — the tier logic is imported. One source of truth, so a
 * change to who-sees-what lands in both at once.
 *
 * ── On the artwork ─────────────────────────────────────────────────────────
 * The floral sprigs and the two moodboard pages are lifted straight out of the
 * couple's own TRW2026 guide. The original's text was outlined vector art, so
 * it could not be edited in place and the pages carrying it are rebuilt.
 * Georgia/Times stands in for the original display serif, which was not
 * available as a font file.
 */

import { WEDDING, REGISTRY_URL, BANK_ACCOUNTS, STAY } from '../email/config.mjs';
import { eventsForGuest } from '../email/events.mjs';

/** Taken from the printed guide, not from the email — this is a print piece. */
const P = {
  green:     '#1b4332',   // cover ground, headings
  greenDeep: '#143728',
  gold:      '#b8935a',
  goldSoft:  '#c9a86c',
  cream:     '#f6f1e4',   // page ground
  creamDeep: '#efe8d6',
  ink:       '#2f2a20',
  muted:     '#6f6551',
  rule:      '#d8cdb2',
  onGreen:   '#efe6cf',
  onGreenDim:'#a8bda6',
};

const SERIF = "Georgia,'Liberation Serif','Times New Roman',Times,serif";
const SANS  = "'Liberation Sans',Helvetica,Arial,sans-serif";

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** The colour palette from the original dress-guide page. */
const PALETTE_SWATCHES = [
  ['#1b4332', 'Emerald /<br>Deep Forest'],
  ['#2d6a4f', 'Garden<br>Green'],
  ['#52b788', 'Canopy /<br>Leaf Green'],
  ['#95c9a5', 'Sage /<br>Soft Green'],
  ['#c9e4d0', 'Morning<br>Mist / Mint'],
  ['#f6f1e4', 'Ivory /<br>Cream'],
  ['#e3cf9a', 'Champagne /<br>Warm Gold'],
  ['#e8b7a6', 'Garden Blush<br>/ Soft Rose'],
  ['#7b5236', 'Warm Earth /<br>Terracotta'],
];

/** ✦ ◆ ✦ — the ornament the original uses between blocks. */
const ornament = (colour = P.gold) =>
  `<div style="text-align:center;color:${colour};font-size:9pt;letter-spacing:6px;margin:14pt 0;">&#10022; &#9670; &#10022;</div>`;

const rule = (colour = P.rule) =>
  `<div style="height:0.6pt;background:${colour};margin:12pt 0;"></div>`;

/** A gold letter-spaced eyebrow, as on every section of the original. */
const eyebrow = (text, colour = P.gold) =>
  `<p style="margin:0 0 5pt;font-family:${SANS};font-size:6.5pt;letter-spacing:2.6px;
             text-transform:uppercase;color:${colour};font-weight:700;">${esc(text)}</p>`;

/* ── Pages ────────────────────────────────────────────────────────────────── */

const cover = (assets) => `
<section class="page cover">
  <img class="sprig tl" src="${assets['sprig-a']}">
  <img class="sprig tr" src="${assets['sprig-b']}">
  <img class="sprig bl" src="${assets['sprig-c']}">
  <img class="sprig br" src="${assets['sprig-d']}">

  <div class="cover-mid">
    <p class="cover-eyebrow">You are warmly invited to the wedding celebration of</p>
    <div class="cover-rule"><span></span>&#10022;<span></span></div>

    <h1 class="cover-name">${esc(WEDDING.bride)}</h1>
    <div class="cover-amp">&amp;</div>
    <h1 class="cover-name">${esc(WEDDING.groom)}</h1>

    <div class="cover-rule"><span></span>&#10022;<span></span></div>

    <p class="cover-date">Saturday, the 26th of September &middot; 2026</p>
    <p class="cover-venue-sm">${esc(WEDDING.venueArea.toUpperCase())}, NIGERIA</p>
    <p class="cover-venue">${esc(WEDDING.venueName)}</p>
    <p class="cover-code">Black tie preferred &middot; Eden in Full Bloom</p>
  </div>

  <p class="cover-foot">Please turn over for your complete guest guide &rarr;</p>
</section>`;

/**
 * The welcome.
 *
 * Rewritten from the email's greeting. The email thanks a guest for RSVPing
 * and tells them their RSVP has been reviewed; neither is true here. These
 * guests are being invited by this document and their seats are already held,
 * so the promise replaces the thanks.
 */
const welcome = (assets) => `
<section class="page cream">
  <img class="sprig corner-tr" src="${assets['sprig-e']}">

  ${eyebrow('A message from the couple', P.gold)}
  <h2 class="display">With Joy &amp; Gratitude</h2>
  <div class="short-rule"></div>

  <p class="body">
    We are overjoyed to welcome you into the most significant chapter of our
    love story. As we stand at the threshold of forever, we want you &mdash; our
    cherished family and friends &mdash; by our side as we say <strong>I do</strong>.
  </p>
  <p class="body">
    Our celebration is inspired by the beauty of <strong>Eden</strong> &mdash; a
    lush, flourishing garden where vibrant blooms, rich foliage and timeless
    elegance come together. We envision a day as alive and beautiful as the
    love we share.
  </p>
  <p class="body">
    <strong>Your place with us is already reserved.</strong> There is nothing
    you need to return or confirm &mdash; simply bring this guide with you on
    the day. Within these pages you will find everything you need to join us in
    our garden of joy.
  </p>

  <div class="heavy-rule"></div>

  <div class="datecard">
    <p class="datecard-month">September</p>
    <p class="datecard-day">26</p>
    <p class="datecard-year">2026</p>
    <p class="datecard-title">${esc(WEDDING.venueName)}</p>
    <p class="datecard-place">${esc(WEDDING.venueArea.toUpperCase())}, NIGERIA</p>
    <p class="datecard-note">Black Tie Preferred &middot; Strictly by Invitation</p>
  </div>

  ${rule()}

  <p class="body">
    Kindly note that this will be a <strong>phone-free ceremony</strong>. All
    mobile devices will be respectfully set aside during the service, and our
    photographers will capture every precious moment on your behalf.
  </p>

  ${ornament()}
  <p class="caption">Please see the following pages for your schedule, dress guide and guest information.</p>
</section>`;

/**
 * The itinerary — the one page that differs between the three variants.
 *
 * Built from the guest's own event list, exactly as the email's is, so an
 * event the reader is not invited to cannot appear in the markup at all.
 */
const itinerary = (events, assets) => {
  const many = events.length > 1;
  return `
<section class="page cream ${events.length < 3 ? 'centred' : ''}">
  <div style="text-align:center;">
    ${eyebrow('Your invitation')}
    <h2 class="display center">${many ? 'Your Wedding Day' : 'Your Invitation'}</h2>
    <p class="caption" style="margin-top:-2pt;">
      ${many
        ? `We would be honoured to have you with us for ${events.length === 3 ? 'all three' : 'both'} of the following.`
        : 'We would be honoured to have you with us for the following.'}
    </p>
  </div>

  ${ornament()}

  <div class="events">
    ${events.map(e => `
    <div class="event">
      <div class="event-time">${esc(e.time)}</div>
      <div class="event-body">
        <p class="event-name">${esc(e.name)}</p>
        <p class="event-note">${esc(e.blurb ?? '')}</p>
      </div>
    </div>`).join('')}
  </div>

  <p class="caption" style="margin-top:14pt;">
    ${many ? `All ${events.length === 3 ? 'three ' : ''}take place on ${esc(WEDDING.dateLong)}.`
           : `This takes place on ${esc(WEDDING.dateLong)}.`}
  </p>

  <div class="heavy-rule"></div>

  <div style="text-align:center;">
    ${eyebrow('Where everything will happen')}
    <h3 class="venue-name">${esc(WEDDING.venueName)}</h3>
    <p class="venue-area">${esc(WEDDING.venueArea)}</p>
    <!-- A printed page cannot be clicked, and the Maps URL is ~110 characters
         of query string nobody will retype. So: a QR, with the search terms
         spelled out underneath for anyone who would rather type it. -->
    <div class="mapbox">
      <img class="qr" src="${assets['qr-map']}">
      <div class="mapbox-text">
        <p class="map-label">Find us</p>
        <p class="map-note">
          Scan for directions, or search<br>
          <strong>&ldquo;${esc(WEDDING.venueName)}, ${esc(WEDDING.venueArea)}&rdquo;</strong><br>
          in Google Maps.
        </p>
      </div>
    </div>
    <p class="caption">
      We encourage early arrival. Gates open ahead of the start time, and
      ushers will guide you to your seat.
    </p>
  </div>
</section>`;
};

/**
 * Where to stay.
 *
 * Set in the guide's own language — gold eyebrow labels and a serif heading —
 * rather than with the 🏨 💎 💰 emoji the list was drafted with. Nothing else
 * in this document uses emoji, and a printed formal invitation is the one
 * place they would look like a mistake rather than a flourish. The price
 * bands still read as bands; they are just labelled instead of pictured.
 *
 * Worded as suggestions throughout: nothing here is booked, held or
 * rate-negotiated, and a guest must not infer that it is.
 */
const stay = () => `
<section class="page cream">
  <div style="text-align:center;">
    ${eyebrow('For guests travelling in')}
    <h2 class="display center">Where to Stay</h2>
    <p class="caption wide" style="margin-top:2pt;">${esc(STAY.intro)}</p>
  </div>

  ${ornament()}

  ${STAY.bands.map(band => `
  <div class="band">
    <p class="band-label">${esc(band.label)}</p>
    <table class="hotels">
      ${band.hotels.map(([name, area]) => `
      <tr>
        <td class="hotel-name">${esc(name)}</td>
        <td class="hotel-area">${esc(area)}</td>
      </tr>`).join('')}
    </table>
  </div>`).join('')}

  <div class="farther">
    <p class="farther-label">If you do not mind a longer drive</p>
    <p class="farther-name">${esc(STAY.farther.name)} &middot;
      <span class="farther-area">${esc(STAY.farther.area)}</span></p>
    <p class="farther-note">${esc(STAY.farther.note)}</p>
  </div>

  <p class="caption" style="margin-top:10pt;">
    These are suggestions to help you plan &mdash; no rooms are held on your
    behalf, so do book directly and early.
  </p>
</section>`;

const dressGuide = (assets) => `
<section class="page cream">
  <img class="sprig corner-tl" src="${assets['sprig-f']}">
  <div style="text-align:center;">
    <h2 class="dress-title">DRESS GUIDE</h2>
    <p class="dress-sub">Eden in Full Bloom</p>
    ${ornament()}
    <p class="caption wide">
      Our celebration is inspired by the beauty of a flourishing garden &mdash;
      where vibrant blooms, rich foliage and timeless elegance come together in
      perfect harmony.
    </p>
    ${eyebrow('Colour palette')}
    <p class="caption" style="margin-top:-3pt;">We invite you to wear colours you would find in a garden</p>
  </div>

  <div class="swatches">
    ${PALETTE_SWATCHES.map(([hex, label]) => `
    <div class="swatch">
      <div class="chip" style="background:${hex};"></div>
      <p class="chip-label">${label}</p>
    </div>`).join('')}
  </div>

  <div class="heavy-rule"></div>

  <div class="dress-col">
    <p class="dress-head">FOR THE GENTLEMEN</p>
    ${eyebrow('English formal \u00b7 style guide overleaf', P.goldSoft)}
    <ul class="dress-list">
      <li>Black tie or formal tuxedos are preferred</li>
      <li>Tailored dark or neutral suits are also welcome</li>
      <li>Crisp dress shirts, polished shoes &amp; elegant accessories</li>
      <li>Kindly refrain from wearing casual attire</li>
    </ul>
    <div class="dress-note">TIMELESS SOPHISTICATION IS THE DESIRED LOOK.</div>
  </div>

  <div class="dress-col">
    <p class="dress-head">FOR THE LADIES</p>
    ${eyebrow('Royal garden elegance \u00b7 style guide overleaf', P.goldSoft)}
    <ul class="dress-list">
      <li>Floor-length gowns or elegant cocktail / midi dresses</li>
      <li>Luxurious fabrics &mdash; silk, satin, chiffon, organza or lace</li>
      <li>Fascinators, statement hats or refined headpieces welcomed</li>
      <li>Elegant heels, delicate jewellery &amp; classic accessories</li>
    </ul>
    <div class="dress-note">THINK POLISHED, FEMININE, AND EFFORTLESSLY ELEGANT.</div>
  </div>

  <p class="caption" style="margin-top:10pt;">
    Your thoughtful participation in our dress code will help bring our vision
    of Eden in Full Bloom to life. Thank you for celebrating this special day with us.
  </p>
  <p class="signature">${esc(WEDDING.couple)}</p>
</section>`;

/** The two moodboards, straight from the couple's original guide. */
const moodboard = (assets, which, title, note) => `
<section class="page moodboard">
  <div class="mood-head">
    <div>
      <p class="mood-tag">TRW 2026</p>
      <p class="mood-couple">${esc(WEDDING.couple)}</p>
    </div>
    <p class="mood-title">${esc(title)}</p>
    <div class="mood-right">
      <p class="mood-code">DRESS CODE: EDEN IN FULL BLOOM</p>
      <p class="mood-note">${esc(note)}</p>
    </div>
  </div>
  <img class="mood-img" src="${assets[which]}">
</section>`;

/**
 * The closing notes.
 *
 * Two corrections against the original: gifts said account details were
 * "available upon request", and the RSVP panel pointed at details that came
 * with a personal invitation. Neither works for a guest holding only this
 * document, so the registry and account numbers are printed, and the RSVP
 * panel is replaced with the assurance that their seat is held.
 */
const notes = (assets) => `
<section class="page green">
  <img class="sprig corner-bl-green" src="${assets['sprig-g']}">
  <div style="text-align:center;">
    <h2 class="display on-green">A Few Kind Notes</h2>
    ${eyebrow('Important information for our guests', P.onGreenDim)}
  </div>

  <div class="notes">
    ${[
      ['Phone policy', 'We kindly ask that phones be put away during the ceremony. Our photographers will capture every memory beautifully.'],
      ['Social media', 'Please hold off on posting photos or videos until after the reception. We would love for the reveal to be on our own terms.'],
      ['Content creators', 'Professional content creators are not permitted unless officially contracted by the couple. Thank you for honouring this boundary.'],
      ['Access cards', 'Please bring this guide with you on the day. It confirms your invitation and will be checked at the entrance.'],
      ['Arrival', `We encourage early arrival. Gates open ahead of the start time, and ushers will guide you to your seat at ${WEDDING.venueName}.`],
    ].map(([h, b]) => `
    <div class="note">
      <p class="note-head">${esc(h)}</p>
      <p class="note-body">${esc(b)}</p>
    </div>`).join('')}
  </div>

  <div class="giftbox">
    <p class="gift-label">If you would like to bless us</p>
    <div class="gift-top">
      <img class="qr-sm" src="${assets['qr-registry']}">
      <p class="gift-body">
        Your presence is our greatest gift. Should you wish to bless us
        further, scan for our registry &mdash; or use the account details below.
        <span class="gift-url">${esc(REGISTRY_URL.replace(/^https:\/\//, ''))}</span>
      </p>
    </div>
    <div class="accounts">
      ${BANK_ACCOUNTS.map(a => `
      <div class="account">
        <p class="acct-name">${esc(a.name)}</p>
        <p class="acct-bank">${esc(a.bank)}</p>
        <p class="acct-no">${esc(a.number)}</p>
      </div>`).join('')}
    </div>
  </div>

  <div class="seatbox">
    <p class="seat-label">Your seat</p>
    <p class="seat-body">
      Your place with us is reserved. There is nothing to confirm &mdash;
      simply bring this guide with you on the day.
    </p>
  </div>

  <p class="closing">
    Your presence on our special day means more to us than words can ever
    express. Come ready to celebrate, to laugh, and to be swept away in the
    beauty of our garden of love.
  </p>
  <p class="signoff">With all our love, ${esc(WEDDING.couple)}</p>
  <p class="colophon">
    TRW 2026 &middot; ${esc(WEDDING.venueName)} &middot; ${esc(WEDDING.venueArea)} &middot; 26 September 2026
  </p>
</section>`;

/* ── Document ─────────────────────────────────────────────────────────────── */

export function renderGuide({ tier, assets }) {
  const events = eventsForGuest({ approved_for: tier });
  if (!events.length) throw new Error(`No events for tier "${tier}"`);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(WEDDING.couple)} — Invitation &amp; Guest Guide</title>
<style>
  @page { size: 385pt 529pt; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin:0; padding:0; }
  body { font-family:${SERIF}; color:${P.ink}; }

  .page {
    width:385pt; height:529pt; position:relative; overflow:hidden;
    page-break-after:always; padding:30pt 30pt 24pt;
  }
  .page:last-child { page-break-after:auto; }
  .cream { background:${P.cream}; }
  /* One- and two-event variants have far less to say than the three-event one.
     Centring keeps the page balanced instead of top-heavy with a third of it
     empty. */
  .centred { display:flex; flex-direction:column; justify-content:center; }
  .green, .cover { background:${P.green}; color:${P.onGreen}; }

  /* ── Sprigs, lifted from the couple's own guide ─────────────────────── */
  .sprig { position:absolute; width:86pt; opacity:0.95; }
  .tl { top:-16pt; left:-18pt; }  .tr { top:-16pt; right:-18pt; transform:scaleX(-1); }
  .bl { bottom:-16pt; left:-18pt; transform:scaleY(-1); }
  .br { bottom:-16pt; right:-18pt; transform:scale(-1,-1); }
  .corner-tr { top:-14pt; right:-14pt; width:70pt; }
  .corner-tl { top:-10pt; left:-14pt; width:70pt; }
  .corner-bl-green { bottom:-14pt; left:-16pt; width:66pt; opacity:0.5; }

  /* ── Cover ──────────────────────────────────────────────────────────── */
  .cover-mid { position:absolute; left:34pt; right:34pt; top:50%; transform:translateY(-52%); text-align:center; }
  .cover-eyebrow { margin:0 0 12pt; font-family:${SANS}; font-size:6pt; letter-spacing:2.8px;
                   text-transform:uppercase; color:${P.goldSoft}; }
  .cover-rule { color:${P.gold}; font-size:7pt; margin:8pt 0; }
  .cover-rule span { display:inline-block; width:52pt; height:0.5pt; background:${P.gold};
                     vertical-align:middle; margin:0 6pt; }
  .cover-name { margin:0; font-size:38pt; font-style:italic; font-weight:400;
                line-height:1.05; color:${P.onGreen}; letter-spacing:0.5px; }
  .cover-amp { font-size:15pt; font-style:italic; color:${P.gold}; margin:2pt 0; }
  .cover-date { margin:10pt 0 3pt; font-size:11pt; color:${P.onGreen}; letter-spacing:0.6px; }
  .cover-venue-sm { margin:0 0 8pt; font-family:${SANS}; font-size:5.6pt; letter-spacing:2.4px; color:${P.onGreenDim}; }
  .cover-venue { margin:0; font-size:16pt; font-style:italic; color:${P.gold}; }
  .cover-code { margin:8pt 0 0; font-family:${SANS}; font-size:5.4pt; letter-spacing:2.2px;
                text-transform:uppercase; color:${P.onGreenDim}; }
  .cover-foot { position:absolute; left:0; right:0; bottom:26pt; text-align:center;
                font-size:7.5pt; font-style:italic; color:${P.onGreenDim}; margin:0; }

  /* ── Type ───────────────────────────────────────────────────────────── */
  .display { margin:0 0 4pt; font-size:26pt; font-style:italic; font-weight:400; color:${P.green}; }
  .display.center { text-align:center; }
  .on-green { color:${P.onGreen}; }
  .short-rule { width:34pt; height:1.4pt; background:${P.green}; margin:8pt 0 12pt; }
  .heavy-rule { height:1.2pt; background:${P.green}; margin:10pt 0; }
  .body { margin:0 0 8pt; font-size:9pt; line-height:1.62; color:${P.ink}; }
  .caption { margin:6pt 0 0; font-size:7.6pt; font-style:italic; line-height:1.5;
             color:${P.muted}; text-align:center; }
  .caption.wide { padding:0 18pt; }

  /* ── Date card ──────────────────────────────────────────────────────── */
  .datecard { text-align:center; }
  .datecard-month { margin:0; font-family:${SANS}; font-size:6.5pt; letter-spacing:3px;
                    text-transform:uppercase; color:${P.green}; }
  .datecard-day { margin:0; font-size:34pt; line-height:1; color:${P.green}; }
  .datecard-year { margin:2pt 0 6pt; font-family:${SANS}; font-size:6pt; letter-spacing:2.6px; color:${P.muted}; }
  .datecard-title { margin:0; font-size:13pt; color:${P.green}; }
  .datecard-place { margin:3pt 0 0; font-family:${SANS}; font-size:5.8pt; letter-spacing:2.2px; color:${P.muted}; }
  .datecard-note { margin:4pt 0 0; font-size:7.6pt; font-style:italic; color:${P.muted}; }

  /* ── Itinerary ──────────────────────────────────────────────────────── */
  .events { margin-top:6pt; }
  .event { display:flex; align-items:flex-start; gap:12pt; padding:9pt 12pt;
           background:${P.creamDeep}; border-left:2.2pt solid ${P.green};
           border-radius:3pt; margin-bottom:8pt; }
  .event-time { flex:0 0 52pt; font-family:${SANS}; font-size:8pt; font-weight:700;
                letter-spacing:0.6px; color:${P.gold}; padding-top:1pt; }
  .event-name { margin:0; font-size:12pt; color:${P.green}; }
  .event-note { margin:2pt 0 0; font-size:7.6pt; line-height:1.45; color:${P.muted}; }

  .venue-name { margin:2pt 0 1pt; font-size:15pt; font-weight:400; color:${P.green}; }
  .venue-area { margin:0 0 8pt; font-family:${SANS}; font-size:6.4pt; letter-spacing:2.2px;
                text-transform:uppercase; color:${P.muted}; }
  .mapbox { border:0.8pt solid ${P.rule}; border-radius:4pt; padding:9pt 10pt; background:#fdfaf2;
            display:flex; align-items:center; gap:10pt; text-align:left; }
  .qr { width:72pt; height:72pt; flex:0 0 72pt; }
  .mapbox-text { flex:1; }
  .qr-sm { width:44pt; height:44pt; flex:0 0 44pt; background:#fff; padding:2pt; border-radius:2pt; }
  .gift-top { display:flex; align-items:center; gap:8pt; margin-bottom:5pt; }
  /* The URL is printed as well as encoded — not everyone will scan, and a
     registry nobody can reach is the same as no registry. */
  .gift-url { display:block; margin-top:2pt; font-family:${SANS}; font-size:7pt;
              font-weight:700; letter-spacing:0.3px; color:${P.goldSoft}; }
  .map-label { margin:0 0 3pt; font-family:${SANS}; font-size:5.8pt; letter-spacing:2.4px;
               text-transform:uppercase; color:${P.gold}; }
  .map-note { margin:0; font-size:7.4pt; font-style:italic; line-height:1.5; color:${P.muted}; }
  .map-note strong { color:${P.green}; font-style:normal; }

  /* ── Where to stay ──────────────────────────────────────────────────── */
  .band { margin-bottom:9pt; }
  .band-label { margin:0 0 3pt; font-family:${SANS}; font-size:6.5pt; font-weight:700;
                letter-spacing:2.4px; text-transform:uppercase; color:${P.gold};
                border-bottom:0.6pt solid ${P.rule}; padding-bottom:2.5pt; }
  .hotels { width:100%; border-collapse:collapse; }
  .hotels td { padding:3.2pt 0; vertical-align:baseline; }
  .hotel-name { font-size:9.5pt; color:${P.green}; }
  /* The area is the useful half — it is how a guest judges the drive — so it
     is set as a label rather than as an afterthought in brackets. */
  .hotel-area { text-align:right; font-family:${SANS}; font-size:6.4pt;
                letter-spacing:1.6px; text-transform:uppercase; color:${P.muted};
                white-space:nowrap; }

  .farther { border:0.8pt solid ${P.rule}; border-radius:4pt; padding:8pt 10pt;
             background:#fdfaf2; margin-top:4pt; }
  .farther-label { margin:0 0 3pt; font-family:${SANS}; font-size:5.8pt;
                   letter-spacing:2.2px; text-transform:uppercase; color:${P.gold}; }
  .farther-name { margin:0 0 2pt; font-size:9.5pt; color:${P.green}; }
  .farther-area { font-family:${SANS}; font-size:6.4pt; letter-spacing:1.6px;
                  text-transform:uppercase; color:${P.muted}; }
  .farther-note { margin:0; font-size:7.6pt; line-height:1.45; color:${P.muted}; }

  /* ── Dress guide ────────────────────────────────────────────────────── */
  .dress-title { margin:0; font-size:19pt; letter-spacing:3px; font-weight:700; color:${P.green}; }
  .dress-sub { margin:1pt 0 0; font-size:17pt; font-style:italic; color:${P.gold}; }
  .swatches { display:flex; flex-wrap:wrap; justify-content:center; gap:4pt 5pt; margin:8pt 0 2pt; }
  .swatch { width:56pt; text-align:center; }
  .chip { width:27pt; height:27pt; border-radius:50%; margin:0 auto 2pt; border:0.5pt solid rgba(0,0,0,0.08); }
  .chip-label { margin:0; font-size:5.6pt; line-height:1.3; color:${P.muted}; }
  .dress-col { margin-bottom:6pt; }
  .dress-head { margin:0 0 2pt; font-family:${SANS}; font-size:9pt; font-weight:700;
                letter-spacing:1.6px; color:${P.green}; }
  .dress-list { margin:3pt 0 4pt; padding-left:11pt; }
  .dress-list li { font-size:7.4pt; line-height:1.45; color:${P.ink}; margin-bottom:1pt; }
  .dress-note { border:0.8pt solid ${P.gold}; border-radius:2pt; padding:5pt;
                text-align:center; font-family:${SANS}; font-size:5.8pt;
                letter-spacing:1.4px; color:${P.gold}; }
  .signature { margin:4pt 0 0; text-align:center; font-size:15pt; font-style:italic; color:${P.gold}; }

  /* ── Moodboards ─────────────────────────────────────────────────────── */
  .moodboard { background:${P.cream}; padding:0; }
  .mood-head { display:flex; align-items:center; justify-content:space-between;
               padding:12pt 16pt 10pt; border-bottom:0.6pt solid ${P.rule}; }
  .mood-tag { margin:0; font-family:${SANS}; font-size:5pt; letter-spacing:2px; color:${P.muted}; }
  .mood-couple { margin:1pt 0 0; font-size:10pt; font-style:italic; color:${P.green}; }
  .mood-title { margin:0; font-size:19pt; font-style:italic; color:${P.green}; }
  .mood-right { text-align:right; }
  .mood-code { margin:0; font-family:${SANS}; font-size:5.4pt; font-weight:700;
               letter-spacing:0.8px; color:${P.green}; }
  .mood-note { margin:1pt 0 0; font-family:${SANS}; font-size:5pt; letter-spacing:0.6px; color:${P.muted}; }
  .mood-img { display:block; width:100%; height:auto; }

  /* ── Notes ──────────────────────────────────────────────────────────── */
  .notes { margin-top:10pt; }
  .note { border-top:0.5pt solid rgba(239,230,207,0.22); padding:4.2pt 0; }
  .note-head { margin:0 0 2pt; font-family:${SANS}; font-size:5.8pt; letter-spacing:2.2px;
               text-transform:uppercase; color:${P.goldSoft}; }
  .note-body { margin:0; font-size:7.4pt; line-height:1.38; color:${P.onGreen}; }

  .giftbox { border:0.8pt solid ${P.gold}; border-radius:3pt; padding:6pt 9pt; margin-top:7pt; }
  .gift-label { margin:0 0 3pt; font-family:${SANS}; font-size:5.8pt; letter-spacing:2.2px;
                text-transform:uppercase; color:${P.goldSoft}; text-align:center; }
  .gift-body { margin:0; font-size:7.6pt; line-height:1.45; color:${P.onGreen}; text-align:left; }
  .accounts { display:flex; gap:8pt; }
  .account { flex:1; text-align:center; border-top:0.5pt solid rgba(239,230,207,0.22); padding-top:4pt; }
  .acct-name { margin:0; font-size:7.4pt; color:${P.onGreen}; }
  .acct-bank { margin:1pt 0; font-family:${SANS}; font-size:5.6pt; letter-spacing:1.4px;
               text-transform:uppercase; color:${P.onGreenDim}; }
  .acct-no { margin:0; font-family:${SANS}; font-size:9pt; font-weight:700;
             letter-spacing:1.6px; color:${P.goldSoft}; }

  .seatbox { border:0.8pt solid ${P.gold}; border-radius:3pt; padding:5.5pt 9pt;
             margin-top:6pt; text-align:center; }
  .seat-label { margin:0 0 2pt; font-family:${SANS}; font-size:5.8pt; letter-spacing:2.4px;
                text-transform:uppercase; color:${P.goldSoft}; }
  .seat-body { margin:0; font-size:8pt; line-height:1.45; color:${P.onGreen}; }

  .closing { margin:7pt 0 0; text-align:center; font-size:7.4pt; font-style:italic;
             line-height:1.55; color:${P.onGreenDim}; }
  .signoff { margin:4pt 0 0; text-align:center; font-size:15pt; font-style:italic; color:${P.gold}; }
  .colophon { margin:4pt 0 0; text-align:center; font-family:${SANS}; font-size:5pt;
              letter-spacing:1.8px; text-transform:uppercase; color:${P.onGreenDim}; }
</style></head>
<body>
  ${cover(assets)}
  ${welcome(assets)}
  ${itinerary(events, assets)}
  ${stay()}
  ${dressGuide(assets)}
  ${moodboard(assets, 'moodboard-ladies', 'Ladies', 'Bold glamour, graceful silhouettes, unforgettable style')}
  ${moodboard(assets, 'moodboard-gentlemen', 'Gentlemen', 'Clean lines, bold presence, unforgettable style')}
  ${notes(assets)}
</body></html>`;
}
