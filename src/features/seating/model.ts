/**
 * Turning the source document into a layout, and the rules for changing one.
 *
 * Every mutation here is PURE: it takes a layout and returns a new one. That
 * is what makes undo/redo a list of snapshots rather than a pile of inverse
 * operations, and it is why the draft can be compared to the published
 * version to decide whether "unpublished changes" is true.
 */

import { SOURCE_TABLES } from './data/seatingSource';
import { initialRoundPositions, VIP_GEOM } from './hall';
import type { Layout, SeatEntry, SeatingTable, Side } from './types';
import { seatsFree, seatsUsed } from './types';

/** Builds the starting layout straight from the seating document. */
export function buildInitialLayout(): Layout {
  const tables: SeatingTable[] = [];

  for (const side of ['bride', 'groom'] as Side[]) {
    const rounds = SOURCE_TABLES
      .filter((t) => t.side === side && t.kind === 'round')
      .sort((a, b) => a.number - b.number);
    const spots = initialRoundPositions(side);

    const vip = SOURCE_TABLES.find((t) => t.side === side && t.kind === 'vip');
    if (vip) {
      const g = VIP_GEOM[side];
      tables.push({
        ...vip,
        x: g.x + g.w / 2,
        y: g.y + g.h / 2,
        movable: false,          // VIP tables are fixed. Always.
        entries: vip.entries.map((e) => ({ ...e })),
      });
    }

    rounds.forEach((t, i) => {
      const p = spots[i] ?? { x: 150, y: 1300 };
      tables.push({ ...t, x: p.x, y: p.y, movable: true,
                    entries: t.entries.map((e) => ({ ...e })) });
    });
  }

  return {
    version: 1,
    status: 'published',
    tables,
    updatedAt: new Date().toISOString(),
    label: 'Imported from the seating document',
  };
}

/* ── Mutations ──────────────────────────────────────────────────────────── */

const touch = (l: Layout, tables: SeatingTable[]): Layout =>
  ({ ...l, tables, updatedAt: new Date().toISOString() });

export function moveTable(l: Layout, tableId: string, x: number, y: number): Layout {
  return touch(l, l.tables.map((t) =>
    t.id === tableId && t.movable ? { ...t, x: Math.round(x), y: Math.round(y) } : t));
}

/**
 * Renames one entry.
 *
 * ── A blank name is not a rename, and not a deletion ───────────────────────
 * Returns the layout UNCHANGED — the same object reference — when the new
 * name is blank, whitespace only, or identical to the old one. That identity
 * is what the hook reads to decide there is nothing to record, so a planner
 * who clears a field by accident gets no undo step, no "unpublished changes",
 * no new updatedAt, and no version burned on the shared draft.
 *
 * It deliberately does not delete. Backspacing a name is far more often a
 * slip than an intention, and there is an explicit Remove for the times it is
 * meant. See removeEntry.
 */
export function renameEntry(l: Layout, entryId: string, name: string): Layout {
  const next = name.trim();
  if (!next) return l;

  const current = l.tables.flatMap((t) => t.entries).find((e) => e.id === entryId);
  if (!current || current.name === next) return l;

  return touch(l, l.tables.map((t) => ({
    ...t,
    entries: t.entries.map((e) =>
      e.id === entryId ? { ...e, name: next, renamed: true } : e),
  })));
}

export type MoveResult =
  | { ok: true; layout: Layout }
  | { ok: false; reason: string };

/**
 * An id for a guest added by hand.
 *
 * The imported rows are numbered per table ("bride-01-00"), which is fine for
 * a fixed list but not for one that is added to: remove the last row, add
 * another, and a highest-index-plus-one scheme hands out an id that a removed
 * guest already had — so an Undo could resurrect somebody into the wrong
 * identity. A random suffix cannot collide, and the table prefix keeps the id
 * readable in exported data.
 *
 * The id never changes afterwards, which is what lets rename, remove, move,
 * Undo, Save Draft and Publish all keep addressing the same person.
 */
