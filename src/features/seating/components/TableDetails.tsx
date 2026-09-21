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
  onRenumber, onSwapNumbers, numberConflict, onClearConflict, notice, durable,
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
  onRenumber(tableId: string, next: number): void;
  onSwapNumbers(aId: string, bId: string): void;
  numberConflict: { tableId: string; next: number; conflictId: string } | null;
  onClearConflict(): void;
  notice: string | null;
  /** False while planner edits live only in this browser. */
  durable: boolean;
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

      {/* Renumbering. Planner only, round tables only — the VIP slabs, the
          sweetheart table and the doors are not numbered tables. */}
      {editing && table.kind === 'round' && (
        <RenumberField
          table={table}
          allTables={allTables}
          onRenumber={onRenumber}
          onSwapNumbers={onSwapNumbers}
          conflict={numberConflict?.tableId === table.id ? numberConflict : null}
          onClearConflict={onClearConflict}
          notice={notice}
          durable={durable}
          error={error}
        />
      )}

      {error && !(editing && table.kind === 'round') && (
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

/**
 * The table-number field.
 *
 * ── Renumbering is not moving ──────────────────────────────────────────────
 * Deliberately a separate, explicit action with its own Update button. A
 * planner drags a table to change WHERE it is and edits this to change what
 * it is CALLED, and neither ever implies the other. Nothing here renumbers
 * tables automatically because something was dragged.
 *
 * ── The conflict is an offer, not a wall ───────────────────────────────────
 * Refusing a duplicate and stopping there would leave a planner who has just
 * physically swapped two tables with no way forward but to invent a spare
 * number, apply it, then go and fix the other table. So the refusal comes
 * with the thing they actually wanted: swap the two numbers. Positions and
 * guests stay exactly where they are — only the labels trade places.
 */
function RenumberField({
  table, allTables, onRenumber, onSwapNumbers, conflict, onClearConflict, notice, durable, error,
}: {
  table: SeatingTable;
  allTables: SeatingTable[];
  onRenumber(tableId: string, next: number): void;
  onSwapNumbers(aId: string, bId: string): void;
  conflict: { tableId: string; next: number; conflictId: string } | null;
  onClearConflict(): void;
  notice: string | null;
  durable: boolean;
  error: string | null;
}) {
  // Keyed on the table id AND its number so the field resets when the planner
  // selects a different table, or when an undo rolls a number back.
  const [value, setValue] = useState(String(table.number));
  const [touchedId, setTouchedId] = useState(`${table.id}:${table.number}`);
  const key = `${table.id}:${table.number}`;
  if (key !== touchedId) {
    setTouchedId(key);
    setValue(String(table.number));
  }

  const parsed = Number(value);
  const changed = value.trim() !== '' && parsed !== table.number;
  const other = conflict ? allTables.find((t) => t.id === conflict.conflictId) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed) return;
    onRenumber(table.id, parsed);
  };

  return (
    <div style={{
      marginTop: '1rem', padding: '0.8rem 0.9rem',
      background: C.ivory, border: `1px solid ${C.rule}`,
    }}>
      <form onSubmit={submit} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'block' }}>
          <span style={{ ...label(C.muted, '0.55rem'), display: 'block', marginBottom: '0.4rem' }}>
            Table Number
          </span>
          <input
            value={value}
            onChange={(ev) => { setValue(ev.target.value.replace(/[^\d]/g, '')); onClearConflict(); }}
            inputMode="numeric"
            aria-label={`Table number for ${tableLabel(table)}`}
            style={{
              width: 76, textAlign: 'center',
              // 16px: anything smaller and iOS Safari zooms the page on focus.
              fontSize: '1rem', fontFamily: F.serif, color: C.ink,
              padding: '0.5rem 0.4rem', background: C.paper,
              border: `1px solid ${conflict ? '#c2603f' : C.rule}`, outline: 'none',
            }}
          />
        </label>
        <button
          type="submit"
          disabled={!changed}
          style={{
            ...label(changed ? C.green : C.faint, '0.58rem'),
            background: 'none', border: `1px solid ${changed ? C.green : C.rule}`,
            padding: '0.55rem 0.9rem', cursor: changed ? 'pointer' : 'not-allowed',
          }}
        >
          Update
        </button>
      </form>

      {conflict && other && (
        <div style={{ marginTop: '0.7rem' }}>
          <p style={{
            fontFamily: F.sans, fontSize: '0.72rem', lineHeight: 1.5,
            color: '#8c3d22', margin: 0,
          }}>
            {error ?? `Table ${String(conflict.next).padStart(2, '0')} already exists on this side.`}
          </p>
          <button
            type="button"
            onClick={() => onSwapNumbers(table.id, other.id)}
            style={{
              ...label(C.green, '0.58rem'), marginTop: '0.6rem',
              background: C.goldSoft, border: `1px solid ${C.goldSoft}`,
              padding: '0.55rem 0.9rem', cursor: 'pointer',
            }}
          >
            Swap table numbers
          </button>
          <p style={{
            fontFamily: F.serif, fontStyle: 'italic', fontSize: '0.85rem',
            color: C.muted, margin: '0.5rem 0 0', lineHeight: 1.6,
          }}>
            {tableLabel(table)} becomes {String(conflict.next).padStart(2, '0')} and that table
            becomes {String(table.number).padStart(2, '0')}. Nobody moves seat and no table
            moves position — only the numbers trade places.
          </p>
        </div>
      )}

      {error && !conflict && (
        <p style={{
          fontFamily: F.sans, fontSize: '0.72rem', lineHeight: 1.5,
          color: '#8c3d22', margin: '0.7rem 0 0',
        }}>
          {error}
        </p>
      )}

      {notice && !conflict && (
        <p style={{
          fontFamily: F.serif, fontStyle: 'italic', fontSize: '0.85rem',
          color: C.muted, margin: '0.7rem 0 0', lineHeight: 1.6,
        }}>
          {notice}
        </p>
      )}

      {/* Never let a planner believe a renumber is safely stored when it is
          sitting in one browser's localStorage. */}
      {!durable && (
        <p style={{
          fontFamily: F.sans, fontSize: '0.64rem', lineHeight: 1.6,
          color: C.muted, margin: '0.7rem 0 0',
        }}>
          Saved in this browser only, like every other planner edit — and only
          reaches guests once you Publish.
        </p>
      )}
    </div>
  );
}
