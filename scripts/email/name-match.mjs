/**
 * Matching a seated name to an RSVP invitation.
 *
 * ── Why this is not just string equality ───────────────────────────────────
 * The two lists were typed by different people for different purposes. The
 * seating plan names a party at a table — "Mr Olakunle Karunwi +5", "Michael
 * Coker + Nicole Coker", "Oluwatoyin Karunwi (Mother)". The RSVP row names one
 * invitee. Exact matching reported most of the family as unseated, which was
 * wrong about the wedding rather than careful about the data.
 *
 * ── Tiers, strongest first ─────────────────────────────────────────────────
 *   exact       identical after normalisation
 *   reordered   same words, different order      Abadi Emmanuel ↔ Emmanuel Abadi
 *   subset      one is the other plus a middle   Emediong Uko ↔ Emediong Emily Uko
 *   typo        one token exact, one misspelled  Kelechi Ayinkude ↔ Kelechi Anyikude
 *
 * A tier is only used when EXACTLY ONE RSVP row qualifies at it. Two
 * candidates at the same tier is ambiguity, and ambiguity is reported, never
 * resolved. Tiers are tried in order and the first that yields a unique row
 * wins, so a real exact match is never beaten by a speculative one.
 *
 * ── Why the typo tier is narrow, and how it was calibrated ─────────────────
 * Edit distance alone is not safe here. Measured on the real data:
 *
 *     kelechi ayinkude  ↔ kelechi anyikude   distance 2   SHOULD match
 *     toluwanimi adesiya ↔ toluwanimi adesiyan distance 1  SHOULD match
 *     ada obi           ↔ ade obi            distance 1   MUST NOT match
 *     john smith        ↔ joan smith          distance 1   MUST NOT match
 *     chidi eze         ↔ chidi eke           distance 1   MUST NOT match
 *
 * A threshold cannot separate those — the good and bad pairs overlap
 * completely. What separates them is WHERE the difference falls. In every
 * genuine case one whole name survives intact and the misspelling is in a
 * long word; in every dangerous case the difference is a whole short name.
 *
 * So the typo tier requires all of: the same number of words, at least one
 * word identical, exactly one word differing, that word at least 6 characters
 * long, and a Damerau-Levenshtein distance of at most 2. "Ade" and "Ada" are
 * three letters and are refused for that reason alone.
 *
 * ── Combined entries ───────────────────────────────────────────────────────
 * "Michael Coker + Nicole Coker" is split on +, &, / and the word "and", and
 * each part is matched on its own. One entry can therefore confirm two
 * invitations, and a part with no RSVP row of its own — a spouse who was never
 * invited separately — simply finds nothing, without invalidating the part
 * that did match. The "+5" seat suffix is removed BEFORE splitting, or it
 * would become a part called "5".
 */

/** Honorifics that carry no identity. Stripped only as whole leading words. */
const TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mister', 'master',
  'dr', 'doctor', 'prof', 'professor',
  'pastor', 'ps', 'rev', 'revd', 'reverend', 'bishop', 'apostle', 'evang',
  'evangelist', 'deacon', 'deaconess', 'elder', 'minister',
  'chief', 'otunba', 'alhaji', 'alhaja', 'mallam', 'hon', 'honourable',
  'sir', 'lady', 'madam', 'engr', 'engineer', 'arc', 'architect',
  'barr', 'barrister', 'amb', 'ambassador', 'capt', 'captain', 'gen',
]);

/**
 * Down to comparable words.
 *
 * Removes, in this order: parenthetical labels — "(Mother)", "(Brother)" —
 * then a trailing "+N" seat count, then punctuation, then leading titles.
 * Hyphens become spaces so "Victory-Usoro" is two words either way.
 */
