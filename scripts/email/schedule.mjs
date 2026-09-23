/**
 * When a scheduled production send is delivered.
 *
 * ── What Resend does with this ─────────────────────────────────────────────
 * `scheduled_at` on POST /emails hands the message to Resend now and asks it
 * to deliver at that instant. The response is an id and nothing else: Resend
 * has ACCEPTED the message, not delivered it. Those are different facts and
 * the sender says so — see the reporting in prepare-final-details.mjs, which
 * never uses the word "sent" for a scheduled run.
 *
 * ── Why the timestamp is parsed here and not just passed through ───────────
 * Resend accepts natural language ("in 1 hour") as well as ISO 8601. That is
 * a convenience for a one-off and a hazard for 140 messages: "tomorrow" means
 * something different depending on when the run starts, and a typo in a
 * natural-language phrase is not an error, it is a different time. So this
 * takes ISO 8601 with an explicit offset, checks it, and prints it back in
 * both UTC and West Africa Time before anything is scheduled.
 *
 * ── The offset is not optional ─────────────────────────────────────────────
 * "2026-09-24T12:00:00" with no offset is interpreted in the timezone of
 * whatever machine happens to run the command. On a laptop in Lagos that is
 * noon; on a CI runner in UTC it is one o'clock in Lagos, an hour after the
 * ceremony guests were told to arrive. Requiring the offset makes that
 * impossible to get wrong silently, and the error says so.
 */

/** West Africa Time. No DST — Nigeria has never observed it. */
export const WAT_OFFSET_MINUTES = 60;

/** An ISO 8601 instant with an explicit Z or ±HH:MM. */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i;

/** The same instant, written in WAT, for a human to check. */
export function inWAT(date) {
  const shifted = new Date(date.getTime() + WAT_OFFSET_MINUTES * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
         `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())} WAT`;
}

/**
 * Validates a requested send time.
 *
 * Returns { iso, date, wat } — `iso` is what goes on the wire, normalised to
 * UTC so the record of what was scheduled cannot be read two ways.
 *
 * Throws, rather than warning, on anything ambiguous. A schedule that is
 * wrong by an hour is worse than one that refuses to be set.
 */
export function parseSchedule(input, { now = new Date() } = {}) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('--schedule needs a time, e.g. 2026-09-24T11:00:00Z');

  if (!ISO_WITH_OFFSET.test(raw)) {
    throw new Error(
      `--schedule must be ISO 8601 with an explicit offset, not "${raw}".\n` +
      '  2026-09-24T11:00:00Z        11:00 UTC, which is noon in Lagos\n' +
      '  2026-09-24T12:00:00+01:00   the same instant, written in WAT\n\n' +
      'Without an offset the time means whatever the machine running this\n' +
      'command thinks it means, and that is an hour out on a UTC server.');
  }

  const date = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) throw new Error(`--schedule is not a real time: ${raw}`);

  if (date.getTime() <= now.getTime()) {
    throw new Error(
      `--schedule is in the past: ${date.toISOString()} (it is now ${now.toISOString()}).\n` +
      'Resend would deliver immediately. If that is what you want, leave --schedule off.');
  }

  // Resend will not hold a message longer than 30 days.
  const days = (date.getTime() - now.getTime()) / 86_400_000;
  if (days > 30) {
    throw new Error(`--schedule is ${days.toFixed(1)} days out; Resend holds a message for at most 30.`);
  }

  return { iso: date.toISOString(), date, wat: inWAT(date) };
}
