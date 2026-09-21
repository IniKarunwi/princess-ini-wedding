/**
 * Find My Seat — the public version.
 *
 * ── What makes this different from the planner's search ────────────────────
 * The planner's panel searches a layout it already holds. This one holds
 * nothing: the published room arrives with no guest names in it at all, and
 * every question goes to /api/seating/lookup, which answers about one person.
 *
 * So there is no guest list in this browser to leak, no table manifest to
 * open, and no way to read anybody's seat but the one whose name was typed.
 * That is a property of what is sent over the network, not of what this
 * component chooses to render.
 *
 * ── Ambiguity is handed back, not guessed ──────────────────────────────────
 * "Mrs Adeyemi" might be three people. Picking one and announcing a table
 * would be wrong twice over: wrong for the guest, and it would tell them
 * where two strangers are sitting. So several matches come back as NAMES
 * ONLY, and the table number arrives after they say which one is them.
 */

import { useRef, useState } from 'react';
import { seatingService, type SeatLookup } from '../service';
import { C, F, label } from '../theme';

export default function PublicFindYourSeat({
  onFound, compact,
}: {
  /** Highlights the table on the schematic. */
  onFound(tableId: string): void;
  compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SeatLookup | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ask = async (query: { q?: string; id?: string }) => {
    setBusy(true);
    const res = await seatingService.lookup(query);
    setBusy(false);
    setResult(res);
    if (res.kind === 'found') onFound(res.tableId);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!busy) void ask({ q });
  };

  const again = () => {
    setResult(null);
    setQ('');
    inputRef.current?.focus();
  };

  return (
    <div>
      <p style={label()}>Find My Seat</p>
      {!compact && (
        <p style={{
          fontFamily: F.serif, fontStyle: 'italic', fontSize: '1.05rem',
          color: C.muted, margin: '0.6rem 0 1.1rem',
        }}>
          Search your name to find your table.
        </p>
      )}

      {/* ── The confirmation ─────────────────────────────────────────── */}
      {result?.kind === 'found' ? (
        <div style={{
          background: C.paper, border: `1px solid ${C.goldSoft}`,
          borderTop: `3px solid ${C.goldSoft}`, padding: '1.1rem 1rem',
        }}>
          <p style={{
            fontFamily: F.serif, fontSize: '1.05rem', lineHeight: 1.5,
            color: C.green, margin: 0,
          }}>
            Thanks for honouring our invite, your seat is confirmed.
          </p>
          <p style={{
            fontFamily: F.serif, fontSize: '2.1rem', lineHeight: 1.1,
            color: C.green, margin: '0.8rem 0 0.2rem',
          }}>
            {result.vip ? 'The VIP table' : `You're on Table ${result.table}.`}
          </p>
          <p style={{
            fontFamily: F.sans, fontSize: '0.7rem', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: C.gold, margin: '0 0 0.9rem',
          }}>
            {result.name}
          </p>
          <p style={{
            fontFamily: F.sans, fontSize: '0.78rem', lineHeight: 1.7,
            color: C.ink, margin: 0,
          }}>
            Just give your name at the door and you'll be directed to your table.
            It is highlighted on the plan.
          </p>
          <button type="button" onClick={again} style={{ ...ghost, marginTop: '0.9rem' }}>
            Search another name
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div style={{ position: 'relative', marginTop: compact ? '0.7rem' : 0 }}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); if (result) setResult(null); }}
              placeholder="Enter your name"
              aria-label="Enter your name"
              autoComplete="off"
              style={{
                width: '100%', boxSizing: 'border-box',
                // 16px minimum: anything smaller and iOS Safari zooms the page
                // on focus, throwing the guest out of the map they were reading.
                fontSize: '1rem',
                fontFamily: F.serif, color: C.ink,
                padding: '0.85rem 0.9rem',
                background: C.paper,
                border: `1px solid ${C.rule}`, borderRadius: 2, outline: 'none',
              }}
            />
          </div>
          <button type="submit" disabled={busy} style={{ ...solid, marginTop: '0.7rem' }}>
            {busy ? 'Looking…' : 'Find My Seat'}
          </button>
        </form>
      )}

      {/* ── Several people share that name ───────────────────────────── */}
      {result?.kind === 'choices' && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{
            fontFamily: F.serif, fontSize: '1rem', color: C.ink, margin: '0 0 0.2rem',
          }}>
            We found a few matching names.
          </p>
          <p style={{
            fontFamily: F.sans, fontSize: '0.72rem', lineHeight: 1.6,
            color: C.muted, margin: '0 0 0.6rem',
          }}>
            Choose yours and we'll show your table.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {result.choices.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void ask({ id: c.id })}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: 'none', border: 0,
                    borderBottom: `1px solid ${C.rule}`,
                    padding: '0.75rem 0.2rem',
                    fontFamily: F.serif, fontSize: '1.05rem', color: C.ink,
                    display: 'flex', alignItems: 'baseline', gap: '0.7rem',
                  }}
                >
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span aria-hidden style={{ color: C.gold, fontSize: '1.1rem' }}>→</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result?.kind === 'none' && (
        <p role="status" style={note}>
          We couldn't find that name. Please check the spelling, or speak with a
          member of the wedding team when you arrive.
        </p>
      )}

      {result?.kind === 'too-many' && (
        <p role="status" style={note}>
          That matches too many names. Try adding your surname.
        </p>
      )}

      {result?.kind === 'too-short' && (
        <p role="status" style={note}>
          Please type at least {result.min} letters of your name.
        </p>
      )}

      {result?.kind === 'error' && (
        <p role="status" style={note}>{result.reason}</p>
      )}
    </div>
  );
}

const note: React.CSSProperties = {
  fontFamily: F.serif, fontStyle: 'italic', color: C.muted,
  margin: '1rem 0 0', fontSize: '0.98rem', lineHeight: 1.6,
};

const solid: React.CSSProperties = {
  ...label(C.green, '0.6rem'),
  background: C.goldSoft, border: `1px solid ${C.goldSoft}`,
  padding: '0.8rem 1.1rem', cursor: 'pointer', width: '100%',
};

const ghost: React.CSSProperties = {
  ...label(C.green, '0.58rem'),
  background: 'none', border: `1px solid ${C.rule}`,
  padding: '0.5rem 0.8rem', cursor: 'pointer',
};
