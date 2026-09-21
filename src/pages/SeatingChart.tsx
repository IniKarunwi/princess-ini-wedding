/**
 * /seating-chart
 *
 * Public by default. A guest gets the published room, a search field and a
 * map. Editing exists only behind the PIN, and none of its controls render
 * until then — there is no disabled toolbar hinting at a locked door.
 *
 * Layout: side panel beside the map on desktop, bottom sheet under it on
 * mobile. One breakpoint, because the map wants every pixel of height it can
 * get on a phone and a second breakpoint would only add ways to be wrong.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import HallMap, { type MapHandle } from '@/features/seating/components/HallMap';
import FindYourSeat from '@/features/seating/components/FindYourSeat';
import TableDetails from '@/features/seating/components/TableDetails';
import { AdminBar, AdminUnlock } from '@/features/seating/components/AdminPanel';
import { useAdminSession } from '@/features/seating/auth';
import { useSeatingPlan } from '@/features/seating/useSeatingPlan';
import { seatingService } from '@/features/seating/service';
import { assertLayoutLegal, HALL } from '@/features/seating/hall';
import { C, F, label } from '@/features/seating/theme';
import { SOURCE_TOTALS } from '@/features/seating/data/seatingSource';

const WIDE = 900;

export default function SeatingChart() {
  const admin = useAdminSession();
  const plan = useSeatingPlan(admin.canEdit);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= WIDE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightEntry, setHighlightEntry] = useState<string | null>(null);
  const [draggingEntry, setDraggingEntry] = useState<string | null>(null);
  const mapRef = useRef<MapHandle | null>(null);

  useEffect(() => {
    const on = () => setWide(window.innerWidth >= WIDE);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const layout = plan.visible;
  const selected = useMemo(
    () => layout?.tables.find((t) => t.id === selectedId) ?? null,
    [layout, selectedId],
  );

  // A layout that ships with a table inside the dance floor is a bug the
  // planner would have to fix by hand. Shout about it in development.
  useEffect(() => {
    if (!layout || !import.meta.env.DEV) return;
    const problems = assertLayoutLegal(layout.tables);
    if (problems.length) console.warn('[seating] illegal table placements:', problems);
  }, [layout]);

  if (plan.loading || !layout) {
    return (
      <main style={shellFor(wide)}>
        <p style={{ ...label(C.muted), padding: '3rem 1rem', textAlign: 'center' }}>
          Setting the room…
        </p>
      </main>
    );
  }

  const panel = (
    <>
      <div style={{ background: C.paper, border: `1px solid ${C.rule}`, padding: '1.2rem' }}>
        <FindYourSeat
          layout={layout}
          onPick={(table, entryId) => {
            setSelectedId(table.id);
            setHighlightEntry(entryId);
            mapRef.current?.flyTo(table.id, 620);
          }}
        />
      </div>

      {selected && wide && (
        <div style={{ marginTop: '1rem' }}>
          <TableDetails
            table={selected}
            allTables={layout.tables}
            highlightEntryId={highlightEntry}
            editing={admin.canEdit}
            sheet={false}
            onClose={() => setSelectedId(null)}
            onRename={plan.renameGuest}
            onMoveGuest={plan.moveGuestTo}
            onGuestDragStart={setDraggingEntry}
            onGuestDragEnd={() => setDraggingEntry(null)}
            error={plan.error}
            onRenumber={plan.renumber}
            onSwapNumbers={plan.swapNumbers}
            numberConflict={plan.numberConflict}
            onClearConflict={plan.clearNumberConflict}
            notice={plan.notice}
            durable={seatingService.isDurable}
          />
        </div>
      )}
    </>
  );

  return (
    <main style={shellFor(wide)}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: `1px solid ${C.rule}`, background: C.paper,
        padding: `1rem ${wide ? '2rem' : '1rem'}`,
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={label(C.gold, '0.58rem')}>Princess &amp; IniOluwa · Reception</p>
          <h1 style={{
            fontFamily: F.serif, fontWeight: 400, fontSize: wide ? '2rem' : '1.5rem',
            color: C.green, margin: '0.3rem 0 0', lineHeight: 1.1,
          }}>
            Top-down seating plan — north is up
          </h1>
        </div>

        {/* On a phone these three buttons cost a whole row of the little
            vertical space the map has. Pinch-zoom already works there, so
            they move onto the map itself as a compact column. */}
        {wide && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" onClick={() => mapRef.current?.zoomBy(1 / 1.35)} style={ghost} aria-label="Zoom out">− Zoom</button>
            <button type="button" onClick={() => mapRef.current?.zoomBy(1.35)} style={ghost} aria-label="Zoom in">+ Zoom</button>
            <button type="button" onClick={() => mapRef.current?.reset()} style={ghost}>Whole room</button>
          </div>
        )}
      </header>

      {/* ── Admin ──────────────────────────────────────────────────────── */}
      {admin.canEdit ? (
        <AdminBar
          dirty={plan.dirty}
          canUndo={plan.canUndo}
          canRedo={plan.canRedo}
          saving={plan.saving}
          lastAction={plan.lastAction}
          version={plan.published?.version ?? 1}
          durable={seatingService.isDurable}
          realAuth={admin.isRealAuth}
          onUndo={plan.undo}
          onRedo={plan.redo}
          onSave={plan.saveDraft}
          onPublish={plan.publish}
          onDiscard={plan.discardDraft}
          onLock={() => { admin.lock(); setDraggingEntry(null); }}
        />
      ) : (
        <div style={{
          borderBottom: `1px solid ${C.rule}`, background: C.ivory,
          padding: `0.6rem ${wide ? '2rem' : '1rem'}`,
          display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        }}>
          {/* The full line wrapped to five rows at 390px and pushed the map
              off the screen. The counts are reassurance, not information a
              guest needs, so the phone gets the short form. */}
          <span style={{ ...label(C.greenSoft, '0.58rem'), flex: 1, lineHeight: 1.5 }}>
            {wide
              ? `● Public seating chart · ${SOURCE_TOTALS.tables} tables · ${SOURCE_TOTALS.seatsAssigned} of ${SOURCE_TOTALS.seatsAvailable} seats`
              : `● Public · ${SOURCE_TOTALS.tables} tables`}
          </span>
          <AdminUnlock onUnlock={admin.unlock} />
        </div>
      )}

      {/* ── Map + panel ────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: wide ? 'grid' : 'flex',
        gridTemplateColumns: wide ? '1fr 380px' : undefined,
        flexDirection: wide ? undefined : 'column',
        gap: wide ? '1rem' : 0,
        padding: wide ? '1rem 2rem 2rem' : 0,
      }}>
        <div style={{
          position: 'relative',
          // On mobile the box is given the hall's own aspect ratio, so the
          // SVG fills it exactly. At a fixed height it letterboxed and left
          // ~150px of empty paper with the zoom controls stranded in it.
          minHeight: wide ? 0 : undefined,
          aspectRatio: wide ? undefined : `${HALL.w} / ${HALL.h}`,
          flex: wide ? undefined : '0 0 auto',
          border: `1px solid ${C.rule}`,
        }}>
          {!wide && (
            <div style={{
              position: 'absolute', right: 8, bottom: 8, zIndex: 5,
              display: 'grid', gap: 6,
            }}>
              <button type="button" aria-label="Zoom in" style={mapBtn}
                      onClick={() => mapRef.current?.zoomBy(1.35)}>+</button>
              <button type="button" aria-label="Zoom out" style={mapBtn}
                      onClick={() => mapRef.current?.zoomBy(1 / 1.35)}>−</button>
              <button type="button" aria-label="Show the whole room" style={mapBtn}
                      onClick={() => mapRef.current?.reset()}>⤢</button>
            </div>
          )}
          <HallMap
            layout={layout}
            selectedTableId={selectedId}
            onSelectTable={(id) => { setSelectedId(id); setHighlightEntry(null); }}
            editing={admin.canEdit}
            onMoveTable={plan.moveTableTo}
            onDropGuest={(entryId, tableId) => { plan.moveGuestTo(entryId, tableId); setDraggingEntry(null); }}
            draggingEntryId={draggingEntry}
            handleRef={mapRef}
          />
        </div>

        {wide ? (
          <aside style={{ overflowY: 'auto' }}>{panel}</aside>
        ) : (
          <div style={{ padding: '1rem', background: C.ivory }}>{panel}</div>
        )}
      </div>

      {/* ── Mobile bottom sheet ────────────────────────────────────────── */}
      {selected && !wide && (
        <div
          role="dialog"
          aria-label={`Table details`}
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
            boxShadow: '0 -10px 30px rgba(42,36,25,0.18)',
          }}
        >
          <TableDetails
            table={selected}
            allTables={layout.tables}
            highlightEntryId={highlightEntry}
            editing={admin.canEdit}
            sheet
            onClose={() => setSelectedId(null)}
            onRename={plan.renameGuest}
            onMoveGuest={plan.moveGuestTo}
            onGuestDragStart={setDraggingEntry}
            onGuestDragEnd={() => setDraggingEntry(null)}
            error={plan.error}
            onRenumber={plan.renumber}
            onSwapNumbers={plan.swapNumbers}
            numberConflict={plan.numberConflict}
            onClearConflict={plan.clearNumberConflict}
            notice={plan.notice}
            durable={seatingService.isDurable}
          />
        </div>
      )}
    </main>
  );
}

