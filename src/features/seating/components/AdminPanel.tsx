/**
 * The planner bar.
 *
 * Three jobs now, and it is careful about all of them.
 *
 * 1. Say plainly which layout is on screen. "Draft — unpublished changes" is
 *    the single most important sentence on this page for a planner: it is the
 *    difference between fiddling with a plan and accidentally rearranging the
 *    room for 250 guests.
 *
 * 2. Say who did what. The draft is shared now, so "version 16, saved by
 *    Princess at 10:52" is the difference between trusting the plan and
 *    wondering whether it is yours.
 *
 * 3. Stop, loudly, when someone else got there first — and never merge.
 *
 * The prototype warning this used to carry is gone, because the thing it
 * warned about is fixed: the PIN is verified on the server and the layout is
 * in the database. A warning that no longer applies teaches people to ignore
 * warnings.
 *
 * None of this renders for a guest — the parent only mounts it once a planner
 * session exists, so there is no editing chrome to discover.
 */

import { useState } from 'react';
import { C, F, label } from '../theme';
import { SOURCE_FLAGS, SOURCE_NOTE } from '../data/seatingSource';
import type { Conflict } from '../useSeatingPlan';

/* ── Sign in ─────────────────────────────────────────────────────────────── */

/**
 * PIN and name together, in one step.
 *
 * The name is not a second credential and the copy says so — asked for once,
 * at the only moment somebody will actually type it, and used as the label on
 * every save afterwards.
 */
export function AdminUnlock({
  onUnlock,
}: {
  onUnlock(pin: string, name: string): Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await onUnlock(pin, name);
    setBusy(false);
    if (res.ok === false) { setProblem(res.error); setPin(''); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={quiet}>
        Planners
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
    }}>
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setProblem(null); }}
        autoComplete="off"
        placeholder="Your name"
        // Not just "Your name": the guest search field on the same page is
        // labelled "Search for your name", and two controls a screen reader
        // announces almost identically is a way to type a PIN into the wrong
        // box.
        aria-label="Your planner name"
        style={{ ...field, width: 130, letterSpacing: 'normal', textAlign: 'left' }}
      />
      <input
        value={pin}
        onChange={(e) => { setPin(e.target.value); setProblem(null); }}
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        placeholder="PIN"
        aria-label="Planner PIN"
        aria-invalid={!!problem}
        style={{ ...field, width: 88, borderColor: problem ? '#c2603f' : C.rule }}
      />
      <button type="submit" disabled={busy} style={btn(false, busy)}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
      {problem && (
        <span role="alert" style={{ fontFamily: F.sans, fontSize: '0.68rem', color: '#8c3d22' }}>
          {problem}
        </span>
      )}
    </form>
  );
}

/* ── The bar ─────────────────────────────────────────────────────────────── */

