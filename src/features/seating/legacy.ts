/**
 * Drafts left behind in localStorage by the prototype.
 *
 * Before the server store, "Save draft" wrote to `pi.seating.draft.v1` in one
 * browser. Somewhere there is very likely a laptop holding an evening's work
 * that nobody else has ever seen.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * This code NEVER deletes that copy. Not when the planner chooses the shared
 * draft, not after a successful upload, not on a "dismiss". The worst outcome
 * here is not a stale key in localStorage; it is a planner clicking the wrong
 * button once and losing work that exists nowhere else. Dismissing only sets
 * a flag so the notice stops appearing, and the data stays exactly where it
 * is until somebody decides, deliberately and later, that the migration is
 * complete.
 *
 * ── Comparison ──────────────────────────────────────────────────────────────
 * The notice only appears when the local copy is MATERIALLY different from
 * the shared draft — same fingerprint as "unpublished changes" uses, so it
 * counts exactly what a guest would notice: table positions, table numbers,
 * and who is sitting at each one. A local copy that merely has an older
 * timestamp is not worth interrupting anyone for.
 */

import type { Layout } from './types';
import { hasUnpublishedChanges } from './model';

const KEY_DRAFT = 'pi.seating.draft.v1';
const KEY_PUB = 'pi.seating.published.v1';
const KEY_SEEN = 'pi.seating.legacy.seen.v1';

const read = (key: string): Layout | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Layout;
    return Array.isArray(parsed?.tables) && parsed.tables.length ? parsed : null;
  } catch {
    return null;   // blocked storage or corrupt JSON — treat as nothing found
  }
};

export interface LegacyDraft {
  layout: Layout;
  /** When that browser last saved it. */
  savedAt: string;
}

/** The old per-browser draft, if this device has one. Never modified. */
export function readLegacyDraft(): LegacyDraft | null {
  const layout = read(KEY_DRAFT) ?? read(KEY_PUB);
  if (!layout) return null;
  return { layout, savedAt: layout.updatedAt ?? 'an earlier session' };
}

export const legacyDismissed = (): boolean => {
  try { return window.localStorage.getItem(KEY_SEEN) === '1'; } catch { return false; }
};

/**
 * Stops the notice appearing again on this device.
 *
 * Note what this does NOT do: remove the draft. See the file header.
 */
export const dismissLegacy = () => {
  try { window.localStorage.setItem(KEY_SEEN, '1'); } catch { /* fine */ }
};

/** True when the local copy would actually change the room. */
export const legacyDiffers = (local: Layout, shared: Layout): boolean =>
  hasUnpublishedChanges(local, shared);
