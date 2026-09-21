/**
 * The admin bar.
 *
 * Two jobs, and it is careful about both.
 *
 * 1. Say plainly which layout is on screen. "Draft — unpublished changes" is
 *    the single most important sentence on this page for a planner: it is the
 *    difference between fiddling with a plan and accidentally rearranging the
 *    room for 250 guests.
 *
 * 2. Be honest about what it is. The PIN is in the bundle and the draft is in
 *    localStorage, so this panel says so rather than projecting the calm of a
 *    real admin console. See auth.ts and service.ts.
 *
 * None of this renders for a guest — the parent only mounts it once the
 * session is unlocked, so there is no editing chrome to discover.
 */

import { useState } from 'react';
import { C, F, label } from '../theme';
import { SOURCE_FLAGS, SOURCE_NOTE } from '../data/seatingSource';

export function AdminUnlock({ onUnlock }: { onUnlock(pin: string): boolean }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUnlock(pin)) { setBad(true); setPin(''); }
  };

  return (
    <form onSubmit={submit} style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
    }}>
      <span style={label(C.muted, '0.58rem')}>Planners</span>
      <input
        value={pin}
        onChange={(e) => { setPin(e.target.value); setBad(false); }}
        inputMode="numeric"
        autoComplete="off"
        placeholder="PIN"
        aria-label="Admin PIN"
        aria-invalid={bad}
        style={{
          width: 88, fontSize: '1rem', fontFamily: F.sans, letterSpacing: '0.3em',
          textAlign: 'center', padding: '0.45rem 0.3rem', background: C.paper,
          border: `1px solid ${bad ? '#c2603f' : C.rule}`, color: C.ink, outline: 'none',
        }}
      />
      <button type="submit" style={btn(false)}>Unlock</button>
      {bad && (
        <span style={{ fontFamily: F.sans, fontSize: '0.68rem', color: '#8c3d22' }}>
          Not that one.
        </span>
      )}
    </form>
  );
}

export function AdminBar({
  dirty, canUndo, canRedo, saving, lastAction, version, durable, realAuth,
  onUndo, onRedo, onSave, onPublish, onDiscard, onLock,
}: {
  dirty: boolean; canUndo: boolean; canRedo: boolean; saving: boolean;
  lastAction: string | null; version: number; durable: boolean; realAuth: boolean;
  onUndo(): void; onRedo(): void; onSave(): void;
  onPublish(): void; onDiscard(): void; onLock(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [showFlags, setShowFlags] = useState(false);

  return (
    <div style={{
      background: C.green, color: C.onDark,
      padding: '0.9rem 1rem', display: 'grid', gap: '0.8rem',
    }}>
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

        <button type="button" onClick={onLock} style={btn(true)}>Lock</button>
      </div>

      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', alignItems: 'center' }}>
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

      {/* The honest bit. Not buried in a tooltip. */}
      {(!durable || !realAuth) && (
        <p style={{
          fontFamily: F.sans, fontSize: '0.65rem', lineHeight: 1.6,
          color: '#e4b9a6', background: 'rgba(0,0,0,0.22)',
          border: '1px solid rgba(228,185,166,0.3)', padding: '0.6rem 0.7rem', margin: 0,
        }}>
          <strong>Prototype — not production.</strong>{' '}
          {!durable && 'Draft and published layouts are stored in this browser only: they are not shared between devices and will not reach guests on other phones. '}
          {!realAuth && 'The PIN is in the page source and stops nothing but accidents. '}
          Both need the backend integration described in service.ts before the day.
        </p>
      )}

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
