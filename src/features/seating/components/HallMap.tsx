/**
 * The floor plan.
 *
 * ── Pan and zoom, hand-rolled ──────────────────────────────────────────────
 * One SVG with a viewBox that the component drives. No pan/zoom library: the
 * whole interaction is "map a pointer position into hall units and move the
 * viewBox", roughly forty lines, and admin table-dragging needs that same
 * screen→hall transform anyway. A library would own the transform and we
 * would be fighting it to get the drag right.
 *
 * Pointer Events throughout, so a finger, a mouse and a stylus take the same
 * path, and two-finger pinch is handled by tracking the active pointers
 * rather than by listening for a separate gesture event that only Safari
 * sends.
 *
 * ── Why tables are drawn, not laid out in HTML ─────────────────────────────
 * A table is a circle with ten seats around it and a number in the middle.
 * In SVG that is arithmetic; in HTML it is a pile of absolutely positioned
 * divs that re-flow on every zoom. The data stays structured either way —
 * this is a rendering choice, not a data model.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Layout, SeatingTable } from '../types';
import { occupied, tableLabel } from '../types';
import { HALL, ROUND_R, ZONES, placementCheck } from '../hall';
import { C, F, MAP } from '../theme';

export interface MapHandle {
  /** Smoothly centre the view on a table. */
  flyTo(tableId: string, zoom?: number): void;
  zoomBy(factor: number): void;
  reset(): void;
}

interface View { x: number; y: number; w: number; h: number }

const FULL: View = { x: 0, y: 0, w: HALL.w, h: HALL.h };
const MIN_W = 340;              // deepest zoom in
const MAX_W = HALL.w * 1.15;    // furthest zoom out

/**
 * How far a pointer may wander, in SCREEN pixels, before the press stops
 * being a click and becomes a drag or a pan.
 *
 * Eight is the figure most touch platforms settle on, and it is about the
 * width of a fingertip's wobble. Below it nothing moves and nothing is
 * committed; above it the interaction is a drag and the click is suppressed.
 * Screen pixels rather than hall units, so it means the same at every zoom.
 */
const DRAG_SLOP = 8;

