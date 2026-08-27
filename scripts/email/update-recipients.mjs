/**
 * Who receives a general wedding update.
 *
 * DELIBERATELY NOT recipients.mjs. The confirmation pack answered "who has
 * RSVP'd and needs their invitation confirmed"; this answers a different and
 * much wider question: "who is invited and can be reached". Reusing classify()
 * here would silently apply three rules that must not apply — see below — so
 * the rule is written out once, in full, rather than borrowed and patched.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 * Include a guest when ALL of:
 *
 *   · main_invite_status is APPROVED
 *   · they are approved for at least one event
 *   · they have a usable email address
 *
 * And nothing else. In particular this does NOT look at:
 *
 *   attending / RSVP        an update is news, not a confirmation. Someone who
 *                           has not replied yet still needs to know where to
 *                           stay, and arguably needs it most.
 *   email_status            this is a new campaign. Having received the
 *                           confirmation pack is not a reason to be skipped —
 *                           it is a reason to expect this one.
 *   plus-one state          a plus one is not a recipient. They have no row and
 *                           no address of their own; they hear about it from
 *                           the guest who is bringing them. A plus one who DOES
 *                           have their own row is picked up by that row on its
 *                           own merits, like anyone else.
 *
 * ── Excluded, and why it is worth naming ───────────────────────────────────
 * Every exclusion is reported rather than silently dropped. An audit that only
 * lists who is in cannot be checked; one that accounts for every row can.
 */

import { APPROVED } from './config.mjs';
import { eventsForGuest } from './events.mjs';
import { isSendableEmail } from './recipients.mjs';

const text = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Verdict for one row: `{ send: true }`, or `{ send: false, reason, bucket }`.
 *
 * `bucket` groups the exclusions for reporting: 'not-approved', 'no-tier',
 * 'no-email'. The order of the checks below is the order of the report, and is
 * chosen so each guest lands in the most specific bucket that explains them.
 */
export function classifyForUpdate(row) {
  const status = text(row.main_invite_status);

  if (status === null) {
    return { send: false, bucket: 'not-approved', reason: 'invitation still pending — no decision recorded' };
  }
  if (status.toUpperCase() !== APPROVED) {
    return { send: false, bucket: 'not-approved', reason: `not approved (${status})` };
  }

  // Approved, but approved to nothing. There is no wedding to update them
  // about, and the email names the events they are coming to.
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
 * Splits every row into recipients and exclusions.
 *
 * Addresses are de-duplicated. Two rows sharing an address is a household
 * sharing an inbox, and sending the same update to it twice looks careless —
 * the duplicate is reported so it can be seen rather than quietly dropped.
 */
export function selectForUpdate(rows) {
  const recipients = [];
  const excluded = [];
  const duplicates = [];
  const seen = new Map();

  for (const row of rows) {
    const verdict = classifyForUpdate(row);
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
