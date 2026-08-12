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
    // The key stays JOINING — it is what the planning sheet writes into
    // approved_for, and renaming it would orphan every existing row. Only the
    // guest-facing name changed.
    key:   'JOINING',
    name:  'Wedding Service',
    time:  '12:00 PM',
    hero:  'joining',
    blurb: 'The service, where we say our vows.',
  },
  RECEPTION: {
    key:   'RECEPTION',
    name:  'Wedding Reception',
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
 * The tiers are nested, not parallel — each one is a superset of those below:
 *
 *   JOINING     The whole day. Confirmed by the couple: a ceremony guest is
 *               welcome at the reception (the Joining artwork itself prints
 *               "Reception to follow") and at the after party.
 *   RECEPTION   Reception only. The brief's own example — "someone invited
 *               only to Reception should never even know there is an After
 *               Party" — only makes sense if this tier excludes it.
 *   AFTERPARTY  The After Party alone.
 *
 * Nesting downward but not upward is the point: the widest tier sees
 * everything, and a narrower one must never learn what it is missing.
 */
export const TIER_EVENTS = {
  JOINING:    ['JOINING', 'RECEPTION', 'AFTERPARTY'],
  RECEPTION:  ['RECEPTION'],
  AFTERPARTY: ['AFTERPARTY'],
};

/** Normalises one spelling of a tier. Returns null if unrecognised. */
export function normaliseTier(value) {
  if (value === null || value === undefined) return null;
  const t = String(value).trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (t === '') return null;
  if (t === 'AFTERPARTY')  return 'AFTERPARTY';
  if (t === 'CEREMONY')    return 'JOINING';
  if (t === 'SERVICE' || t === 'WEDDINGSERVICE') return 'JOINING';
  if (t === 'WEDDINGRECEPTION') return 'RECEPTION';
  return ['JOINING', 'RECEPTION'].includes(t) ? t : null;
}

/**
 * Parses approved_for into every tier it names.
 *
 * A guest is not always one tier. "Reception and After Party" is a real
 * combination — they come to lunch and stay for the dancing, but not the
 * service — and one cell has to be able to say so without a schema change.
 *
 * Accepts a comma, a plus, an ampersand, a slash or the word "and":
 *   "RECEPTION"                    → ['RECEPTION']
 *   "Reception + After Party"      → ['RECEPTION', 'AFTERPARTY']
 *   "reception and after party"    → ['RECEPTION', 'AFTERPARTY']
 *
 * Unrecognised fragments are dropped rather than failing the whole cell, so a
 * stray note in the column cannot silently strip a guest of a real tier. If
 * NOTHING parses, the result is empty and the guest is held back — see
 * classify() in recipients.mjs.
 */
export function parseTiers(value) {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(/\s*(?:,|\+|&|\/|\band\b)\s*/i)
    .map(normaliseTier)
    .filter((t, i, all) => t !== null && all.indexOf(t) === i);
}

/**
 * The events one guest is invited to, in running order.
 *
 * The union of every tier named, so a combination widens the list rather than
 * one value winning. An absent or wholly unrecognised tier yields [] — the
 * guest is then not emailable, because a confirmation pack listing no events
 * says nothing.
 *
 * Everything guest-facing reads from this: the badges, the schedule timeline,
 * the hero artwork and the plain text. There is no second list anywhere, which
 * is what makes "a guest never sees an event they are not invited to" a
 * property of the code rather than a thing to remember.
 */
export function eventsForGuest(row) {
  const tiers = parseTiers(row.approved_for);
  if (!tiers.length) return [];

  const keys = new Set(tiers.flatMap(t => TIER_EVENTS[t] ?? []));
  return EVENT_ORDER.filter(k => keys.has(k)).map(k => EVENTS[k]);
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
