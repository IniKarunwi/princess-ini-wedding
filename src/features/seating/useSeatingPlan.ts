/**
 * The seating plan's state.
 *
 * ── Two layouts, always ────────────────────────────────────────────────────
 * `published` is what a guest sees. `draft` is what an admin edits. They are
 * separate objects and an edit only ever touches the draft. This is the whole
 * product, so it is modelled at the top rather than bolted on: there is no
 * code path that can write to `published` except publish().
 *
 * Which one the map renders is decided by the viewer, not by the data — a
 * guest is shown `published` even while an admin on the same device has a
 * draft full of changes.
 *
 * ── Undo/redo ──────────────────────────────────────────────────────────────
 * Snapshots, not inverse operations. Every mutation in model.ts is pure and
 * returns a new layout, so "undo" is "show the previous one". Inverse
 * operations are where undo bugs live: every new operation needs a matching
 * inverse and the first one anybody forgets corrupts the room silently.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Layout } from './types';
import { hasUnpublishedChanges, moveEntry, moveTable, renameEntry,
         renumberTable, swapTableNumbers } from './model';
import { seatingService } from './service';

const HISTORY_LIMIT = 60;

export interface SeatingPlan {
  loading: boolean;
  published: Layout | null;
  draft: Layout | null;
  /** The layout the current viewer should see. */
  visible: Layout | null;

  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  /** Set briefly after a save or publish, for the confirmation line. */
  lastAction: string | null;
  /** Set when an edit was refused, e.g. by capacity. Cleared on the next edit. */
  error: string | null;

  moveTableTo(tableId: string, x: number, y: number): void;
  moveGuestTo(entryId: string, tableId: string): void;
  renameGuest(entryId: string, name: string): void;

  /** Changes a round table's displayed number. Never moves anyone. */
  renumber(tableId: string, next: number): void;
  /** Trades two tables' numbers. Positions and guests stay put. */
  swapNumbers(aId: string, bId: string): void;
  /**
   * Set when a renumber was refused because the number is taken on that
   * side. Carries the other table's id so the UI can offer a swap.
   */
  numberConflict: { tableId: string; next: number; conflictId: string } | null;
  clearNumberConflict(): void;
  /** Non-blocking note from the last renumber, e.g. a cross-side duplicate. */
  notice: string | null;

  undo(): void;
  redo(): void;
  saveDraft(): Promise<void>;
  publish(): Promise<void>;
  discardDraft(): Promise<void>;
}