export default function HallMap({
  layout, selectedTableId, onSelectTable,
  editing, onMoveTable, onDropGuest, draggingEntryId, handleRef,
}: {
  layout: Layout;
  selectedTableId: string | null;
  onSelectTable(id: string | null): void;
  editing: boolean;
  onMoveTable(id: string, x: number, y: number): void;
  /** An entry is being dragged from the details panel onto a table. */
  onDropGuest(entryId: string, tableId: string): void;
  draggingEntryId: string | null;
  handleRef?: React.MutableRefObject<MapHandle | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(FULL);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Table being dragged by an admin, with its live (possibly illegal) spot.
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; ok: boolean } | null>(null);
  const [hoverTable, setHoverTable] = useState<string | null>(null);

  /* ── Screen ↔ hall ────────────────────────────────────────────────────── */

  const toHall = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const v = viewRef.current;
    // The SVG uses preserveAspectRatio="xMidYMid meet", so the rendered
    // content is letterboxed inside the element. Reproducing that here is
    // what keeps a drag under the finger instead of drifting.
    const scale = Math.min(r.width / v.w, r.height / v.h);
    const offX = (r.width - v.w * scale) / 2;
    const offY = (r.height - v.h * scale) / 2;
    return {
      x: v.x + (clientX - r.left - offX) / scale,
      y: v.y + (clientY - r.top - offY) / scale,
    };
  }, []);

  const clampView = useCallback((v: View): View => {
    const w = Math.max(MIN_W, Math.min(MAX_W, v.w));
    const h = w * (HALL.h / HALL.w);
    // Allow a little overscroll so edge tables are reachable, but never let
    // the room float away entirely.
    const pad = 120;
    return {
      w, h,
      x: Math.max(-pad, Math.min(HALL.w - w + pad, v.x)),
      y: Math.max(-pad, Math.min(HALL.h - h + pad, v.y)),
    };
  }, []);

  /* ── Animated fly-to ──────────────────────────────────────────────────── */

  const anim = useRef<number | null>(null);
  const animateTo = useCallback((target: View) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = viewRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setView(clampView(target)); return; }
    const t0 = performance.now();
    const dur = 620;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      // easeOutCubic — arrives settled rather than snapping.
      const e = 1 - Math.pow(1 - p, 3);
      setView(clampView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      }));
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [clampView]);

  useEffect(() => () => { if (anim.current) cancelAnimationFrame(anim.current); }, []);

  const flyTo = useCallback((tableId: string, zoomW = 560) => {
    const t = layout.tables.find((x) => x.id === tableId);
    if (!t) return;
    const w = Math.max(MIN_W, Math.min(MAX_W, zoomW));
    const h = w * (HALL.h / HALL.w);
    animateTo({ x: t.x - w / 2, y: t.y - h / 2, w, h });
  }, [layout.tables, animateTo]);

  const zoomBy = useCallback((factor: number) => {
    const v = viewRef.current;
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const w = v.w / factor;
    const h = w * (HALL.h / HALL.w);
    animateTo({ x: cx - w / 2, y: cy - h / 2, w, h });
  }, [animateTo]);

  useEffect(() => {
    if (handleRef) handleRef.current = { flyTo, zoomBy, reset: () => animateTo(FULL) };
  }, [handleRef, flyTo, zoomBy, animateTo]);

  /* ── Pointer handling ─────────────────────────────────────────────────── */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panFrom = useRef<{ px: number; py: number; view: View } | null>(null);
  const pinchFrom = useRef<{ dist: number; view: View } | null>(null);
  const movedRef = useRef(false);

  /**
   * A table the pointer is holding but has not yet dragged.
   *
   * Pressing a table used to start the drag immediately, which had three
   * consequences for anyone who just wanted to see who was sitting there:
   * a 1px tremor moved the table on screen, `movedRef` went true so the
   * click that opens the details was swallowed, and pointerup committed the
   * move — marking the draft dirty from what the planner experienced as a
   * click. Nobody can hold a finger perfectly still on a phone.
   *
   * So the press is only remembered here. The drag starts in onPointerMove,
   * after the pointer has travelled DRAG_SLOP, and until then the table has
   * not moved and the interaction is still a click.
   */
  const pendingGrab = useRef<{ id: string; px: number; py: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = false;

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchFrom.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: viewRef.current };
      panFrom.current = null;
      return;
    }
    panFrom.current = { px: e.clientX, py: e.clientY, view: viewRef.current };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /*
     * A held table that has not travelled far enough is still a click.
     *
     * The threshold is measured in SCREEN pixels from where the pointer
     * landed, not in hall units, so it means the same thing at every zoom
     * level — 8px on the glass is 8px whether the room is zoomed right in or
     * showing the whole floor.
     */
    const pending = pendingGrab.current;
    if (pending && !drag) {
      if (Math.hypot(e.clientX - pending.px, e.clientY - pending.py) < DRAG_SLOP) return;
      const p = toHall(e.clientX, e.clientY);
      const others = layout.tables
        .filter((t) => t.kind === 'round' && t.id !== pending.id)
        .map((t) => ({ id: t.id, x: t.x, y: t.y }));
      setDrag({ id: pending.id, x: p.x, y: p.y, ok: placementCheck(p.x, p.y, pending.id, others).ok });
      movedRef.current = true;
      return;
    }

    // Dragging a table wins over panning.
    if (drag) {
      const p = toHall(e.clientX, e.clientY);
      const others = layout.tables
        .filter((t) => t.kind === 'round' && t.id !== drag.id)
        .map((t) => ({ id: t.id, x: t.x, y: t.y }));
      const check = placementCheck(p.x, p.y, drag.id, others);
      setDrag({ id: drag.id, x: p.x, y: p.y, ok: check.ok });
      movedRef.current = true;
      return;
    }

    if (pointers.current.size === 2 && pinchFrom.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const f = pinchFrom.current;
      const w = f.view.w * (f.dist / Math.max(1, dist));
      const cx = f.view.x + f.view.w / 2, cy = f.view.y + f.view.h / 2;
      const nw = Math.max(MIN_W, Math.min(MAX_W, w));
      const nh = nw * (HALL.h / HALL.w);
      setView(clampView({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }));
      movedRef.current = true;
      return;
    }

    if (panFrom.current && pointers.current.size === 1) {
      const el = svgRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const f = panFrom.current;
      const scale = Math.min(r.width / f.view.w, r.height / f.view.h);
      const dx = (e.clientX - f.px) / scale;
      const dy = (e.clientY - f.py) / scale;
      // Screen pixels, and the same slop as a table drag. It used to compare
      // HALL units against 2, which meant the distance you had to hold still
      // changed with the zoom level — and at a close zoom, two hall units is
      // a fraction of a pixel, so almost any press counted as a pan and ate
      // the click. A VIP table cannot be dragged, so this is the path its
      // clicks take.
      if (Math.hypot(e.clientX - f.px, e.clientY - f.py) >= DRAG_SLOP) movedRef.current = true;
      setView(clampView({ ...f.view, x: f.view.x - dx, y: f.view.y - dy }));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchFrom.current = null;
    if (pointers.current.size === 0) panFrom.current = null;
    // Released without crossing the threshold: nothing was dragged, so there
    // is nothing to commit. The click that follows opens the table.
    pendingGrab.current = null;

    if (drag) {
      if (drag.ok) onMoveTable(drag.id, drag.x, drag.y);
      setDrag(null);
    }
  };

  /* ── Wheel zoom, anchored on the cursor ───────────────────────────────── */

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const v = viewRef.current;
      const p = toHall(ev.clientX, ev.clientY);
      const f = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
      const nw = Math.max(MIN_W, Math.min(MAX_W, v.w * f));
      const nh = nw * (HALL.h / HALL.w);
      // Keep the point under the cursor fixed.
      const rx = (p.x - v.x) / v.w, ry = (p.y - v.y) / v.h;
      setView(clampView({ x: p.x - rx * nw, y: p.y - ry * nh, w: nw, h: nh }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toHall, clampView]);

  /* ── Rendering ────────────────────────────────────────────────────────── */

  const zoomPct = Math.round((HALL.w / view.w) * 100);
  const others = useMemo(
    () => layout.tables.filter((t) => t.kind === 'round').map((t) => ({ id: t.id, x: t.x, y: t.y })),
    [layout.tables],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: MAP.floor }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        role="application"
        aria-label="Reception hall floor plan. North is up."
        style={{
          width: '100%', height: '100%', display: 'block',
          cursor: drag ? 'grabbing' : 'grab',
          // Stops the browser from scrolling the page while panning the map.
          touchAction: 'none',
          background: MAP.floor,
        }}
      >
        {/* The room */}
        <rect x={10} y={10} width={HALL.w - 20} height={HALL.h - 20}
              fill={MAP.floor} stroke={MAP.floorLine} strokeWidth={3} rx={6} />

        {/* Compass ribbon — the orientation is stated, not implied */}
        <text x={HALL.w / 2} y={44} textAnchor="middle"
              fill={C.faint} fontFamily={F.sans} fontSize={22} letterSpacing={9}>NORTH</text>
        {/* Just "SOUTH", and out of the centre.
            It read "SOUTH · GUEST ARRIVAL" and sat mid-wall — which is now
            exactly where the couple's dance-in is, and would have said the
            opposite of the truth right beside it. Guests arrive through the
            main entrance on the east wall; this door is the couple's alone. */}
        <text x={64} y={HALL.h - 26} textAnchor="start"
              fill={C.faint} fontFamily={F.sans} fontSize={20} letterSpacing={9}>
          SOUTH
        </text>

        <FixedElements />

        {/* Tables */}
        {layout.tables.map((t) => (
          <TableShape
            key={t.id}
            table={t}
            selected={t.id === selectedTableId}
            dropTarget={!!draggingEntryId && hoverTable === t.id}
            dragging={drag?.id === t.id}
            dragPos={drag?.id === t.id ? drag : null}
            editing={editing}
            onSelect={() => { if (!movedRef.current) onSelectTable(t.id); }}
            onGrab={(ev) => {
              if (!editing || !t.movable) return;
              ev.stopPropagation();
              (ev.target as Element).setPointerCapture?.(ev.pointerId);
              pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
              // Remember where the finger landed, but do NOT start dragging.
              // The drag begins in onPointerMove, once it has travelled far
              // enough to be one. See DRAG_SLOP.
              movedRef.current = false;
              pendingGrab.current = { id: t.id, px: ev.clientX, py: ev.clientY };
            }}
            onHover={(on) => setHoverTable(on ? t.id : null)}
            onDropGuest={() => draggingEntryId && onDropGuest(draggingEntryId, t.id)}
          />
        ))}
      </svg>

      {/* Zoom readout — small, and outside the SVG so it never scales */}
      {/* Top-LEFT: at top-right it printed straight across the Bride &
          Groom table on a phone, which is the one label that must stay
          readable. */}
      <div style={{
        position: 'absolute', top: 10, left: 10,
        fontFamily: F.sans, fontSize: '0.56rem', letterSpacing: '0.16em',
        textTransform: 'uppercase', color: C.muted,
        background: 'rgba(253,251,245,0.92)', border: `1px solid ${C.rule}`,
        padding: '0.35rem 0.6rem', pointerEvents: 'none',
      }}>
        {zoomPct}%<span className="pi-hint"> · drag to pan</span>
      </div>

      {/* Injected because a media query cannot be expressed in a style
          object. On a phone the readout spanned half the map's width and
          printed across the Bride & Groom table; there the percentage alone
          is enough, and nobody needs telling that a map can be dragged. */}
      <style>{`.pi-hint{display:none}@media(min-width:900px){.pi-hint{display:inline}}`}</style>

      {drag && !drag.ok && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          fontFamily: F.sans, fontSize: '0.62rem', letterSpacing: '0.16em',
          textTransform: 'uppercase', color: '#fff', background: MAP.invalid,
          padding: '0.5rem 0.9rem', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {placementCheck(drag.x, drag.y, drag.id, others).reason} — release to cancel
        </div>
      )}
    </div>
  );
}