function newEntryId(tableId: string): string {
  const rand = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    // randomUUID needs a secure context. Falling back keeps the planner
    // working on a plain-http preview rather than throwing mid-edit.
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${tableId}-add-${rand}`;
}

/**
 * Seats one more guest at a table.
 *
 * Refuses rather than overfills, and counts SEATS, not rows: a table of ten
 * holding a couple worth two seats and seven singles is full at nine entries,
 * and this says so. That is the same arithmetic moveEntry uses, for the same
 * reason — a chart that quietly seats eleven people at a table of ten is
 * discovered at the reception.
 */
export function addEntry(
  l: Layout, tableId: string, name: string, seats = 1,
): MoveResult {
  const table = l.tables.find((t) => t.id === tableId);
  if (!table) return { ok: false, reason: 'No such table' };

  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return { ok: false, reason: 'Give the guest a name.' };
  if (!Number.isInteger(seats) || seats < 1) {
    return { ok: false, reason: 'A guest needs at least one seat.' };
  }

  const free = seatsFree(table);
  if (seats > free) {
    return {
      ok: false,
      reason: free === 0
        ? `${tableName(table)} is full (${table.capacity}/${table.capacity})`
        : `${tableName(table)} has ${free} seat${free === 1 ? '' : 's'} free, and this needs ${seats}`,
    };
  }

  const entry: SeatEntry = {
    id: newEntryId(tableId),
    name: clean,
    seats,
    // Added by a planner, not read off the document: the seat count is
    // stated outright rather than inferred from a row of prose.
    provenance: 'stated',
    raw: clean,
  };

  return {
    ok: true,
    layout: touch(l, l.tables.map((t) =>
      t.id === tableId ? { ...t, entries: [...t.entries, entry] } : t)),
  };
}

/**
 * Takes an entry off the chart entirely.
 *
 * The seats it occupied return to the table for free, because seatsUsed()
 * counts the entries that are actually there — a 10/10 table reads 9/10 the
 * moment this returns, with no second tally to fall out of step.
 *
 * Undo is a whole-layout snapshot, so restoring a removed guest needs nothing
 * extra here.
 */
export function removeEntry(l: Layout, entryId: string): MoveResult {
  const from = l.tables.find((t) => t.entries.some((e) => e.id === entryId));
  if (!from) return { ok: false, reason: 'That guest is no longer seated' };

  return {
    ok: true,
    layout: touch(l, l.tables.map((t) =>
      t.id === from.id
        ? { ...t, entries: t.entries.filter((e) => e.id !== entryId) }
        : t)),
  };
}

/**
 * Moves one entry to another table.
 *
 * Refuses rather than truncates when the seats do not fit. A combined row
 * worth three seats cannot go into a table with two free, and silently
 * seating two of the three would be far worse than saying no — the brief is
 * explicit that capacity is never silently exceeded.
 */
export function moveEntry(l: Layout, entryId: string, toTableId: string): MoveResult {
  const from = l.tables.find((t) => t.entries.some((e) => e.id === entryId));
  const to = l.tables.find((t) => t.id === toTableId);
  if (!from) return { ok: false, reason: 'That guest is no longer seated' };
  if (!to) return { ok: false, reason: 'No such table' };
  if (from.id === to.id) return { ok: false, reason: 'Already at that table' };

  const entry = from.entries.find((e) => e.id === entryId)!;
  const free = to.capacity - seatsUsed(to);
  if (entry.seats > free) {
    return {
      ok: false,
      reason: free === 0
        ? `${tableName(to)} is full (${to.capacity}/${to.capacity})`
        : `${tableName(to)} has ${free} seat${free === 1 ? '' : 's'} free, and this entry needs ${entry.seats}`,
    };
  }

  return {
    ok: true,
    layout: touch(l, l.tables.map((t) => {
      if (t.id === from.id) return { ...t, entries: t.entries.filter((e) => e.id !== entryId) };
      if (t.id === to.id) return { ...t, entries: [...t.entries, entry] };
      return t;
    })),
  };
}

const tableName = (t: SeatingTable) =>
  t.kind === 'vip' ? `The ${t.side} VIP table` : `Table ${String(t.number).padStart(2, '0')}`;

/* ── Renumbering ────────────────────────────────────────────────────────── */

/**
 * Changing a table's DISPLAYED number.
 *
 * ── number is a label, id is the table ─────────────────────────────────────
 * `id` ("bride-07") is assigned once, at import, and never changes. Every
 * mutation in this file addresses tables by it: moveTable, moveEntry, the
 * draft/published fingerprint, the map's selection. `number` is only ever
 * read for display. So renumbering is genuinely just relabelling — guests,
 * position, capacity and identity are untouched, and there is no path by
 * which changing a number could move a person.
 *
 * One consequence worth knowing: after a renumber, the table whose id is
 * "bride-07" may display as Table 12. That is correct and intended — the id
 * is an opaque handle, not a claim about the number. It is only visible in
 * exported data, never to a planner or a guest.
 *
 * ── Why uniqueness is per SIDE, not global ─────────────────────────────────
 * The seating document numbers each side from 01 independently, so all
 * eleven numbers are already in use twice — once on the bride's side and
 * once on the groom's. A global rule would report all 22 tables as
 * conflicting the moment the page loaded. Within a side the numbers are
 * unique, and that is the rule enforced here. A collision with the OTHER
 * side is reported as a note rather than a block, because it is the existing
 * and intended state of the room.
 */
export type RenumberResult =
  | { ok: true; layout: Layout; note?: string }
  | { ok: false; reason: string; conflictId?: string; canSwap?: boolean };

export function renumberTable(l: Layout, tableId: string, next: number): RenumberResult {
  const table = l.tables.find((t) => t.id === tableId);
  if (!table) return { ok: false, reason: 'No such table' };

  // VIP slabs, the sweetheart table, the dance floor and the doors are not
  // numbered tables and must not start behaving like them.
  if (table.kind !== 'round') {
    return { ok: false, reason: 'Only the round tables are numbered.' };
  }

  if (!Number.isInteger(next) || next < 1 || next > 99) {
    return { ok: false, reason: 'Use a whole number between 1 and 99.' };
  }
  if (next === table.number) return { ok: true, layout: l };

  const clash = l.tables.find(
    (t) => t.kind === 'round' && t.side === table.side && t.id !== table.id && t.number === next,
  );
  if (clash) {
    return {
      ok: false,
      reason: `Table ${String(next).padStart(2, '0')} already exists on this side.`,
      conflictId: clash.id,
      canSwap: true,
    };
  }

  const otherSide = l.tables.find(
    (t) => t.kind === 'round' && t.side !== table.side && t.number === next,
  );

  return {
    ok: true,
    layout: touch(l, l.tables.map((t) => (t.id === tableId ? { ...t, number: next } : t))),
    note: otherSide
      ? `The ${otherSide.side === 'bride' ? "bride's" : "groom's"} side also has a Table `
        + `${String(next).padStart(2, '0')}. That was already true of every number here.`
      : undefined,
  };
}

/**
 * Exchanges two tables' displayed numbers and nothing else.
 *
 * Explicitly NOT a swap of the tables themselves. Positions, guests,
 * capacities and ids all stay exactly where they are; only the two labels
 * trade places. That is the whole point — a planner who has physically moved
 * a table wants the numbering to follow the room, not the room to follow the
 * numbering.
 */
export function swapTableNumbers(l: Layout, aId: string, bId: string): RenumberResult {
  const a = l.tables.find((t) => t.id === aId);
  const b = l.tables.find((t) => t.id === bId);
  if (!a || !b) return { ok: false, reason: 'No such table' };
  if (a.kind !== 'round' || b.kind !== 'round') {
    return { ok: false, reason: 'Only the round tables are numbered.' };
  }

  return {
    ok: true,
    layout: touch(l, l.tables.map((t) => {
      if (t.id === a.id) return { ...t, number: b.number };
      if (t.id === b.id) return { ...t, number: a.number };
      return t;
    })),
  };
}

/* ── Comparing draft to published ───────────────────────────────────────── */

/**
 * A stable fingerprint of everything a guest would notice.
 *
 * `number` is in here deliberately. It was missing, and that was a real bug:
 * a renumber-only edit left the draft looking identical to the published
 * layout, so "Draft — unpublished changes" never appeared, Publish stayed
 * disabled, and the new numbering could not be sent to guests at all.
 * A guest absolutely notices a table number.
 */
function fingerprint(l: Layout): string {
  return JSON.stringify(
    [...l.tables]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => [t.id, t.number, t.x, t.y, t.entries.map((e) => [e.id, e.name, e.seats])]),
  );
}

export const hasUnpublishedChanges = (draft: Layout, published: Layout): boolean =>
  fingerprint(draft) !== fingerprint(published);

/* ── Search ─────────────────────────────────────────────────────────────── */

export interface SearchHit {
  entryId: string;
  name: string;
  table: SeatingTable;
  /** Other entries at the same table, for the "with …" line. */
  companions: string[];
}

/**
 * Finds a guest by name.
 *
 * Matches on any WORD boundary, not just the start of the string, because
 * guests look themselves up by surname at least as often as by first name,
 * and several rows here lead with a title ("Pastor", "Mrs", "Dr").
 */
export function searchGuests(l: Layout, q: string, limit = 12): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];

  const hits: Array<SearchHit & { rank: number }> = [];
  for (const table of l.tables) {
    for (const e of table.entries) {
      const hay = e.name.toLowerCase();
      const at = hay.indexOf(needle);
      if (at === -1) continue;
      // Whole-name prefix beats word-start beats anywhere.
      const rank = at === 0 ? 0 : /\s|[+·]/.test(hay[at - 1] ?? '') ? 1 : 2;
      hits.push({
        rank, entryId: e.id, name: e.name, table,
        companions: table.entries.filter((o) => o.id !== e.id).map((o) => o.name),
      });
    }
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, limit);
}
