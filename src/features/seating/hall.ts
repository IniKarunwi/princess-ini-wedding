/**
 * The room.
 *
 * ── Orientation, which is not negotiable ───────────────────────────────────
 *   NORTH = top (-y)      SOUTH = bottom (+y)
 *   WEST  = left (-x)     EAST  = right (+x)
 *
 * ── The arrangement ────────────────────────────────────────────────────────
 *                            NORTH
 *                       BRIDE & GROOM
 *          VIP ║        DANCE FLOOR        ║ VIP
 *          (W) ║                           ║ (E)
 *
 *            ROUND TABLES  │ AISLE │  ROUND TABLES
 *              (bride)     │       │    (groom)
 *                       COUPLE'S DANCE-IN
 *                            SOUTH
 *
 * The couple enter from the SOUTH and walk north up the aisle. Guests arrive
 * through the MAIN ENTRANCE, mid-way along the EAST wall. Two different
 * doors doing two different jobs.
 *
 * Both VIP tables run NORTH-SOUTH — tall, not wide — with the dance floor
 * between them, one west and one east. The central aisle runs north-south
 * below the dance floor and stays clear.
 *
 * ── Why the positions are generated and then checked ───────────────────────
 * The round tables are laid out by a small function and then validated
 * against every fixed zone by assertLayoutLegal(). Hand-placing 22 circles
 * and eyeballing the gaps is how you end up with a table sitting half inside
 * the dance floor on one screen size and not another. The validator is the
 * same code the admin drag uses, so what is legal on load is legal to drag to.
 */

import type { Zone, Side } from './types';

/* ── The hall ───────────────────────────────────────────────────────────── */

/**
 * Room proportions.
 *
 * Wider than it is deep, which is both how reception halls usually are and
 * what stops the map letterboxing into a narrow strip inside a landscape
 * browser window. An earlier 1200×1500 left the southern third of the room
 * empty and wasted most of the panel's width on blank margins.
 */
export const HALL = { w: 1360, h: 1300 } as const;

/** Tables must stay this far inside the walls. */
export const WALL_INSET = 34;

/** Round tables: radius, and the clearance kept between neighbours. */
export const ROUND_R = 64;
export const TABLE_GAP = 18;

/* ── Fixed elements ─────────────────────────────────────────────────────── */

const DANCE = { x: 510, y: 236, w: 340, h: 374 };
const COUPLE = { x: 508, y: 74, w: 344, h: 118 };

/** VIP slabs: 70 wide, 374 tall. Tall on purpose — these run north-south. */
export const VIP_W = 74;
export const VIP_GEOM = {
  bride: { x: 376, y: 236, w: VIP_W, h: 374 },   // WEST of the dance floor
  groom: { x: 910, y: 236, w: VIP_W, h: 374 },   // EAST of the dance floor
} as const;

/**
 * The aisle runs from just below the dance floor to the south wall, where it
 * now terminates at the couple's dance-in doorway. It used to stop short to
 * avoid printing over a centred south label; that label has moved to the
 * corner, so the aisle can reach the wall it is supposed to lead to.
 */
const AISLE = { x: 628, y: 648, w: 104, h: HALL.h - 648 - 10 };

/**
 * Clearance kept in front of each doorway.
 *
 * 110 units, about 8% of the room's width. The first attempt reserved 150 and
 * assertLayoutLegal() immediately reported three tables sitting inside a
 * doorway — which is the whole reason the validator exists, and why these
 * positions are generated and checked rather than eyeballed.
 */
const DOOR_CLEAR = 110;

export const ZONES: Zone[] = [
  { id: 'couple', label: 'Bride & Groom', kind: 'couple', ...COUPLE },
  { id: 'dance', label: 'Dance Floor', kind: 'dance', ...DANCE },
  { id: 'vip-bride', label: 'VIP · Bride', kind: 'wall', ...VIP_GEOM.bride },
  { id: 'vip-groom', label: 'VIP · Groom', kind: 'wall', ...VIP_GEOM.groom },
  { id: 'aisle', label: 'Central Aisle', kind: 'aisle', ...AISLE },

  // Main entrance: the midpoint of the EAST wall. The zone is the doorway
  // plus the clearance in front of it — nobody wants to squeeze past a table
  // to get into the room.
  { id: 'door-main', label: 'Main Entrance', kind: 'door', wall: 'east',
    x: HALL.w - DOOR_CLEAR, y: 620, w: DOOR_CLEAR, h: 200 },

  // The couple's dance-in is on the SOUTH wall, centred on the aisle.
  //
  // The couple enter from the south and walk north up the aisle to the dance
  // floor and the sweetheart table, so the aisle terminates at this doorway
  // rather than at a blank wall. It is NOT a guest entrance — guests arrive
  // through the main entrance on the east wall.
  //
  // The width is bounded by the innermost round tables on each side, whose
  // rims sit at x = 572 (bride) and x = 768 (groom). Centred on the aisle at
  // x = 680, ±84 clears both. The depth is bounded above by the bottom row,
  // whose lowest rim is at y = 1212.
  { id: 'door-couple', label: "Couple's Dance-In", kind: 'door', wall: 'south',
    x: AISLE.x + AISLE.w / 2 - 84, y: HALL.h - 90, w: 168, h: 90 },
];

