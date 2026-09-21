/**
 * The search panel — the reason a guest opens this page at all.
 *
 * "Where am I sitting?" has to be answerable in under five seconds on a phone
 * at the door of a hall, so the field is the first thing focusable, matches
 * begin at two characters, and a result is one tap from flying the map to the
 * table.
 */

import { useMemo, useState } from 'react';
import type { Layout, SeatingTable } from '../types';
import { seatsUsed, tableLongLabel } from '../types';
import { searchGuests } from '../model';
import { C, F, label } from '../theme';

export default function FindYourSeat({
  layout, onPick, compact,
}: {
  layout: Layout;
  onPick(table: SeatingTable, entryId: string): void;
  compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchGuests(layout, q), [layout, q]);
  const searching = q.trim().length >= 2;

  return (
    <div>
      <p style={label()}>Find Your Seat</p>
      {!compact && (
        <p style={{
          fontFamily: F.serif, fontStyle: 'italic', fontSize: '1.05rem',
          color: C.muted, margin: '0.6rem 0 1.1rem',
        }}>
          A place for everyone at our table.
        </p>
      )}

      <div style={{ position: 'relative', marginTop: compact ? '0.7rem' : 0 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find your name…"
          aria-label="Search for your name"
          autoComplete="off"
          style={{
            width: '100%', boxSizing: 'border-box',
            // 16px minimum: anything smaller and iOS Safari zooms the page on
            // focus, which throws the guest out of the map they were reading.
            fontSize: '1rem',
            fontFamily: F.serif, color: C.ink,
            padding: '0.85rem 2.2rem 0.85rem 0.9rem',
            background: C.paper,
            border: `1px solid ${C.rule}`, borderRadius: 2, outline: 'none',
          }}
        />
        {q && (
          <button
            type="button" onClick={() => setQ('')} aria-label="Clear search"
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              width: 32, height: 32, border: 0, background: 'none', cursor: 'pointer',
              color: C.muted, fontSize: '1.1rem', lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {searching && hits.length === 0 && (
        <p style={{
          fontFamily: F.serif, fontStyle: 'italic', color: C.muted,
          margin: '1rem 0 0', fontSize: '0.98rem',
        }}>
          No one by that name yet. Try a surname, or ask an usher — they have
          the full list.
        </p>
      )}

      {hits.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0.9rem 0 0', padding: 0 }}>
          {hits.map((h) => {
            const t = h.table;
            const used = seatsUsed(t);
            return (
              <li key={h.entryId}>
                <button
                  type="button"
                  onClick={() => onPick(t, h.entryId)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: 'none', border: 0,
                    borderBottom: `1px solid ${C.rule}`,
                    padding: '0.75rem 0.2rem',
                    display: 'flex', alignItems: 'baseline', gap: '0.7rem',
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <span style={{
                      display: 'block', fontFamily: F.serif, fontSize: '1.1rem',
                      color: C.ink, lineHeight: 1.3,
                    }}>
                      {h.name}
                    </span>
                    <span style={{
                      display: 'block', fontFamily: F.sans, fontSize: '0.7rem',
                      letterSpacing: '0.1em', color: C.muted, marginTop: '0.2rem',
                    }}>
                      {tableLongLabel(t)} · {used}/{t.capacity} seats
                      {h.companions.length > 0 && ` · with ${h.companions[0]}`}
                      {h.companions.length > 1 && ` + ${h.companions.length - 1} others`}
                    </span>
                  </span>
                  <span aria-hidden style={{ color: C.gold, fontSize: '1.1rem' }}>→</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