export function words(name) {
  const cleaned = String(name ?? '')
    .replace(/\([^)]*\)/g, ' ')          // (Father), (Mother)
    .replace(/\s*\+\s*\d+\s*$/, ' ')     // +5, +2   — BEFORE splitting on +
    .replace(/[-–—_]/g, ' ')
    .replace(/[.,;:'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const parts = cleaned.split(' ').filter(Boolean);
  // Titles only count at the front. "Chief" as a surname stays.
  let i = 0;
  while (i < parts.length - 1 && TITLES.has(parts[i])) i++;
  return parts.slice(i);
}

export const normalise = (name) => words(name).join(' ');

/**
 * One seating entry, split into the people it names.
 *
 * Comma is deliberately NOT a separator: "Obi, Ada" is one person written
 * surname-first far more often than it is two people.
 */
export function splitParty(name) {
  const withoutSeats = String(name ?? '').replace(/\s*\+\s*\d+\s*$/, ' ');
  return withoutSeats
    .split(/\s*(?:\+|&|\/|\band\b)\s*/i)
    .map(s => s.trim())
    .filter(s => words(s).length > 0);
}

/* ── Distance ────────────────────────────────────────────────────────────── */

/** Damerau-Levenshtein, so a transposition counts as one edit. */
export function distance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** The shortest word we will consider misspelled. See the header. */
export const MIN_TYPO_WORD = 6;
export const MAX_TYPO_DISTANCE = 2;

/* ── The tiers ───────────────────────────────────────────────────────────── */

const sorted = (w) => [...w].sort().join(' ');

const isSubset = (small, large) => {
  const pool = [...large];
  for (const t of small) {
    const i = pool.indexOf(t);
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return true;
};

export function tierOf(seatedWords, rsvpWords) {
  if (!seatedWords.length || !rsvpWords.length) return null;

  if (seatedWords.join(' ') === rsvpWords.join(' ')) return 'exact';

  if (seatedWords.length === rsvpWords.length
      && sorted(seatedWords) === sorted(rsvpWords)) return 'reordered';

  // A middle name on one side only. Both sides must still carry at least two
  // words, or "Emmanuel" would swallow "Emmanuel Abadi".
  const [small, large] = seatedWords.length <= rsvpWords.length
    ? [seatedWords, rsvpWords] : [rsvpWords, seatedWords];
  if (small.length >= 2 && isSubset(small, large)) return 'subset';

  // One word misspelled, the rest intact.
  if (seatedWords.length === rsvpWords.length) {
    const differing = [];
    let identical = 0;
    for (let i = 0; i < seatedWords.length; i++) {
      if (seatedWords[i] === rsvpWords[i]) identical++;
      else differing.push([seatedWords[i], rsvpWords[i]]);
    }
    if (identical >= 1 && differing.length === 1) {
      const [a, b] = differing[0];
      if (Math.min(a.length, b.length) >= MIN_TYPO_WORD
          && distance(a, b) <= MAX_TYPO_DISTANCE) return 'typo';
    }
  }

  return null;
}

export const TIERS = ['exact', 'reordered', 'subset', 'typo'];

/**
 * Finds the RSVP row for one seated name.
 *
 * Returns { row, tier, part } on a unique match, { ambiguous, tier, rows,
 * part } when a tier has more than one candidate, or null when nothing
 * qualifies at any tier.
 *
 * `index` is a prepared array of { row, words } so this is not re-normalising
 * the whole RSVP table for every seat.
 */
export function matchOne(seatedName, index) {
  const parts = splitParty(seatedName);
  const results = [];
  let ambiguity = null;

  for (const part of parts) {
    const pw = words(part);
    for (const tier of TIERS) {
      const hits = index.filter(e => tierOf(pw, e.words) === tier);
      if (hits.length === 1) { results.push({ row: hits[0].row, tier, part }); break; }
      if (hits.length > 1) {
        // Record it, but keep looking: a weaker tier cannot rescue this part,
        // so stop here for this part and report the ambiguity.
        ambiguity ??= { ambiguous: true, tier, rows: hits.map(h => h.row), part };
        break;
      }
    }
  }

  if (results.length) return { matches: results, ambiguity: null };
  if (ambiguity) return { matches: [], ambiguity };
  return { matches: [], ambiguity: null };
}

/** Prepares the RSVP table once. */
export const buildIndex = (rows) =>
  rows.map(row => ({ row, words: words(row.full_name) }));
