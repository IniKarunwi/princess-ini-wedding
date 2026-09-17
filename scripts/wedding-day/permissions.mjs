/**
 * getGuestPermissions — the one place anything asks "may this guest come in?"
 *
 * ── Why this is a wrapper and not an implementation ────────────────────────
 * The hierarchy was already built, tested and shipped in scripts/email/
 * events.mjs, which decides what 136 delivered emails showed each guest. It
 * already returns JOINING -> all three. Writing a second copy here would give
 * the project two answers to the same question, and the day one of them drifts
 * a whole-day guest gets turned away at the reception door.
 *
 * So this adapts the existing logic to the shape the wedding-day code wants.
 * There is a third copy in SQL — guest_has_access() in 0007 — which exists
 * only because the check-in RPC has to enforce the rule inside a transaction
 * and cannot call JavaScript. supabase/tests/wedding_day.sql asserts the SQL
 * copy against the same cases, and selftest.mjs asserts this one, so a drift
 * between them fails a test rather than a guest.
 *
 * ── The column that does not exist ─────────────────────────────────────────
 * The brief describes a column called `main` holding JOINING / RECEPTION /
 * AFTER PARTY / REJECTED. There is no such column. The sync splits the
 * spreadsheet's `main` into two:
 *
 *   main_invite_status   APPROVED | REJECTED | PENDING
 *   approved_for         JOINING | RECEPTION | AFTERPARTY
 *
 * Both are read here. A row is admitted only when the status is APPROVED —
 * a tier alone is not permission.
 */

import { eventsForGuest } from '../email/events.mjs';
import { APPROVED } from '../email/config.mjs';

/** The three parts of the day, in the order they happen. */
export const EVENT_KEYS = ['JOINING', 'RECEPTION', 'AFTERPARTY'];

/** Human labels, for admin screens and scanner output. */
export const EVENT_LABEL = {
  JOINING:    'Wedding Service',
  RECEPTION:  'Wedding Reception',
  AFTERPARTY: 'After Party',
};

const text = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Which parts of the day a guest may attend.
 *
 *   getGuestPermissions(row)
 *   -> { joining: bool, reception: bool, afterParty: bool }
 *
 * JOINING always returns true for all three. An unapproved or undecided
 * invitation returns false for all three, whatever `approved_for` says —
 * a tier on a pending row is a proposal, not an admission.
 */
export function getGuestPermissions(row) {
  const status = text(row?.main_invite_status);
  if (status === null || status.toUpperCase() !== APPROVED) {
    return { joining: false, reception: false, afterParty: false };
  }

  const keys = new Set(eventsForGuest(row).map(e => e.key));
  return {
    joining:    keys.has('JOINING'),
    reception:  keys.has('RECEPTION'),
    afterParty: keys.has('AFTERPARTY'),
  };
}

/** The same answer as a list of event keys, for iterating. */
export function permittedEvents(row) {
  const p = getGuestPermissions(row);
  return EVENT_KEYS.filter(k =>
    (k === 'JOINING' && p.joining) ||
    (k === 'RECEPTION' && p.reception) ||
    (k === 'AFTERPARTY' && p.afterParty));
}

/** True when the guest may attend at least one part of the day. */
export function isApproved(row) {
  return permittedEvents(row).length > 0;
}

/**
 * Whether a guest should hold a pass.
 *
 * Approved for at least one event. Deliberately NOT filtered on `attending`:
 * a guest can be approved and simply never have replied, and turning them away
 * at the door because of an unreturned RSVP is the wrong failure. The couple
 * approved them; the door lets them in.
 */
export function shouldHavePass(row) {
  return isApproved(row);
}

/**
 * The admission size — how many people this invitation admits.
 *
 * Reads party_size, which 0007 adds. Falls back to guest_count for a database
 * where 0007 has not run yet, so this module still answers sensibly rather
 * than throwing. guest_count is capped at 2 by its trigger, so the fallback
 * under-reports large parties — which is exactly why party_size exists.
 */
export function partySize(row) {
  const p = row?.party_size;
  if (Number.isInteger(p) && p >= 0) return p;
  const g = row?.guest_count;
  return Number.isInteger(g) && g >= 0 ? g : 0;
}
