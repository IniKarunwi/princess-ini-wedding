/**
 * Who gets the confirmation pack — pure functions, no I/O.
 *
 * Kept separate from the sender so the selection rules can be tested offline
 * against fixture rows. Getting this wrong emails the wrong people, and that
 * is not an error you can take back.
 *
 * ── This is not the invitation list ────────────────────────────────────────
 * The pack opens with "Thank you for RSVPing", so it goes only to guests who
 * actually have. An approved guest who never replied has nothing to be thanked
 * for; eleven such guests were entered straight into the planning sheet and
 * have `attending` blank. They are skipped, and counted separately in the
 * report, because they are the people who still need chasing.
 */

import { STATUS, APPROVED } from './config.mjs';
import { eventsForGuest, eventsForPlusOne, plusOneState, plusOneBeyondMain } from './events.mjs';

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

  // The pack thanks them for RSVPing, so they must have done so.
  if (row.attending !== true) {
    return {
      send: false,
      reason: row.attending === false
        ? 'RSVP\'d no — not attending'
        : 'has not RSVP\'d yet',
    };
  }

  // Without a tier there are no events to confirm, and a confirmation pack
  // listing nothing is worse than no email at all.
  if (eventsForGuest(row).length === 0) {
    return {
      send: false,
      reason: text(row.approved_for) === null
        ? 'approved but no tier set — nothing to confirm'
        : `unrecognised tier: ${text(row.approved_for)}`,
    };
  }

  // Telling someone their plus one is not accommodated when the couple has
  // not actually decided cannot be walked back. Hold them instead.
  const plusOne = plusOneState(row);
  if (plusOne === 'pending') {
    return { send: false, reason: 'plus one requested but not yet decided' };
  }

  // An approved plus one with no tier recorded is a half-made decision. The
  // pack would confirm a seat without saying which parts of the day it is
  // for, and the guest would have to ask — which is the one thing this email
  // exists to prevent. The main guest's tier is deliberately NOT used as a
  // fallback; that is exactly the coupling this separation removes.
  if (plusOne === 'approved' && eventsForPlusOne(row).length === 0) {
    return {
      send: false,
      reason: 'plus one approved but plus_one_approved_for is not set',
    };
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

/**
 * Skips that are waiting on the couple, not on the guest.
 *
 * These are the rows where a decision would turn somebody into a recipient —
 * an undecided plus one, a missing tier. Worth surfacing on every run, because
 * otherwise they sit unsent and unnoticed until someone asks why.
 */
export function awaitingDecision(skipped) {
  return skipped.filter(s =>
    s.reason.startsWith('plus one requested')
    || s.reason.startsWith('plus one approved but')
    || s.reason.startsWith('approved but no tier')
    || s.reason.startsWith('unrecognised tier'));
}

/**
 * Guests whose plus one is invited to something they are not.
 *
 * Not a reason to hold — the data is internally consistent and the pack
 * renders it faithfully — but it is almost certainly a slip, and it means the
 * main guest learns an event they are excluded from exists. Worth a look
 * before a send rather than after.
 */
export function plusOneOutranksGuest(rows) {
  return rows
    .map(row => ({ row, extra: plusOneBeyondMain(row) }))
    .filter(x => x.extra.length && plusOneState(x.row) === 'approved');
}

/** Approved guests who have simply never replied — the chase list. */
export function awaitingRsvp(skipped) {
  return skipped.filter(s => s.reason === 'has not RSVP\'d yet');
}

/** First name, for the greeting. Falls back to the whole name, then a neutral one. */
export function firstName(row) {
  const full = text(row.full_name);
  if (full === null) return 'Friend';
  // "Pastor Chingtok +3" → "Pastor"; a plus-N suffix is a seat count, not a name.
  const cleaned = full.replace(/\s*\+\s*\d+\s*$/, '').trim();
  return cleaned.split(/\s+/)[0] || 'Friend';
}
