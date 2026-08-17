/**
 * Confirmation pack configuration — the single place to edit copy, addresses,
 * artwork and pacing. Nothing else hard-codes any of it.
 */

export const TABLE = 'rsvps';

/**
 * Delivery state, as written to rsvps.email_status.
 *
 * NOT_SENT is the value the planning sheet uses. The column is nullable with
 * no default, so most rows hold NULL instead — see isUnsent() in
 * recipients.mjs, which treats both as "nobody has emailed this guest yet".
 * Only SENT is ever written back; a failure leaves the row untouched so the
 * next run picks it up again.
 */
export const STATUS = {
  NOT_SENT: 'Not Sent',
  SENT:     'Sent',
};

/** Guests are confirmed once the couple has approved them. */
export const APPROVED = 'APPROVED';

/** Wedding facts. Used by the template and the calendar link. */
export const WEDDING = {
  couple:     'Princess & IniOluwa',
  bride:      'Princess',
  groom:      'IniOluwa',
  dateLong:   'Saturday, 26th September 2026',
  // The masthead form. Spelled out in full there because it is the one place
  // a guest reads the date before anything else.
  dateHeadline: 'Saturday, September 26, 2026',
  dateShort:  '26.09.2026',
  venueName:  'Signature by Wells Carlton',
  venueArea:  'Asokoro, Abuja',
  // The ceremony begins at noon WAT (UTC+1).
  date:          new Date(Date.UTC(2026, 8, 26, 11, 0, 0)),
  calendarRange: '20260926T110000Z/20260926T220000Z',
};

/** Where guests are sent to give, if they would like to. */
export const REGISTRY_URL = 'https://ouish.co/princess-and-ini-wedding';

/**
 * Direct transfer, offered as the secondary option under the registry.
 *
 * Shown to every guest, so it carries no personal detail beyond the account
 * names the couple chose to publish.
 */
export const BANK_ACCOUNTS = [
  { name: 'Karunwi IniOluwa Joel', bank: 'UBA',         number: '2060477082' },
  { name: 'Princess Victor Sado',  bank: 'Zenith Bank', number: '2218670750' },
];

/** Google Maps search for the venue, linked from the location card. */
export const MAP_URL =
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(`${WEDDING.venueName}, ${WEDDING.venueArea}, Nigeria`);

/**
 * Artwork.
 *
 * Email clients do not render `data:` image URIs — Gmail strips them outright —
 * so every image must be a public https URL. The files live in the site's own
 * `public/email/` folder and ship with the next deploy, which keeps the
 * artwork on the same domain as the RSVP link and needs no separate hosting.
 *
 * See public/email/README.md for the exact filenames.
 *
 * These names must match what is actually deployed, byte for byte — an email
 * fetches images by URL, so a filename the site does not serve renders as
 * nothing at all rather than as a broken box, and fails silently.
 *
 * ── A note on weight ───────────────────────────────────────────────────────
 * The five are ~8.8 MB as uploaded, and a guest invited to the whole day
 * loads the hero, the venue and the dress guide — about 5.4 MB onto a phone.
 * They are watercolours, so PNG stores every brush-texture pixel losslessly;
 * re-encoding them as JPEG at the size they are displayed gets the same five
 * to 1.2 MB with no visible loss. That is a rename, so it is not done here.
 * See scripts/email/optimize-artwork.mjs if it is ever wanted.
 */
export const ASSET_FILES = {
  joining:      'joining.png',
  reception:    'reception.png',
  'after-party':'after-party.png',
  'dress-guide':'dress-guide.png',
  venue:        'venue.png',      // watercolour of Signature by Wells Carlton
  backdrop:     'backdrop.png',   // generated — npm run email:backdrop
};

/**
 * Intrinsic pixel dimensions of each artwork. Used only for its aspect ratio.
 *
 * An <img> carrying a width attribute and no height reserves no vertical space
 * until the bytes arrive. Until then the client either collapses the row or
 * paints its own placeholder of arbitrary size, and the layout jumps when the
 * image finally lands — which on a slow connection reads as a blank gap, or as
 * a grey/black box sitting where the artwork should be.
 *
 * Supplying the height as well fixes the box before a byte is downloaded.
 * Clients that honour `height:auto` in the inline style override it when the
 * card is narrower than full width; Outlook, which does not, uses the
 * attribute and gets the proportions right instead of squashing to a square.
 *
 * The self test asserts these against the real files, so they cannot quietly
 * drift from the artwork after a re-export or a re-encode.
 */
export const ASSET_SIZE = {
  joining:       { width: 1060, height: 1484 },
  reception:     { width: 1023, height: 1537 },
  'after-party': { width: 1023, height: 1537 },
  'dress-guide': { width: 1024, height: 1536 },
  venue:         { width: 1429, height: 1100 },
};

/** Displayed height for `key` rendered at `displayWidth` CSS px. */
export function scaledHeight(key, displayWidth) {
  const size = ASSET_SIZE[key];
  return size ? Math.round((size.height / size.width) * displayWidth) : null;
}

/**
 * The page backdrop tile, in CSS pixels.
 *
 * The PNG is rendered at 2x for retina, so background-size must pin it back to
 * this width or the doodles arrive twice the intended size. A client that
 * ignores background-size shows the tile at 2800px, which only widens the
 * clean centre channel — the safe direction to fail in.
 */
export const BACKDROP = { tileWidth: 1600, channel: 840 };

