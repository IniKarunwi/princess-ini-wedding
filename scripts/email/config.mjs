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
  dateShort:  '26.09.2026',
  venueName:  'Signature by Wells Carlton',
  venueArea:  'Asokoro, Abuja',
  // The ceremony begins at noon WAT (UTC+1).
  date:          new Date(Date.UTC(2026, 8, 26, 11, 0, 0)),
  calendarRange: '20260926T110000Z/20260926T220000Z',
};

/** Where guests are sent to give, if they would like to. */
export const REGISTRY_URL = 'https://ouish.co/princess-and-ini-wedding';

/** Google Maps search for the venue, linked from the location card. */
export const MAP_URL =
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(`${WEDDING.venueName}, ${WEDDING.venueArea}, Nigeria`);

/**
 * Artwork.
 *
 * Email clients do not render `data:` image URIs — Gmail strips them outright —
 * so every image must be a public https URL. The four files live in the site's
 * own `public/email/` folder and ship with the next deploy, which keeps the
 * artwork on the same domain as the RSVP link and needs no separate hosting.
 *
 * See public/email/README.md for the exact filenames.
 */
export const ASSET_FILES = {
  joining:      'joining.png',
  reception:    'reception.png',
  'after-party':'after-party.png',
  'dress-guide':'dress-guide.png',
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
 * The subject line.
 *
 * Deliberately not "You're invited" — these guests have already RSVP'd, and
 * being re-invited to something you have already accepted reads as a mistake.
 */
export const SUBJECT = `Your wedding details — ${WEDDING.couple}, ${WEDDING.dateShort}`;

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

/** Palette, lifted from the invitation suite. */
export const PALETTE = {
  cream:     '#faf6ee',
  card:      '#ffffff',
  green:     '#1b3b2a',
  greenSoft: '#2f5742',
  gold:      '#b3933f',
  goldSoft:  '#d9c48a',
  ink:       '#3a3427',
  muted:     '#6f6757',
  rule:      '#e6dcc6',
  rose:      '#c0757a',
};
