"""Emit src/features/seating/data/seatingSource.ts from seating.json."""
import json, re

d = json.load(open('seating.json'))
sides = d['sides']

def q(s):  # TS single-quoted string literal
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"

out = []
w = out.append

w("""/**
 * The seating plan, exactly as supplied.
 *
 * ── Generated, not typed ───────────────────────────────────────────────────
 * Produced from the seating document by scripts/seating/extract.py. 219 rows
 * copied by hand would be 219 chances to misspell a guest's name and no way to
 * catch it. Regenerate rather than edit by hand when a new document arrives.
 *
 * ── An entry is not a person ───────────────────────────────────────────────
 * The document is full of combined rows — "Pastor Wale Adeniyi + Mrs Remi
 * Adeniyi - 2 seats", "OCC Worship + 3 - 4 seats", "1 unnamed guest(s) of
 * Shammah Karunwi". The brief is explicit that these are preserved as given
 * and not split or reinterpreted, so an entry carries a `seats` count and
 * every capacity figure in this feature is measured in SEATS, never in rows.
 *
 * ── Provenance of `seats` ──────────────────────────────────────────────────
 *   'stated'   the document said "- N seats" outright
 *   'single'   an ordinary one-person row
 *   'inferred' the row named several people with no count, AND the table's
 *              arithmetic closed exactly when they were counted — recorded
 *              here so the inference is visible rather than silent
 *
 * Rows flagged `ambiguous` name more than one person but sit in a table that
 * already balances at one seat. They are NOT split. See SOURCE_FLAGS.
 */

export type SeatProvenance = 'stated' | 'single' | 'inferred';

export interface SourceEntry {
  /** Stable id: side-table-index. Survives renames and reseating. */
  id: string;
  /** The name as printed, minus any "- N seats" suffix. Editable by admins. */
  name: string;
  /** Seats consumed. Not necessarily 1. */
  seats: number;
  provenance: SeatProvenance;
  /** Names several people but was left at one seat — needs a human ruling. */
  ambiguous?: boolean;
  /** The untouched source row, kept so nothing is ever lost. */
  raw: string;
}

export interface SourceTable {
  id: string;
  side: 'bride' | 'groom';
  kind: 'round' | 'vip';
  /** 0 for the VIP tables, which the document numbers separately. */
  number: number;
  /** e.g. "Bridesmaid", "OCC table". May be empty. */
  title: string;
  /** The caption under the heading, e.g. "Family (3) · Friend (7)". */
  group: string;
  capacity: number;
  entries: SourceEntry[];
}
""")

w("/** A note printed on the document itself. Shown to admins, not to guests. */")
w("export const SOURCE_NOTE =")
w("  " + q("Working chart — Pastor Femi + guest, Stephanie Itimi and Engr Titus Illori "
           "excluded; no-event entries held; both sides provisional.") + ";")
w("")

w("export const SOURCE_TABLES: SourceTable[] = [")
for side in sides:
    for t in side['tables']:
        tid = f"{side['key']}-{'vip' if t['kind']=='vip' else '%02d' % t['number']}"
        w(f"  {{")
        w(f"    id: {q(tid)}, side: {q(side['key'])}, kind: {q(t['kind'])},")
        w(f"    number: {t['number']}, title: {q(t['title'])}, group: {q(t['group'])},")
        w(f"    capacity: {t['capacity']},")
        w(f"    entries: [")
        for i, e in enumerate(t['entries']):
            prov = 'inferred' if e.get('inferred') else ('stated' if e['explicit'] else 'single')
            amb = ' ambiguous: true,' if e.get('ambiguous') else ''
            eid = f"{tid}-{i:02d}"
            w(f"      {{ id: {q(eid)}, name: {q(e['name'])}, seats: {e['seats']}, "
              f"provenance: {q(prov)},{amb} raw: {q(e['raw'])} }},")
        w(f"    ],")
        w(f"  }},")
w("];")
w("")

w("/**")
w(" * Everything the source left unclear. Surfaced in the admin panel rather")
w(" * than resolved, because guessing a guest's seat is worse than saying so.")
w(" */")
w("export const SOURCE_FLAGS: string[] = [")
for f in d['flags']:
    w(f"  {q(f)},")
for n in d['notes']:
    w(f"  {q(n)},")
w("];")
w("")

tot_seats = sum(sum(e['seats'] for e in t['entries']) for s in sides for t in s['tables'])
tot_entries = sum(len(t['entries']) for s in sides for t in s['tables'])
tot_tables = sum(len(s['tables']) for s in sides)
tot_cap = sum(t['capacity'] for s in sides for t in s['tables'])
w("/** Totals, computed at generation time and asserted by the test suite. */")
w("export const SOURCE_TOTALS = {")
w(f"  tables: {tot_tables},")
w(f"  entries: {tot_entries},")
w(f"  seatsAssigned: {tot_seats},")
w(f"  seatsAvailable: {tot_cap},")
w("} as const;")

open('seatingSource.ts', 'w').write('\n'.join(out) + '\n')
print('tables', tot_tables, 'entries', tot_entries, 'seats', tot_seats, '/', tot_cap)
