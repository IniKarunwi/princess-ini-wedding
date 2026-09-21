/**
 * The seating plan's domain model.
 *
 * Everything is measured in HALL UNITS — an abstract top-down coordinate
 * space, not pixels and not screen space. North is -y (up), south is +y,
 * west is -x, east is +x. The map renders this through one SVG viewBox, so
 * pan and zoom never touch the data and a table's stored position means the
 * same thing on a phone and on a 4K display.
 */

export type Side = 'bride' | 'groom';
export type TableKind = 'round' | 'vip';

/**
 * One row of the seating document.
 *
 * Deliberately NOT called "Guest": a row may be a person, a couple, a family
 * with a nanny, or "OCC Worship + 3". It consumes `seats` seats, which is the
 * only number capacity arithmetic may use.
 */
export interface SeatEntry {
  id: string;
  name: string;
  seats: number;
  /** Where `seats` came from. See seatingSource.ts. */
  provenance: 'stated' | 'single' | 'inferred';
  /** Names several people but sits at one seat — unresolved in the source. */
  ambiguous?: boolean;
  /** The untouched source row. Never edited, so nothing is ever lost. */
  raw: string;
  /** True once an admin has renamed it. Drives the "edited" marker. */
  renamed?: boolean;
}

export interface SeatingTable {
  id: string;
  side: Side;
  kind: TableKind;
  /** 0 for VIP tables, which the document numbers separately per side. */
  number: number;
  title: string;
  group: string;
  capacity: number;
  /** Centre, in hall units. */
  x: number;
  y: number;
  /** VIP tables, like every fixed element, cannot be dragged. */
  movable: boolean;
  entries: SeatEntry[];
}

/** A rectangle tables may not occupy: dance floor, aisle, doorway clearance. */
export interface Zone {
  id: string;
  label: string;
  kind: 'couple' | 'dance' | 'aisle' | 'door' | 'wall';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which wall a door sits in, for drawing the opening. */
  wall?: 'north' | 'south' | 'east' | 'west';
}

export interface Layout {
  /** Bumped on every publish. */
  version: number;
  status: 'draft' | 'published';
  tables: SeatingTable[];
  updatedAt: string;
  /** Free-text note from whoever published, shown in the admin bar. */
  label?: string;
}

/** Seats taken at a table. Entries are NOT counted — seats are. */
export const seatsUsed = (t: SeatingTable): number =>
  t.entries.reduce((n, e) => n + e.seats, 0);

export const seatsFree = (t: SeatingTable): number =>
  Math.max(0, t.capacity - seatsUsed(t));

/**
 * Short label, for the map and a panel heading where the side is already on
 * screen: "Table 07", "VIP · Bride".
 */
export const tableLabel = (t: SeatingTable): string =>
  t.kind === 'vip'
    ? `VIP · ${t.side === 'bride' ? 'Bride' : 'Groom'}`
    : `Table ${String(t.number).padStart(2, '0')}`;

/**
 * Label for any LIST, where the side is not otherwise visible.
 *
 * The document numbers each side's tables from 01 independently, so there are
 * two Table 04s, two Table 07s and so on — twenty-two round tables sharing
 * eleven numbers. In the move dropdown that is not a cosmetic problem: a
 * planner aiming a guest at the groom's Table 04 could seat them on the
 * bride's side and the interface would look entirely correct.
 */
export const tableLongLabel = (t: SeatingTable): string =>
  t.kind === 'vip'
    ? `VIP · ${t.side === 'bride' ? 'Bride' : 'Groom'}`
    : `Table ${String(t.number).padStart(2, '0')} · ${t.side === 'bride' ? 'Bride' : 'Groom'}`;

export const sideLabel = (s: Side): string =>
  s === 'bride' ? "Princess · Bride's side" : "IniOluwa · Groom's side";
