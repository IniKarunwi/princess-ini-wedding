/**
 * What the server will accept as a seating layout.
 *
 * The browser is not trusted to send something sane, even behind the PIN.
 * Without this, a bug in the client — or a planner's stale tab — could write
 * `{}` over the shared draft and take the room out for everybody, and the
 * error would only appear the next time somebody opened the chart.
 *
 * This checks SHAPE, not seating policy. Capacity, placement legality and
 * table numbering are enforced in src/features/seating/model.ts, where the
 * rules live and where a planner can be told why an edit was refused. Copying
 * them here would mean two definitions of legal, which is worse than one.
 *
 * The two things that ARE enforced beyond shape are the two that would be
 * silent and irreversible: the room may not arrive empty, and no two tables
 * may share an id.
 */

export interface StoredLayout {
  tables: unknown[];
  updatedAt: string;
  label?: string;
}

export type Check = { ok: true; payload: StoredLayout } | { ok: false; reason: string };

const isTable = (t: any): boolean =>
  t && typeof t === 'object'
  && typeof t.id === 'string' && t.id.length > 0
  && (t.side === 'bride' || t.side === 'groom')
  && (t.kind === 'round' || t.kind === 'vip')
  && Number.isFinite(t.number) && Number.isFinite(t.x) && Number.isFinite(t.y)
  && Number.isFinite(t.capacity)
  && Array.isArray(t.entries)
  && t.entries.every((e: any) =>
    e && typeof e === 'object'
    && typeof e.id === 'string' && e.id.length > 0
    // A blank or whitespace-only name is refused at the boundary, not just in
    // the client. Such an entry would still hold its seats while being
    // unfindable in Find My Seat — a guest with a chair and no way to be told
    // where it is. Removing somebody is an explicit action, and it deletes
    // the entry rather than emptying it.
    && typeof e.name === 'string' && e.name.trim().length > 0
    && Number.isInteger(e.seats) && e.seats >= 0);

export function checkLayout(raw: unknown): Check {
  const l = raw as any;
  if (!l || typeof l !== 'object') return { ok: false, reason: 'payload must be an object' };
  if (!Array.isArray(l.tables)) return { ok: false, reason: 'payload.tables must be an array' };
  if (l.tables.length === 0) return { ok: false, reason: 'refusing to save a layout with no tables' };
  if (l.tables.length > 200) return { ok: false, reason: 'too many tables' };

  const bad = l.tables.findIndex((t: any) => !isTable(t));
  if (bad !== -1) return { ok: false, reason: `table ${bad} is malformed` };

  const ids = new Set(l.tables.map((t: any) => t.id));
  if (ids.size !== l.tables.length) return { ok: false, reason: 'two tables share an id' };

  return {
    ok: true,
    payload: {
      // Rebuilt rather than passed through, so nothing else rides along into
      // the database: version and status belong to the row's columns.
      tables: l.tables,
      updatedAt: typeof l.updatedAt === 'string' ? l.updatedAt : new Date().toISOString(),
      ...(typeof l.label === 'string' ? { label: l.label } : {}),
    },
  };
}

/**
 * The public map's view of a layout: the room, with nobody's name in it.
 *
 * ── Why this is done here and not in CSS ────────────────────────────────────
 * Hiding names in the browser would still send all 219 of them to every phone
 * that opens the page — one devtools panel away from the whole guest list,
 * and cached in every proxy on the way. The only way a name is private is if
 * it never leaves the server, so the stripping happens before the response is
 * written and there is no code path by which the public endpoint could return
 * an entry.
 *
 * What the map genuinely needs is geometry: where each table is, how big it
 * is, and what number it shows. `seated` is kept because the map draws
 * occupied seats differently — it is a count, not a person, and a guest can
 * see the same thing by looking at the room.
 */
export function publicView(payload: unknown) {
  const l = payload as any;
  return {
    ...l,
    tables: (l?.tables ?? []).map((t: any) => ({
      id: t.id,
      side: t.side,
      kind: t.kind,
      number: t.number,
      capacity: t.capacity,
      x: t.x,
      y: t.y,
      movable: false,
      // A count of filled seats, so the map still reads correctly.
      seated: (t.entries ?? []).reduce((n: number, e: any) => n + (e.seats ?? 0), 0),
      entries: [],
    })),
  };
}

/** Assembles the API's view of a row: the payload plus its authoritative columns. */
export const rowToLayout = (row: {
  status: string; version: number; payload: unknown;
  updated_at: string; updated_by: string | null;
}) => ({
  // Payload first: the columns are authoritative and must win, or a stale
  // `updatedAt` inside the JSON would shadow the row's real one.
  ...(row.payload as object),
  version: row.version,
  status: row.status,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});