/* ── Fixed furniture ──────────────────────────────────────────────────────── */

function FixedElements() {
  return (
    <>
      {ZONES.map((z) => {
        if (z.id === 'couple') {
          return (
            <g key={z.id}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={10}
                    fill={C.green} />
              <text x={z.x + z.w / 2} y={z.y + 34} textAnchor="middle"
                    fill={C.goldSoft} fontFamily={F.sans} fontSize={15} letterSpacing={6}>
                BRIDE &amp; GROOM
              </text>
              <text x={z.x + z.w / 2} y={z.y + 78} textAnchor="middle"
                    fill={C.onDark} fontFamily={F.serif} fontSize={40}>
                Princess &amp; IniOluwa
              </text>
            </g>
          );
        }
        if (z.id === 'dance') {
          return (
            <g key={z.id}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={6}
                    fill={MAP.dance} stroke={MAP.floorLine} strokeWidth={2} />
              {/* A parquet hint, not a texture — it reads at every zoom. */}
              {Array.from({ length: 7 }).map((_, i) => (
                <line key={i} x1={z.x + 14 + i * ((z.w - 28) / 6)} y1={z.y + 14}
                      x2={z.x + 14 + i * ((z.w - 28) / 6)} y2={z.y + z.h - 14}
                      stroke={MAP.floorLine} strokeWidth={1} />
              ))}
              <text x={z.x + z.w / 2} y={z.y + z.h / 2} textAnchor="middle"
                    fill={MAP.danceInk} fontFamily={F.serif} fontSize={38}>Dance Floor</text>
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 30} textAnchor="middle"
                    fill={MAP.danceInk} fontFamily={F.sans} fontSize={14} letterSpacing={6}>
                KEEP CLEAR
              </text>
            </g>
          );
        }
        if (z.kind === 'aisle') {
          return (
            <g key={z.id}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h}
                    fill={MAP.aisle} stroke={MAP.floorLine} strokeWidth={1}
                    strokeDasharray="8 8" />
              <text x={z.x + z.w / 2} y={z.y + 140} textAnchor="middle"
                    fill={C.faint} fontFamily={F.sans} fontSize={15} letterSpacing={8}
                    transform={`rotate(90 ${z.x + z.w / 2} ${z.y + 140})`}>
                CENTRAL AISLE
              </text>
            </g>
          );
        }
        if (z.kind === 'door') {
          // A door in the SOUTH wall is a horizontal opening with an upright
          // label; the east and west walls take a vertical opening and a
          // rotated one. Same zone data, drawn to suit the wall it is in.
          if (z.wall === 'south') {
            const cx = z.x + z.w / 2;
            // Everything here lives in the 78-unit band between the bottom
            // row of tables (rims at y = 1212) and the south wall (y = 1290),
            // and inside the 196-unit horizontal gap between the innermost
            // tables. On one line at full size the label printed straight
            // across Table 11's seats, so it is set on two shorter lines.
            return (
              <g key={z.id}>
                <text x={cx} y={HALL.h - 70} textAnchor="middle"
                      fill={C.muted} fontFamily={F.sans} fontSize={13} letterSpacing={4}>
                  COUPLE&rsquo;S
                </text>
                <text x={cx} y={HALL.h - 52} textAnchor="middle"
                      fill={C.muted} fontFamily={F.sans} fontSize={13} letterSpacing={4}>
                  DANCE-IN
                </text>
                {/* Points north, the way the couple walk: in from the south
                    door, up the aisle, to the dance floor. */}
                <path d={`M ${cx} ${HALL.h - 20} L ${cx} ${HALL.h - 42}`}
                      stroke={C.goldSoft} strokeWidth={2} fill="none" />
                <path d={`M ${cx - 7} ${HALL.h - 36} L ${cx} ${HALL.h - 46} L ${cx + 7} ${HALL.h - 36}`}
                      stroke={C.goldSoft} strokeWidth={2} fill="none" />
                {/* The opening, straddling the south wall line at y = 1290. */}
                <rect x={z.x + 24} y={HALL.h - 16} width={z.w - 48} height={12}
                      fill={MAP.floor} stroke={C.goldSoft} strokeWidth={3} />
              </g>
            );
          }

          const east = z.wall === 'east';
          return (
            <g key={z.id}>
              {/* The opening in the wall */}
              <rect x={east ? HALL.w - 22 : 10} y={z.y + 30} width={12} height={z.h - 60}
                    fill={MAP.floor} stroke={C.goldSoft} strokeWidth={3} />
              <text
                x={east ? HALL.w - 40 : 40}
                y={z.y + z.h / 2}
                textAnchor="middle"
                fill={C.muted} fontFamily={F.sans} fontSize={15} letterSpacing={5}
                transform={`rotate(${east ? -90 : 90} ${east ? HALL.w - 40 : 40} ${z.y + z.h / 2})`}
              >
                {z.label.toUpperCase()}
              </text>
            </g>
          );
        }
        return null;
      })}
    </>
  );
}