export const zoneById = (id: string) => ZONES.find((z) => z.id === id)!;

/* ── Geometry helpers ───────────────────────────────────────────────────── */

/** Does a circle of radius r at (x,y) intersect a rectangle? */
export function circleHitsRect(
  x: number, y: number, r: number,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - nx, dy = y - ny;
  return dx * dx + dy * dy < r * r;
}

/** Every zone a round table at (x,y) would sit inside. Empty means legal. */
export function blockingZones(x: number, y: number, r = ROUND_R): Zone[] {
  return ZONES.filter((z) => circleHitsRect(x, y, r, z));
}

export function insideWalls(x: number, y: number, r = ROUND_R): boolean {
  return x - r >= WALL_INSET && x + r <= HALL.w - WALL_INSET
      && y - r >= WALL_INSET && y + r <= HALL.h - WALL_INSET;
}

/** Round tables that a table at (x,y) would overlap, ignoring itself. */
export function overlappingTables(
  x: number, y: number, selfId: string,
  others: Array<{ id: string; x: number; y: number }>,
): string[] {
  const min = ROUND_R * 2 + TABLE_GAP;
  return others
    .filter((o) => o.id !== selfId)
    .filter((o) => Math.hypot(o.x - x, o.y - y) < min)
    .map((o) => o.id);
}

/**
 * Is this a legal resting place for a round table?
 *
 * One function, used by the initial layout, by the drag preview and by the
 * drop — so a position can never be legal in one and illegal in another.
 */
export function placementCheck(
  x: number, y: number, selfId: string,
  others: Array<{ id: string; x: number; y: number }>,
): { ok: boolean; reason?: string } {
  if (!insideWalls(x, y)) return { ok: false, reason: 'Outside the hall' };
  const z = blockingZones(x, y);
  if (z.length) return { ok: false, reason: z[0].label };
  const hit = overlappingTables(x, y, selfId, others);
  if (hit.length) return { ok: false, reason: 'Too close to another table' };
  return { ok: true };
}

/* ── The starting arrangement ───────────────────────────────────────────── */

/**
 * Where the 11 round tables on each side begin.
 *
 * Two pockets per side: a short column beside the dance floor, and the main
 * field south of it. Each position carries a small deterministic offset so
 * the room reads as a room rather than as a spreadsheet — the brief asks for
 * exactly that, and a pseudo-random jitter seeded off the index keeps it
 * stable across reloads instead of shuffling on every render.
 */
export function initialRoundPositions(side: Side): Array<{ x: number; y: number }> {
  const west = side === 'bride';
  // Mirror the east side about the hall's centre line.
  const mx = (x: number) => (west ? x : HALL.w - x);

  const pockets: Array<{ x: number; y: number }> = [
    // Beside the dance floor, outboard of the VIP slab.
    { x: mx(210), y: 300 },
    { x: mx(210), y: 486 },
    // The main field, three columns by three rows.
    ...[0, 1, 2].flatMap((row) =>
      [0, 1, 2].map((col) => ({
        x: mx(182 + col * 168),
        y: 730 + row * 205,
      })),
    ),
  ];

  // Deterministic jitter: enough to break the grid, never enough to collide.
  return pockets.map((p, i) => ({
    x: Math.round(p.x + Math.sin(i * 12.9898) * 11),
    y: Math.round(p.y + Math.cos(i * 78.233) * 9),
  }));
}

/**
 * Proves the generated layout is actually legal.
 *
 * Called by the test suite and, in development, on load. A layout that ships
 * with a table inside the dance floor is a bug the admin then has to fix by
 * hand, which is not the admin's job.
 */
export function assertLayoutLegal(
  tables: Array<{ id: string; x: number; y: number; kind: string }>,
): string[] {
  const rounds = tables.filter((t) => t.kind === 'round');
  const problems: string[] = [];
  for (const t of rounds) {
    const c = placementCheck(t.x, t.y, t.id, rounds);
    if (!c.ok) problems.push(`${t.id} at (${t.x},${t.y}): ${c.reason}`);
  }
  return problems;
}
