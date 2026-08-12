/**
 * Who gets an invitation — pure functions, no I/O.
 *
 * Kept separate from the sender so the selection rules can be tested offline
 * against fixture rows. Getting this wrong emails the wrong people, and that
 * is not an error you can take back.
 */

import { STATUS, APPROVED } from './config.mjs';

/** Trimmed string, or null for blank/absent. */
function text(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Has this guest already been emailed?
 *
 * NULL counts as unsent. The column was added nullable with no default
 * (0001_sync_layer.sql), so every row that predates the automation holds NULL
 * rather than the sheet's literal 'Not Sent'. Matching only the literal would
 * select nobody at all.
 *
 * The comparison is case- and space-insensitive because the value has two
 * authors — this script and whoever types in the planning sheet — and
 * 'not sent', 'Not Sent' and 'NOT SENT' plainly mean the same thing.
 */
export function isUnsent(row) {
  const status = text(row.email_status);
  if (status === null) return true;
  return status.replace(/\s+/g, ' ').toLowerCase()
       === STATUS.NOT_SENT.toLowerCase();
}

/** Already emailed, so skipped. Distinguished from "not eligible" in reports. */
export function isAlreadySent(row) {
  const status = text(row.email_status);
  return status !== null && !isUnsent(row);
}

/**
 * A minimal deliverability check.
 *
 * Not a full RFC 5322 validation — that is famously not worth attempting.
 * This catches the shapes that actually occur in a hand-maintained
 * spreadsheet: a phone number in the email column, a bare name, a trailing
 * comma from a paste, two addresses in one cell.
 */
export function isSendableEmail(value) {
  const email = text(value);
  if (email === null) return false;
  if (/[\s,;]/.test(email)) return false;          // two addresses, or a stray comma
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(email);
}

/**
 * Decide one guest's fate. Returns { send: true } or { send: false, reason }.
 *
 * The reason strings are what the report prints, so they are written to be
 * read by a person deciding whether to go fix the spreadsheet.
 */
export function classify(row) {
  if (text(row.main_invite_status) === null) {
    return { send: false, reason: 'no decision yet — main invite is pending' };
  }
  if (text(row.main_invite_status).toUpperCase() !== APPROVED) {
    return { send: false, reason: `not approved (${text(row.main_invite_status)})` };
  }
  if (isAlreadySent(row)) {
    return { send: false, reason: `already sent (${text(row.email_status)})` };
  }
  if (!isSendableEmail(row.email)) {
    return {
      send: false,
      reason: text(row.email) === null
        ? 'no email address on file'
        : `unusable email address: ${text(row.email)}`,
    };
  }
  return { send: true };
}

/**
 * Split every guest into those to email and those to skip.
 *
 * Skips are returned rather than silently dropped: "why did 40 of my 187
 * guests not get an email" is the first question anyone asks, and the answer
 * should be in the run's own output.
 */
export function selectRecipients(rows) {
  const send = [];
  const skipped = [];

  for (const row of rows) {
    const verdict = classify(row);
    if (verdict.send) send.push(row);
    else skipped.push({ row, reason: verdict.reason });
  }

  return { send, skipped };
}

/**
 * Guests approved and unsent but *unreachable* — a spreadsheet problem, not a
 * sending problem. Surfaced separately because these are the rows someone can
 * actually go and fix, unlike "not approved yet".
 */
export function unreachable(skipped) {
  return skipped.filter(s =>
    s.reason.startsWith('no email') || s.reason.startsWith('unusable email'));
}

/** First name, for the greeting. Falls back to the whole name, then a neutral one. */
export function firstName(row) {
  const full = text(row.full_name);
  if (full === null) return 'Friend';
  // "Pastor Chingtok +3" → "Pastor"; a plus-N suffix is a seat count, not a name.
  const cleaned = full.replace(/\s*\+\s*\d+\s*$/, '').trim();
  return cleaned.split(/\s+/)[0] || 'Friend';
}