const clock = (iso: string | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export function AdminBar({
  dirty, canUndo, canRedo, saving, lastAction, version, draftVersion, draftBy,
  updatedAt, who, conflict,
  onUndo, onRedo, onSave, onPublish, onDiscard, onReload, onLock,
}: {
  dirty: boolean; canUndo: boolean; canRedo: boolean; saving: boolean;
  lastAction: string | null;
  /** The published version guests are looking at. */
  version: number;
  /** The shared draft's version. */
  draftVersion: number;
  /** Who last wrote the shared draft. */
  draftBy: string | null;
  /** When the shared draft was last written. */
  updatedAt: string | undefined;
  /** The signed-in planner's own name. */
  who: string | null;
  conflict: Conflict | null;
  onUndo(): void; onRedo(): void; onSave(): void;
  onPublish(): void; onDiscard(): void; onReload(): void; onLock(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [showFlags, setShowFlags] = useState(false);

  const at = clock(updatedAt);
  const audit = [
    `Version ${draftVersion}`,
    draftBy,
    at,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{
      background: C.green, color: C.onDark,
      padding: '0.9rem 1rem', display: 'grid', gap: '0.8rem',
    }}>
      {/* ── Someone else got there first ──────────────────────────────── */}
      {conflict && (
        <div role="alert" style={{
          background: '#7a2f18', border: '1px solid #e4b9a6',
          padding: '0.75rem 0.85rem', display: 'grid', gap: '0.55rem',
        }}>
          <p style={{ fontFamily: F.sans, fontSize: '0.72rem', lineHeight: 1.6, margin: 0, color: '#ffeade' }}>
            <strong>The seating plan has changed since you opened it.</strong>{' '}
            {conflict.by ? `${conflict.by} saved a newer version` : 'Another planner saved a newer version'}
            {conflict.current?.layout.updatedAt ? ` at ${clock(conflict.current.layout.updatedAt)}` : ''}.
            Nothing of yours was {conflict.during === 'publish' ? 'published' : 'saved'}, and nothing
            of theirs was overwritten — your changes are still on screen.
          </p>
          <p style={{ fontFamily: F.sans, fontSize: '0.66rem', lineHeight: 1.6, margin: 0, color: '#e9c9b9' }}>
            Loading the latest draft will replace what is on screen, so note anything
            you still need first. The two versions are not merged: the room is a
            physical thing and only a person can decide which arrangement is right.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={onReload} style={btnGold()}>Load the latest draft</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <span style={{
          ...label(dirty ? '#f0d69a' : C.onDarkDim, '0.58rem'),
          border: `1px solid ${dirty ? '#f0d69a' : 'rgba(239,230,207,0.3)'}`,
          padding: '0.35rem 0.6rem',
        }}>
          {dirty ? 'Draft — unpublished changes' : `Published · v${version}`}
        </span>

        <span style={{ flex: 1 }} />

        <button type="button" onClick={onUndo} disabled={!canUndo} style={btn(true, !canUndo)}>↶ Undo</button>
        <button type="button" onClick={onRedo} disabled={!canRedo} style={btn(true, !canRedo)}>↷ Redo</button>
        <button type="button" onClick={onSave} disabled={saving} style={btn(true, saving)}>Save draft</button>

        {confirming ? (
          <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ fontFamily: F.sans, fontSize: '0.68rem', color: '#f0d69a' }}>
              Make this public?
            </span>
            <button type="button" onClick={() => { onPublish(); setConfirming(false); }} style={btnGold()}>
              Yes, publish
            </button>
            <button type="button" onClick={() => setConfirming(false)} style={btn(true)}>Cancel</button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!dirty || saving}
            style={btnGold(!dirty || saving)}
          >
            Publish changes
          </button>
        )}

        <button type="button" onClick={onLock} style={btn(true)}>
          {who ? `Sign out ${who}` : 'Sign out'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* The audit line: "Version 16 · Princess · 10:52". Who saved the
            shared draft, and when — not the same thing as who is signed in. */}
        <span style={{ fontFamily: F.sans, fontSize: '0.66rem', color: C.onDarkDim }}>
          Shared draft · {audit}
        </span>
        {lastAction && (
          <span style={{ fontFamily: F.sans, fontSize: '0.66rem', color: '#f0d69a' }}>
            {lastAction}
          </span>
        )}
        {dirty && (
          <button type="button" onClick={onDiscard} style={{
            ...btn(true), borderColor: 'rgba(239,230,207,0.25)',
          }}>
            Discard draft
          </button>
        )}
        <button type="button" onClick={() => setShowFlags((s) => !s)} style={btn(true)}>
          Source notes ({SOURCE_FLAGS.length})
        </button>
      </div>

      {showFlags && (
        <div style={{
          background: 'rgba(0,0,0,0.2)', padding: '0.7rem 0.8rem',
          fontFamily: F.sans, fontSize: '0.66rem', lineHeight: 1.7, color: C.onDark,
        }}>
          <p style={{ margin: '0 0 0.5rem', color: '#f0d69a' }}>{SOURCE_NOTE}</p>
          <ul style={{ margin: 0, paddingLeft: '1rem' }}>
            {SOURCE_FLAGS.map((f) => <li key={f} style={{ marginBottom: '0.3rem' }}>{f}</li>)}
          </ul>
          <p style={{ margin: '0.6rem 0 0', color: C.onDarkDim }}>
            None of these were resolved automatically. Seats are counted exactly
            as the document wrote them.
          </p>
        </div>
      )}
    </div>
  );
}

const field: React.CSSProperties = {
  fontSize: '1rem', fontFamily: F.sans, letterSpacing: '0.3em',
  textAlign: 'center', padding: '0.45rem 0.5rem', background: C.paper,
  border: `1px solid ${C.rule}`, color: C.ink, outline: 'none',
};

const quiet: React.CSSProperties = {
  ...label(C.muted, '0.58rem'),
  background: 'none', border: `1px solid ${C.rule}`,
  padding: '0.4rem 0.7rem', cursor: 'pointer',
};

const btn = (onDark: boolean, disabled = false): React.CSSProperties => ({
  ...label(onDark ? C.onDark : C.green, '0.58rem'),
  background: 'none',
  border: `1px solid ${onDark ? 'rgba(239,230,207,0.4)' : C.rule}`,
  padding: '0.45rem 0.7rem',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
});

const btnGold = (disabled = false): React.CSSProperties => ({
  ...label(C.green, '0.58rem'),
  background: disabled ? 'rgba(201,168,108,0.35)' : C.goldSoft,
  border: `1px solid ${C.goldSoft}`,
  padding: '0.45rem 0.8rem',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
});