export function useSeatingPlan(viewerIsAdmin: boolean): SeatingPlan {
  const [published, setPublished] = useState<Layout | null>(null);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Set when a renumber was refused because that number is already taken on
   * the same side. Carries the other table's id so the panel can offer a
   * swap rather than leaving the planner stuck.
   */
  const [numberConflict, setNumberConflict] =
    useState<{ tableId: string; next: number; conflictId: string } | null>(null);

  /** Non-blocking remark from the last renumber, e.g. a cross-side duplicate. */
  const [notice, setNotice] = useState<string | null>(null);

  // Snapshots either side of the current draft.
  const past = useRef<Layout[]>([]);
  const future = useRef<Layout[]>([]);
  // History changes through refs, which React will not re-render for.
  const [historyTick, bumpHistory] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const [p, d] = await Promise.all([
        seatingService.loadPublished(),
        seatingService.loadDraft(),
      ]);
      if (!live) return;
      setPublished(p);
      setDraft(d);
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  /** Applies a pure mutation to the draft and records it for undo. */
  const commit = useCallback((next: Layout | null) => {
    if (!next) return;
    setDraft((cur) => {
      if (cur) {
        past.current = [...past.current, cur].slice(-HISTORY_LIMIT);
        future.current = [];
      }
      return next;
    });
    bumpHistory((n) => n + 1);
    setLastAction(null);
  }, []);

  const moveTableTo = useCallback((tableId: string, x: number, y: number) => {
    setError(null);
    setDraft((cur) => {
      if (!cur) return cur;
      past.current = [...past.current, cur].slice(-HISTORY_LIMIT);
      future.current = [];
      bumpHistory((n) => n + 1);
      return moveTable(cur, tableId, x, y);
    });
    setLastAction(null);
  }, []);

  const moveGuestTo = useCallback((entryId: string, tableId: string) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const res = moveEntry(cur, entryId, tableId);
      if (!res.ok) { setError(res.reason); return cur; }
      setError(null);
      past.current = [...past.current, cur].slice(-HISTORY_LIMIT);
      future.current = [];
      bumpHistory((n) => n + 1);
      return res.layout;
    });
    setLastAction(null);
  }, []);

  const renameGuest = useCallback((entryId: string, name: string) => {
    setError(null);
    commit(draft ? renameEntry(draft, entryId, name) : null);
  }, [draft, commit]);

  const renumber = useCallback((tableId: string, next: number) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const res = renumberTable(cur, tableId, next);
      if (!res.ok) {
        setError(res.reason);
        setNotice(null);
        setNumberConflict(res.conflictId && res.canSwap
          ? { tableId, next, conflictId: res.conflictId }
          : null);
        return cur;
      }
      setError(null);
      setNumberConflict(null);
      setNotice(res.note ?? null);
      if (res.layout === cur) return cur;          // no-op renumber
      past.current = [...past.current, cur].slice(-HISTORY_LIMIT);
      future.current = [];
      bumpHistory((n) => n + 1);
      return res.layout;
    });
    setLastAction(null);
  }, []);

  const swapNumbers = useCallback((aId: string, bId: string) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const res = swapTableNumbers(cur, aId, bId);
      if (!res.ok) { setError(res.reason); return cur; }
      setError(null);
      setNumberConflict(null);
      setNotice(null);
      past.current = [...past.current, cur].slice(-HISTORY_LIMIT);
      future.current = [];
      bumpHistory((n) => n + 1);
      return res.layout;
    });
    setLastAction(null);
  }, []);

  const clearNumberConflict = useCallback(() => {
    setNumberConflict(null);
    setError(null);
  }, []);

  const undo = useCallback(() => {
    setDraft((cur) => {
      const prev = past.current[past.current.length - 1];
      if (!prev || !cur) return cur;
      past.current = past.current.slice(0, -1);
      future.current = [cur, ...future.current].slice(0, HISTORY_LIMIT);
      bumpHistory((n) => n + 1);
      return prev;
    });
    setError(null);
  }, []);

  const redo = useCallback(() => {
    setDraft((cur) => {
      const next = future.current[0];
      if (!next || !cur) return cur;
      future.current = future.current.slice(1);
      past.current = [...past.current, cur].slice(-HISTORY_LIMIT);
      bumpHistory((n) => n + 1);
      return next;
    });
    setError(null);
  }, []);

  const saveDraft = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    await seatingService.saveDraft(draft);
    setSaving(false);
    // Deliberately not "Saved" — see service.ts. Telling a planner their work
    // is safe when it lives in one browser's localStorage would be a lie.
    setLastAction(seatingService.isDurable
      ? 'Draft saved'
      : 'Draft saved to this browser only');
  }, [draft]);

  const publish = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    const next = await seatingService.publish(draft);
    setPublished(next);
    setDraft({ ...structuredClone(next), status: 'draft' });
    past.current = [];
    future.current = [];
    bumpHistory((n) => n + 1);
    setSaving(false);
    setLastAction(`Published · version ${next.version}`);
  }, [draft]);

  const discardDraft = useCallback(async () => {
    if (!published) return;
    const fresh: Layout = { ...structuredClone(published), status: 'draft' };
    await seatingService.saveDraft(fresh);
    setDraft(fresh);
    past.current = [];
    future.current = [];
    bumpHistory((n) => n + 1);
    setLastAction('Draft discarded');
  }, [published]);

  const dirty = useMemo(
    () => (draft && published ? hasUnpublishedChanges(draft, published) : false),
    [draft, published],
  );

  // historyTick is read so the memo re-evaluates when the refs change.
  const canUndo = useMemo(() => { void historyTick; return past.current.length > 0; }, [historyTick]);
  const canRedo = useMemo(() => { void historyTick; return future.current.length > 0; }, [historyTick]);

  return {
    loading, published, draft,
    visible: viewerIsAdmin ? draft : published,
    dirty, canUndo, canRedo, saving, lastAction, error,
    moveTableTo, moveGuestTo, renameGuest,
    renumber, swapNumbers, numberConflict, clearNumberConflict, notice,
    undo, redo, saveDraft, publish, discardDraft,
  };
}
