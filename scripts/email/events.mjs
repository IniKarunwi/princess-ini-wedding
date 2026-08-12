/**
 * Which parts of the wedding each guest is invited to — pure, no I/O.
 *
 * This is the most consequential file in the pack. The brief is explicit:
 * a guest invited only to the Reception must never learn that an After Party
 * exists. So "not invited" here does not mean "shown as unavailable" — it
 * means the section is not rendered at all.
 */

/** The three parts of the day, in the order they happen. */
export const EVENTS = {
  JOINING: {
    key:   'JOINING',
    name:  'Joining Ceremony',
    time:  '12:00 PM',
    hero:  'joining',
    blurb: 'The ceremony, where we say our vows.',
  },
  RECEPTION: {
    key:   'RECEPTION',
    name:  'Reception',
    time:  '2:00 PM',
    hero:  'reception',
    blurb: 'Lunch, speeches and celebration.',
  },
  AFTERPARTY: {
    key:   'AFTERPARTY',
    name:  'After Party',
    time:  '6:00 PM',
    hero:  'after-party',
    blurb: 'Dancing, into the night.',
  },
};

export const EVENT_ORDER = ['JOINING', 'RECEPTION', 'AFTERPARTY'];

/**
 * Tier → the events that tier is invited to.
 *
 * ── CHECK THIS BEFORE THE FIRST SEND ──────────────────────────────────────
 * Everything downstream reads from this one object, so correcting it is a
 * one-line change here and nowhere else.
 *
 * The reasoning behind the current values:
 *
 *   JOINING     The Joining artwork itself prints "Reception to follow", so a
 *               ceremony guest is plainly also a reception guest.
 *   RECEPTION   Reception only. The brief's own example — "someone invited
 *               only to Reception should never even know there is an After
 *               Party" — only makes sense if this tier excludes it.
 *   AFTERPARTY  The After Party alone.
 *
 * If ceremony guests are in fact also welcome at the After Party, add
 * 'AFTERPARTY' to the JOINING array and nothing else changes.
 */
export const TIER_EVENTS = {
  JOINING:    ['JOINING', 'RECEPTION'],
  RECEPTION:  ['RECEPTION'],
  AFTERPARTY: ['AFTERPARTY'],
};

/** Normalises the sheet's spelling of a tier. */
export function normaliseTier(value) {
  if (value === null || value === undefined) return null;
  const t = String(value).trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (t === '') return null;
  if (t === 'AFTERPARTY') return 'AFTERPARTY';
  if (t === 'CEREMONY')   return 'JOINING';
  return ['JOINING', 'RECEPTION'].includes(t) ? t : null;
}

/**
 * The events one guest is invited to, in running order.
 * An unrecognised or absent tier yields [] — the guest is then not emailable,
 * because a confirmation pack with no events in it says nothing.
 */
export function eventsForGuest(row) {
  const tier = normaliseTier(row.approved_for);
  if (!tier) return [];
  const keys = TIER_EVENTS[tier] ?? [];
  return EVENT_ORDER.filter(k => keys.includes(k)).map(k => EVENTS[k]);
}

/**
 * Which artwork heads the email.
 *
 * The earliest event the guest is invited to, because that is the one that
 * defines their day: a ceremony guest should open on the ceremony painting,
 * an after-party guest on the dance floor.
 */
export function heroFor(events) {
  return events.length ? events[0].hero : null;
}

/** Whole days from today until the wedding. Never negative. */
export function daysUntil(weddingDate, now = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const target = Date.UTC(weddingDate.getUTCFullYear(), weddingDate.getUTCMonth(), weddingDate.getUTCDate());
  const today  = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((target - today) / day));
}

/**
 * Plus-one state, as the email needs to express it.
 *
 *   none      never asked for one — say nothing at all
 *   approved  confirmed, celebrate it
 *   declined  warmly explained
 *   pending   nobody has decided yet
 *
 * `pending` is deliberately distinct from `declined`. Telling a guest their
 * plus one is not accommodated when the couple has not actually decided is a
 * mistake that cannot be walked back, so the sender holds those guests until
 * the decision is made rather than guessing.
 */
export function plusOneState(row) {
  const requested = row.plus_one_requested === true;
  const raw = row.plus_one_status === null || row.plus_one_status === undefined
    ? '' : String(row.plus_one_status).trim().toUpperCase();

  if (['APPROVED', 'ACCEPTED', 'CONFIRMED', 'YES'].includes(raw)) return 'approved';
  if (['REJECTED', 'DECLINED', 'NO'].includes(raw))               return 'declined';
  if (!requested) return 'none';
  return 'pending';
}
