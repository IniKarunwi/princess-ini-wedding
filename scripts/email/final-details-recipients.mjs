/**
 * Who receives the final-details email.
 *
 * DELIBERATELY NOT update-recipients.mjs, and deliberately not recipients.mjs.
 * There are now three campaigns and three different questions:
 *
 *   recipients.mjs         "who has RSVP'd and needs their invitation
 *                           confirmed" — the confirmation pack
 *   update-recipients.mjs  "who is invited and can be reached" — the thirty-day
 *                           note, which is news and so ignores RSVP entirely
 *   this file              "whose seat at the reception is actually confirmed"
 *
 * ── Why this one has to be narrower ────────────────────────────────────────
 * The email tells the guest the reception guest list is complete and that they
 * can walk up to an usher, give their name and be shown to a table. That is a
 * promise about a specific seat. Sending it to someone who never replied, or
 * who replied no, or who is approved for the after party only, promises a seat
 * that does not exist — and they would find that out at the door.
 *
 * So, include a guest when ALL of:
 *
 *   · main_invite_status is APPROVED
 *   · attending === true                     they actually said yes
 *   · RECEPTION is among their events        the promise is about the reception
 *   · any requested plus one has been decided
 *   · they have a usable email address
 *
 * ── What it deliberately does NOT look at ──────────────────────────────────
 *   email_status      This is a new campaign. Having received the confirmation
 *                     pack or the thirty-day note is not a reason to be
 *                     skipped — it is a reason to expect this one. Same
 *                     reasoning as update-recipients.mjs.
 *   seating data      The seating chart is the source of truth for WHERE
 *                     someone sits. It is not, and must never become, the
 *                     authority for WHO gets an email. That authority is the
 *                     RSVP table and nothing else. No import here reaches the
 *                     seating layout, the planner, or any of it.
 *
 * ── Why a pending plus one is held ─────────────────────────────────────────
 * Borrowed from recipients.mjs, because the reasoning has not changed: a guest
 * who asked to bring someone and has heard nothing will read "your seat is
 * confirmed" as covering both of them. Telling them otherwise at the door is
 * the failure this holds back from.
 *
 * Pure functions, no I/O, so the rules can be tested against fixture rows
 * offline. Getting this wrong emails the wrong people, and that is not an
 * error you can take back.
 */

import { APPROVED } from './config.mjs';
import { eventsForGuest, eventsForPlusOne, plusOneState } from './events.mjs';
import { isSendableEmail } from './recipients.mjs';

const text = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Verdict for one row: `{ send: true }`, or `{ send: false, reason, bucket }`.
 *
 * `bucket` groups the exclusions for the report. The order of the checks is
 * the order of the report, and is chosen so each guest lands in the most
 * specific bucket that explains them.
 */
export function classifyForFinalDetails(row) {
  const status = text(row.main_invite_status);

  if (status === null) {
    return { send: false, bucket: 'not-approved', reason: 'invitation still pending — no decision recorded' };
  }
  if (status.toUpperCase() !== APPROVED) {
    return { send: false, bucket: 'not-approved', reason: `not approved (${status})` };
  }

  if (row.attending !== true) {
    return {
      send: false,
      bucket: row.attending === false ? 'not-attending' : 'no-rsvp',
      reason: row.attending === false
        ? "RSVP'd no — not attending"
        : "has not RSVP'd — no seat to confirm",
    };
  }

  const events = eventsForGuest(row);
  if (events.length === 0) {
    return {
      send: false,
      bucket: 'no-tier',
      reason: text(row.approved_for) === null
        ? 'approved but no tier set'
        : `unrecognised tier: ${text(row.approved_for)}`,
    };
  }

  // The whole email is built around a confirmed reception seat.
  if (!events.some(e => e.key === 'RECEPTION')) {
    return {
      send: false,
      bucket: 'no-reception',
      reason: `not invited to the reception (${events.map(e => e.name).join(' + ')})`,
    };
  }

  const plusOne = plusOneState(row);
  if (plusOne === 'pending') {
    return { send: false, bucket: 'plus-one-undecided', reason: 'plus one requested but not yet decided' };
  }
  if (plusOne === 'approved' && eventsForPlusOne(row).length === 0) {
    return {
      send: false,
      bucket: 'plus-one-undecided',
      reason: 'plus one approved but plus_one_approved_for is not set',
    };
  }

  if (!isSendableEmail(row.email)) {
    return {
      send: false,
      bucket: 'no-email',
      reason: text(row.email) === null ? 'no email address on file' : `unusable address: ${text(row.email)}`,
    };
  }

  return { send: true };
}

const norm = (e) => String(e ?? '').trim().toLowerCase();

/**
 * Splits every row into recipients, exclusions and duplicates.
 *
 * Addresses are de-duplicated. Two rows sharing an address is a household
 * sharing an inbox, and sending the same letter to it twice looks careless —
 * the duplicate is reported rather than quietly dropped, because "why did we
 * only send 118 when 120 qualified" should be answerable from the run's own
 * output.
 */
export function selectForFinalDetails(rows) {
  const recipients = [];
  const excluded = [];
  const duplicates = [];
  const seen = new Map();

  for (const row of rows) {
    const verdict = classifyForFinalDetails(row);
    if (!verdict.send) {
      excluded.push({ row, ...verdict });
      continue;
    }

    const key = norm(row.email);
    if (seen.has(key)) {
      duplicates.push({ row, firstSeen: seen.get(key) });
      continue;
    }
    seen.set(key, row);
    recipients.push(row);
  }

  return { recipients, excluded, duplicates };
}

/** Counts by approved tier, for the pre-send report. */
export function tierBreakdown(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = eventsForGuest(row).map(e => e.name).join(' + ') || '—';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** How many recipients are invited to the ceremony, for the report. */
export function ceremonyCount(rows) {
  return rows.filter(r => eventsForGuest(r).some(e => e.key === 'JOINING')).length;
}
