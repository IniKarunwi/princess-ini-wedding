/**
 * Invitation email configuration — the single place to edit copy, addresses
 * and pacing. Nothing else hard-codes any of it.
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

/** Guests are invited once the couple has approved them. */
export const APPROVED = 'APPROVED';

/** Wedding facts. Used by the template and the calendar link. */
export const WEDDING = {
  couple:     'Princess & IniOluwa',
  bride:      'Princess',
  groom:      'IniOluwa',
  dateLong:   'Saturday, 26th September 2026',
  dateShort:  '26.09.2026',
  venue:      'Asokoro, Abuja',
  city:       'Abuja, Nigeria',
  // Google Calendar wants UTC; the site uses the same window.
  calendarRange: '20260926T080000Z/20260926T200000Z',
};

/**
 * Sender identity.
 *
 * The domain must be verified in Resend — Resend rejects unverified senders
 * outright, so a typo here fails loudly on the first send rather than
 * silently delivering to spam. Override per-environment with INVITE_FROM.
 */
export const DEFAULT_FROM = `${WEDDING.couple} <invites@princessandini.com>`;

/** Where replies go. Guests answer invitations; make that land somewhere real. */
export const DEFAULT_REPLY_TO = 'hello@princessandini.com';

export const SUBJECT = `You're invited — ${WEDDING.couple}, ${WEDDING.dateShort}`;

/**
 * Pacing.
 *
 * Resend's default account limit is 2 requests/second. We send one at a time
 * with a gap rather than in parallel: an invitation list is small (dozens),
 * the run is not time-critical, and serial sending makes the failure report
 * exactly attributable to a guest.
 */
export const RATE = {
  minGapMs:   600,   // ~1.6 req/s, comfortably under the 2/s limit
  maxRetries: 2,     // per guest, for transient failures only
  retryBaseMs: 1000, // 1s, 2s
};

/** HTTP status codes worth retrying. Anything else is a real rejection. */
export const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];