/**
 * On desktop the page is exactly one viewport tall and does not scroll: the
 * map fills whatever is left after the header, and the panel scrolls inside
 * itself. `minHeight` alone was not enough — with no definite height on the
 * shell, `flex: 1` had nothing to divide, the SVG's `height: 100%` resolved
 * against auto, and the floor plan rendered 1222px tall inside a 900px
 * window with its southern half below the fold.
 *
 * On mobile the opposite is right: the map takes a generous slice and the
 * page scrolls on to the search panel beneath it.
 */
const shellFor = (wide: boolean): React.CSSProperties => ({
  height: wide ? '100svh' : undefined,
  minHeight: wide ? undefined : '100svh',
  overflow: wide ? 'hidden' : undefined,
  display: 'flex', flexDirection: 'column',
  background: C.ivory, color: C.ink,
});

/** Compact on-map control for phones. 40px square: a real tap target. */
const mapBtn: React.CSSProperties = {
  width: 40, height: 40, lineHeight: 1,
  fontFamily: F.sans, fontSize: '1.05rem', color: C.green,
  background: 'rgba(253,251,245,0.94)', border: `1px solid ${C.rule}`,
  cursor: 'pointer', padding: 0,
};

const ghost: React.CSSProperties = {
  ...label(C.green, '0.58rem'),
  background: 'none', border: `1px solid ${C.rule}`,
  padding: '0.5rem 0.7rem', cursor: 'pointer', whiteSpace: 'nowrap',
};
