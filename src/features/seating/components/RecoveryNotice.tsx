/**
 * "Unsynced planner changes found on this device."
 *
 * Shown to a signed-in planner whose browser still holds a draft from before
 * the plan moved to the server, when that draft would actually change the
 * room. Three ways out, and none of them destroys anything:
 *
 *   Review local changes  — shows what differs, then leaves the choice open.
 *   Upload as shared draft — the normal save, version check and all, so it
 *                            cannot bulldoze work another planner just did.
 *   Use the shared draft   — dismisses the notice. The local copy STAYS in
 *                            localStorage. Nobody has yet confirmed the
 *                            migration went well, and the cost of keeping a
 *                            stale key is nothing next to the cost of being
 *                            wrong about that.
 */

import { useMemo, useState } from 'react';
import type { Layout } from '../types';
import { C, F, label } from '../theme';
import { tableLongLabel } from '../types';

/** A readable account of what the local copy would change. */
function describeDifference(local: Layout, shared: Layout): string[] {
  const byId = new Map(shared.tables.map((t) => [t.id, t]));
  const notes: string[] = [];

  for (const t of local.tables) {
    const s = byId.get(t.id);
    if (!s) { notes.push(`${tableLongLabel(t)} is not in the shared draft`); continue; }

    if (t.number !== s.number) {
      notes.push(`${tableLongLabel(s)} is numbered ${String(t.number).padStart(2, '0')} here`);
    }
    if (Math.round(t.x) !== Math.round(s.x) || Math.round(t.y) !== Math.round(s.y)) {
      notes.push(`${tableLongLabel(s)} sits somewhere else here`);
    }

    const here = new Set(t.entries.map((e) => e.id));
    const there = new Set(s.entries.map((e) => e.id));
    const added = t.entries.filter((e) => !there.has(e.id)).map((e) => e.name);
    const gone = s.entries.filter((e) => !here.has(e.id)).map((e) => e.name);
    if (added.length) notes.push(`${tableLongLabel(s)} · ${added.join(', ')} seated here`);
    if (gone.length) notes.push(`${tableLongLabel(s)} · ${gone.join(', ')} not seated here`);

    for (const e of t.entries) {
      const o = s.entries.find((x) => x.id === e.id);
      if (o && o.name !== e.name) notes.push(`"${o.name}" is named "${e.name}" here`);
    }
  }
  return notes;
}

export default function RecoveryNotice({
  local, shared, savedAt, busy, onUpload, onUseShared,
}: {
  local: Layout;
  shared: Layout;
  savedAt: string;
  busy: boolean;
  onUpload(): void;
  onUseShared(): void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const diff = useMemo(() => describeDifference(local, shared), [local, shared]);

  const when = (() => {
    const d = new Date(savedAt);
    return Number.isNaN(d.getTime())
      ? 'an earlier session'
      : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  })();

  return (
    <div role="region" aria-label="Unsynced planner changes" style={{
      background: '#fdf4e3', borderBottom: `1px solid ${C.rule}`,
      borderTop: `3px solid ${C.goldSoft}`, padding: '0.9rem 1rem',
      display: 'grid', gap: '0.6rem',
    }}>
      <p style={{ ...label(C.green, '0.58rem'), margin: 0 }}>
        Unsynced planner changes found on this device
      </p>
      <p style={{ fontFamily: F.sans, fontSize: '0.74rem', lineHeight: 1.65, margin: 0, color: C.ink }}>
        This browser still holds a seating draft from {when}, made before the plan
        moved to the shared server. It differs from the shared draft in{' '}
        {diff.length} {diff.length === 1 ? 'way' : 'ways'}. Nothing has been
        changed or removed — decide which you want to keep.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setReviewing((r) => !r)} style={ghost}>
          {reviewing ? 'Hide local changes' : 'Review local changes'}
        </button>
        <button type="button" onClick={onUpload} disabled={busy} style={solid(busy)}>
          Upload as shared draft
        </button>
        <button type="button" onClick={onUseShared} style={ghost}>
          Use shared draft
        </button>
      </div>

      {reviewing && (
        <div style={{
          background: C.paper, border: `1px solid ${C.rule}`, padding: '0.7rem 0.8rem',
          maxHeight: 220, overflowY: 'auto',
        }}>
          <ul style={{
            margin: 0, paddingLeft: '1.1rem',
            fontFamily: F.sans, fontSize: '0.7rem', lineHeight: 1.8, color: C.ink,
          }}>
            {diff.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}

      <p style={{ fontFamily: F.sans, fontSize: '0.64rem', lineHeight: 1.6, margin: 0, color: C.muted }}>
        "Use shared draft" only hides this message. The copy on this device is kept
        until somebody clears this browser deliberately.
      </p>
    </div>
  );
}

const ghost: React.CSSProperties = {
  ...label(C.green, '0.58rem'),
  background: 'none', border: `1px solid ${C.rule}`,
  padding: '0.45rem 0.75rem', cursor: 'pointer',
};

const solid = (busy: boolean): React.CSSProperties => ({
  ...label(C.green, '0.58rem'),
  background: C.goldSoft, border: `1px solid ${C.goldSoft}`,
  padding: '0.45rem 0.85rem',
  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.55 : 1,
});
