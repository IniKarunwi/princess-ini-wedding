/**
 * The selected table's guest list.
 *
 * A side panel on desktop, a bottom sheet on mobile — same component, and the
 * page decides which by passing `sheet`. The floor plan deliberately shows
 * only a number and an occupancy count, so this is the only place names
 * appear; cramming 219 names onto the map would make it unreadable at every
 * zoom level at once.
 *
 * In edit mode each row gains a rename field and a "move to table" control.
 * The move control is a SELECT, not drag-only: dragging a name onto a circle
 * is pleasant with a mouse and genuinely difficult with a thumb, and the
 * planners will be doing this on a phone at the venue.
 */

import { useState } from 'react';
import type { SeatingTable, SeatEntry } from '../types';
import { seatsUsed, seatsFree, tableLabel, tableLongLabel, sideLabel } from '../types';
import { C, F, label } from '../theme';

export default function TableDetails({
  table, allTables, highlightEntryId, editing, sheet,
  onClose, onRename, onMoveGuest, onGuestDragStart, onGuestDragEnd, error,
}: {
  table: SeatingTable;
  allTables: SeatingTable[];
  highlightEntryId: string | null;
  editing: boolean;
  sheet: boolean;
  onClose(): void;
  onRename(entryId: string, name: string): void;
  onMoveGuest(entryId: string, tableId: string): void;
  onGuestDragStart(entryId: string): void;
  onGuestDragEnd(): void;
  error: string | null;
}) {
  const used = seatsUsed(table);
  const free = seatsFree(table);
  const pct = Math.min(100, (used / table.capacity) * 100);

  return (
    <div style={{
      background: C.paper,
      border: `1px solid ${C.rule}`,
      padding: sheet ? '1rem 1.1rem 1.4rem' : '1.2rem',
      maxHeight: sheet ? '46svh' : 'none',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={label(C.gold)}>Selected table</p>
          <h3 style={{
            fontFamily: F.serif, fontWeight: 400, fontSize: '1.9rem',
            color: C.green, margin: '0.4rem 0 0.1rem', lineHeight: 1.1,
          }}>
            {tableLabel(table)}
          </h3>
          <p style={{
            fontFamily: F.sans, fontSize: '0.68rem', letterSpacing: '0.12em',
            color: C.muted, margin: 0,
          }}>
            {sideLabel(table.side)}{table.title ? ` · ${table.title}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto', marginLeft: '0.8rem' }}>
          <span style={{
            fontFamily: F.serif, fontSize: '1.6rem', color: C.green, display: 'block', lineHeight: 1,
          }}>
            {used}/{table.capacity}
          </span>
          <span style={{ ...label(C.muted, '0.55rem'), display: 'block', marginTop: '0.25rem' }}>
            seats
          </span>
        </div>
      </div>

      {/* Occupancy bar — the single number a planner scans for */}
      <div style={{ height: 4, background: C.ivoryDeep, margin: '0.9rem 0 0.5rem' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: free === 0 ? C.greenSoft : C.gold }} />
      </div>
      <p style={{ fontFamily: F.sans, fontSize: '0.68rem', color: C.muted, margin: 0 }}>
        {free === 0 ? 'Full' : `${free} seat${free === 1 ? '' : 's'} open`}
        {table.group ? ` · ${table.group}` : ''}
      </p>

      {error && (
        <p style={{
          fontFamily: F.sans, fontSize: '0.72rem', lineHeight: 1.5,
          color: '#8c3d22', background: '#f8e8e1', border: '1px solid #e6c5b6',
          padding: '0.6rem 0.7rem', margin: '0.9rem 0 0',
        }}>
          {error}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: '1.1rem 0 0', padding: 0 }}>
        {table.entries.map((e) => (
          <EntryRow
            key={e.id}
            entry={e}
            highlighted={e.id === highlightEntryId}
            editing={editing}
            tables={allTables}
            currentTableId={table.id}
            onRename={(n) => onRename(e.id, n)}
            onMove={(to) => onMoveGuest(e.id, to)}
            onDragStart={() => onGuestDragStart(e.id)}
            onDragEnd={onGuestDragEnd}
          />
        ))}
        {table.entries.length === 0 && (
          <li style={{ fontFamily: F.serif, fontStyle: 'italic', color: C.muted }}>
            No one seated here yet.
          </li>
        )}
      </ul>

      {sheet && (
        <button
          type="button" onClick={onClose}
          style={{
            marginTop: '1.1rem', width: '100%', padding: '0.8rem',
            background: 'none', border: `1px solid ${C.rule}`, cursor: 'pointer',
            ...label(C.muted, '0.62rem'),
          }}
        >
          Close
        </button>
      )}
    </div>
  );
}

function EntryRow({
  entry, highlighted, editing, tables, currentTableId,
  onRename, onMove, onDragStart, onDragEnd,
}: {
  entry: SeatEntry;
  highlighted: boolean;
  editing: boolean;
  tables: SeatingTable[];
  currentTableId: string;
  onRename(name: string): void;
  onMove(tableId: string): void;
  onDragStart(): void;
  onDragEnd(): void;
}) {
  const [draftName, setDraftName] = useState(entry.name);
  const [open, setOpen] = useState(false);

  return (
    <li
      style={{
        borderBottom: `1px solid ${C.rule}`,
        padding: '0.6rem 0.5rem',
        background: highlighted ? '#f6ecd0' : 'transparent',
        marginLeft: highlighted ? '-0.5rem' : 0,
        marginRight: highlighted ? '-0.5rem' : 0,
        paddingLeft: highlighted ? '0.5rem' : '0.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {editing && (
          // Drag handle. Only rendered in edit mode, so a guest never sees it.
          <span
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            aria-hidden
            title="Drag onto a table"
            style={{ cursor: 'grab', color: C.faint, fontSize: '1rem', lineHeight: 1, userSelect: 'none' }}
          >
            ⠿
          </span>
        )}

        <span style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              value={draftName}
              onChange={(ev) => setDraftName(ev.target.value)}
              onBlur={() => draftName !== entry.name && onRename(draftName)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
              aria-label={`Name for ${entry.name}`}
              style={{
                width: '100%', boxSizing: 'border-box', fontSize: '1rem',
                fontFamily: F.serif, color: C.ink, background: 'transparent',
                border: 0, borderBottom: `1px dashed ${C.rule}`, padding: '0.15rem 0', outline: 'none',
              }}
            />
          ) : (
            <span style={{ fontFamily: F.serif, fontSize: '1.02rem', color: C.ink, lineHeight: 1.35 }}>
              {entry.name}
            </span>
          )}

          {/* Seat count only where it is not 1 — otherwise it is noise on
              every row. The ambiguity marker earns its place though. */}
          {(entry.seats > 1 || entry.ambiguous || entry.renamed) && (
            <span style={{
              display: 'block', fontFamily: F.sans, fontSize: '0.6rem',
              letterSpacing: '0.1em', color: entry.ambiguous ? '#9a5b33' : C.muted,
              marginTop: '0.2rem',
            }}>
              {entry.seats > 1 && `${entry.seats} seats`}
              {entry.seats > 1 && entry.provenance === 'inferred' && ' (inferred)'}
              {entry.ambiguous && ' · names 2 people, seated as 1 — unresolved'}
              {entry.renamed && ' · edited'}
            </span>
          )}
        </span>

        {editing && (
          <button
            type="button" onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            style={{
              background: 'none', border: `1px solid ${C.rule}`, cursor: 'pointer',
              padding: '0.3rem 0.5rem', ...label(C.muted, '0.55rem'),
            }}
          >
            Move
          </button>
        )}
      </div>

      {editing && open && (
        <select
          autoFocus
          defaultValue=""
          onChange={(ev) => { if (ev.target.value) { onMove(ev.target.value); setOpen(false); } }}
          aria-label={`Move ${entry.name} to another table`}
          style={{
            marginTop: '0.5rem', width: '100%', fontSize: '0.9rem',
            fontFamily: F.sans, padding: '0.5rem', background: C.paper,
            border: `1px solid ${C.rule}`, color: C.ink,
          }}
        >
          <option value="">Move to…</option>
          {tables
            .filter((t) => t.id !== currentTableId)
            .map((t) => {
              const free = seatsFree(t);
              const fits = free >= entry.seats;
              return (
                <option key={t.id} value={t.id} disabled={!fits}>
                  {tableLongLabel(t)} · {seatsUsed(t)}/{t.capacity}
                  {fits ? '' : ` — no room for ${entry.seats}`}
                </option>
              );
            })}
        </select>
      )}
    </li>
  );
}