/* ── One table ────────────────────────────────────────────────────────────── */

function TableShape({
  table, selected, dragging, dragPos, editing, dropTarget,
  onSelect, onGrab, onHover, onDropGuest,
}: {
  table: SeatingTable;
  selected: boolean;
  dragging: boolean;
  dragPos: { x: number; y: number; ok: boolean } | null;
  editing: boolean;
  dropTarget: boolean;
  onSelect(): void;
  onGrab(e: React.PointerEvent): void;
  onHover(on: boolean): void;
  onDropGuest(): void;
}) {
  const used = occupied(table);
  const full = used >= table.capacity;
  const x = dragPos ? dragPos.x : table.x;
  const y = dragPos ? dragPos.y : table.y;
  const bad = dragging && dragPos && !dragPos.ok;

  const stroke = bad ? MAP.invalid : selected || dropTarget ? MAP.selectStroke : MAP.tableStroke;
  const fill = bad ? '#f6e3dc' : selected || dropTarget ? MAP.selectFill : MAP.tableFill;

  if (table.kind === 'vip') {
    // The VIP slab: tall, north-south, with its 15 seats down both long
    // sides — which is what makes the orientation legible at a glance.
    const w = 74, h = 374;
    const left = x - w / 2, top = y - h / 2;
    const per = Math.ceil(table.capacity / 2);
    return (
      <g data-table-id={table.id}
         onPointerUp={dropTarget ? onDropGuest : undefined}
         onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)}
         onClick={onSelect} style={{ cursor: 'pointer' }}>
        {Array.from({ length: per }).map((_, i) => {
          const sy = top + 22 + i * ((h - 44) / Math.max(1, per - 1));
          return (
            <g key={i}>
              <circle cx={left - 11} cy={sy} r={8} fill={MAP.seatFill} stroke={MAP.seatStroke} strokeWidth={1.5} />
              {i < table.capacity - per && (
                <circle cx={left + w + 11} cy={sy} r={8} fill={MAP.seatFill} stroke={MAP.seatStroke} strokeWidth={1.5} />
              )}
            </g>
          );
        })}
        <rect x={left} y={top} width={w} height={h} rx={8}
              fill={selected ? MAP.selectFill : MAP.vipFill}
              stroke={selected ? MAP.selectStroke : MAP.vipStroke} strokeWidth={selected ? 3 : 2} />
        <text x={x} y={top + 40} textAnchor="middle" fill={C.gold}
              fontFamily={F.sans} fontSize={15} letterSpacing={4}>VIP</text>
        <text x={x} y={y + 6} textAnchor="middle" fill={MAP.tableInk}
              fontFamily={F.serif} fontSize={26}
              transform={`rotate(90 ${x} ${y})`}>
          {table.side === 'bride' ? 'Bride · West' : 'Groom · East'}
        </text>
        <text x={x} y={top + h - 22} textAnchor="middle" fill={MAP.tableInk}
              fontFamily={F.sans} fontSize={16} letterSpacing={1}>
          {used}/{table.capacity}
        </text>
      </g>
    );
  }

  const seatCount = table.capacity;
  return (
    <g
      // The permanent id, not the displayed number: tests and any future
      // deep link must survive a renumber, which is the whole distinction.
      data-table-id={table.id}
      onPointerDown={editing && table.movable ? onGrab : undefined}
      onPointerUp={dropTarget ? onDropGuest : undefined}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onClick={onSelect}
      style={{ cursor: editing && table.movable ? 'move' : 'pointer' }}
      opacity={dragging ? 0.92 : 1}
    >
      {/* Seats first, so the table top sits over their inner edge */}
      {Array.from({ length: seatCount }).map((_, i) => {
        const a = (i / seatCount) * Math.PI * 2 - Math.PI / 2;
        return (
          <circle key={i}
                  cx={x + Math.cos(a) * (ROUND_R + 15)}
                  cy={y + Math.sin(a) * (ROUND_R + 15)}
                  r={11}
                  fill={i < used ? MAP.selectFill : MAP.seatFill}
                  stroke={i < used ? MAP.selectStroke : MAP.seatStroke}
                  strokeWidth={1.5} />
        );
      })}
      <circle cx={x} cy={y} r={ROUND_R} fill={fill} stroke={stroke}
              strokeWidth={selected || dropTarget ? 4 : 2} />
      <text x={x} y={y - 12} textAnchor="middle" fill={C.faint}
            fontFamily={F.sans} fontSize={13} letterSpacing={3}>TABLE</text>
      <text x={x} y={y + 22} textAnchor="middle"
            fill={selected ? MAP.selectInk : MAP.tableInk}
            fontFamily={F.serif} fontSize={40} fontWeight={500}>
        {String(table.number).padStart(2, '0')}
      </text>
      <text x={x} y={y + 44} textAnchor="middle"
            fill={full ? C.muted : C.gold}
            fontFamily={F.sans} fontSize={15}>
        {used}/{table.capacity}
      </text>
      <title>{`${tableLabel(table)} — ${used} of ${table.capacity} seats`}</title>
    </g>
  );
}
