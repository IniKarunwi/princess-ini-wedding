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
import type { Layout, SeatingTable, Side } from './types';
import { seatsUsed } from './types';

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

export function renameEntry(l: Layout, entryId: string, name: string): Layout {
  return touch(l, l.tables.map((t) => ({
    ...t,
    entries: t.entries.map((e) =>
      e.id === entryId ? { ...e, name: name.trim() || e.name, renamed: true } : e),
  })));
}

export type MoveResult =
  | { ok: true; layout: Layout }
  | { ok: false; reason: string };

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

/* ── Comparing draft to published ───────────────────────────────────────── */

/** A stable fingerprint of everything a guest would notice. */
function fingerprint(l: Layout): string {
  return JSON.stringify(
    [...l.tables]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => [t.id, t.x, t.y, t.entries.map((e) => [e.id, e.name, e.seats])]),
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
