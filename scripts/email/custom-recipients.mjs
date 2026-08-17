/**
 * The one-off custom send list.
 *
 * Seven people who were not in the eligible guest list — no RSVP row, or one
 * that would not have selected them — but who are invited to the whole day.
 *
 * These are NOT guests in the database sense. Nothing here is read from or
 * written to `rsvps`; the rows below are constructed in memory purely to feed
 * the template, and are discarded when the process exits.
 */

/** Everyone on this list gets the whole day, and a guest. */
const WHOLE_DAY = 'JOINING';

export const CUSTOM_RECIPIENTS = [
  { name: 'Olakunle', email: 'kunlekarunwi6@gmail.com' },
  { name: 'Toyin',    email: 'oluwatoyintayo9@gmail.com' },
  { name: 'Shammah',  email: 'Shammahkarunwi6@gmail.com' },
  { name: 'Shalom',   email: 'karunwishalom@gmail.com' },
  { name: 'Fifunmi',  email: 'kevelin4@gmail.com' },
  { name: 'Ini',      email: 'joel.karunwini@gmail.com' },
  { name: 'Princess', email: 'princessiman.sado@gmail.com' },
];

/**
 * Builds the in-memory row the template expects.
 *
 * Shaped exactly like an `rsvps` row so the template, the tier logic and the
 * plus-one logic all behave identically to a normal send — but it never
 * touches the table, and `id` is deliberately not a uuid so it could not be
 * mistaken for one if it ever leaked into a query.
 *
 * `plus_one_name` is null on purpose: the template then reads "your guest"
 * rather than naming anyone, which is what was asked for.
 */
export function toRow({ name, email }) {
  return {
    id: `custom:${email.toLowerCase()}`,
    full_name: name,
    email,

    // Whole day, for the guest and for their plus one. Set independently, as
    // the two are separate columns everywhere else in this codebase.
    main_invite_status:    'APPROVED',
    approved_for:          WHOLE_DAY,
    attending:             true,
    plus_one_requested:    true,
    plus_one_status:       'APPROVED',
    plus_one_approved_for: WHOLE_DAY,
    plus_one_name:         null,

    // Present so nothing reads `undefined`, and so it is obvious at a glance
    // that this row carries no delivery history of its own.
    email_status:    null,
    last_email_sent: null,
  };
}