/**
 * The content column.
 *
 * 600px is the traditional email width, chosen for Outlook 2003 at 1024×768.
 * On a modern screen it reads as a narrow strip floating in empty space, so
 * this is 700 — wider, but still inside the ~65-character measure that keeps
 * 16px body copy comfortable (700 less 2×56 padding gives a 588px column).
 *
 * Below `mobile`, the card is fluid and the side padding shrinks; above it,
 * the card is fixed and centred. The backdrop's clean channel is kept wider
 * than the card so the doodles never run underneath it.
 */
export const LAYOUT = {
  card:   700,
  mobile: 760,   // breakpoint: card + outer padding + a little air
};

/**
 * Resolves artwork to absolute URLs.
 * INVITE_ASSET_BASE_URL overrides, for hosting the images elsewhere (a CDN,
 * or Supabase storage) without touching the template.
 */
export function assetUrls({ siteUrl, baseUrl }) {
  const base = (baseUrl || `${String(siteUrl).replace(/\/+$/, '')}/email`).replace(/\/+$/, '');
  return Object.fromEntries(
    Object.entries(ASSET_FILES).map(([key, file]) => [key, `${base}/${file}`]),
  );
}

/**
 * Sender identity.
 *
 * The domain must be verified in Resend — Resend rejects unverified senders
 * outright, so a typo here fails loudly on the first send rather than
 * silently delivering to spam. Override per-environment with INVITE_FROM.
 */
export const DEFAULT_FROM = `${WEDDING.couple} <hello@princessandini.com>`;

/** Where replies go. Guests will reply to this; make it land somewhere real. */
export const DEFAULT_REPLY_TO = 'hello@princessandini.com';

/**
 * The update series.
 *
 * Every email to guests is numbered, so the masthead reads
 *
 *     WEDDING UPDATE #1
 *     47 Days to Go
 *     Your Invitation Has Been Confirmed
 *
 * The number is the point. It tells a guest there will be more, that they
 * should expect to hear from us again, and that this is not another
 * invitation — which is exactly what a guest who has already RSVP'd needs to
 * know before they read a word.
 *
 * ── Sending the next one ───────────────────────────────────────────────────
 * Change `number` and `title` here and nothing else moves. The countdown is
 * computed, so it is right on the day it is sent rather than the day it was
 * written. Planned:
 *
 *   #2  One Week To Go            — final logistics
 *   #3  Tomorrow's the Day        — timings, parking, weather
 *   #4  Thank You for Celebrating — photographs, after the day
 */
export const UPDATE = {
  number: 1,
  title:  'Your Invitation Has Been Confirmed',

  /** The line between the label and the title. */
  headline(days) {
    if (days > 1)  return `${days} Days to Go`;
    if (days === 1) return 'One Day to Go';
    return 'Today&rsquo;s the Day';
  },

  /** "WEDDING UPDATE #1" */
  label() { return `Wedding Update #${this.number}`; },
};

/**
 * The subject line.
 *
 * Deliberately not "You're invited" — these guests have already RSVP'd, and
 * being re-invited to something you have already accepted reads as a mistake.
 *
 * The update number lives in the masthead but no longer in the subject: short
 * and warm survives an inbox better than a numbered series, and most clients
 * truncate somewhere around 45 characters on a phone.
 */
export const SUBJECT = `Your Invitation is Confirmed! 💍 · ${WEDDING.couple}`;

/**
 * Pacing.
 *
 * Resend's default account limit is 2 requests/second. We send one at a time
 * with a gap rather than in parallel: the list is small (dozens), the run is
 * not time-critical, and serial sending makes the failure report exactly
 * attributable to a guest.
 */
export const RATE = {
  minGapMs:    600,   // ~1.6 req/s, comfortably under the 2/s limit
  maxRetries:  2,     // per guest, for transient failures only
  retryBaseMs: 1000,  // 1s, 2s
};

/** HTTP status codes worth retrying. Anything else is a real rejection. */
export const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];

/** Palette, taken from the Banani design pass. */
export const PALETTE = {
  page:      '#e8e0d0',   // outside the card
  card:      '#f9f5ed',   // the card itself
  alt:       '#ede8db',   // alternating band — schedule, dress guide
  panel:     '#fdfaf4',   // registry panel, one step lighter than the card
  green:     '#1a3410',   // headings, footer ground
  greenMid:  '#2d5016',   // ticks, buttons, accents
  gold:      '#b8860b',   // eyebrow labels, times, rules
  ink:       '#4a3e28',   // body copy
  muted:     '#7a6e56',   // secondary copy
  faint:     '#a89880',   // calendar weekday initials
  rule:      '#d4c9a8',   // borders
  plusBg:    '#f0f5ec',   // plus-one card, confirmed
  plusRule:  '#c2d4b0',
  plusInk:   '#4a5e3a',
  footerInk: '#a8c090',
  footerSub: '#6a8a5a',
};

/**
 * Type stacks.
 *
 * The design specifies PT Serif and DM Sans. Apple Mail and iOS Mail honour a
 * webfont link; Gmail and Outlook strip it and fall back. Both stacks are
 * therefore written so the fallback carries the design on its own — Georgia
 * for the serif warmth, Helvetica for the letter-spaced labels.
 */
export const TYPE = {
  serif: "'PT Serif',Georgia,'Times New Roman',Times,serif",
  sans:  "'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif",
  webfont: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700' +
           '&family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap',
};
