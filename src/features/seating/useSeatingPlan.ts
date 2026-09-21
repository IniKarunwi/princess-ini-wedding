/**
 * The seating plan's state.
 *
 * ── Two layouts, always ────────────────────────────────────────────────────
 * `published` is what a guest sees. `draft` is what a planner edits. They are
 * separate objects and an edit only ever touches the draft. This is the whole
 * product, so it is modelled at the top rather than bolted on: there is no
 * code path that can write to `published` except publish().
 *
 * Which one the map renders is decided by the viewer, not by the data — a
 * guest is shown `published` even while a planner on the same device has a
 * draft full of changes.
 *
 * ── One draft, several planners ────────────────────────────────────────────
 * The draft now lives on the server and everyone shares it, so this hook
 * carries the version it loaded and sends it with every write. When the
 * server answers 409 the local edits are NOT thrown away and nothing is
 * merged: `conflict` is set, the planner is told the plan has moved on, and
 * they choose whether to reload. Silently discarding someone's work is the
 * one failure this design exists to prevent.
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
import { seatingService, type Loaded } from './service';

const HISTORY_LIMIT = 60;

/** Set when the server refused a write because the draft had moved on. */
export interface Conflict {
  /** What the planner was trying to do when they were refused. */
  during: 'save' | 'publish';
  /** Who got there first, when we know. */
  by: string | null;
  /** The draft as it now stands on the server. */
  current: Loaded | null;
}

export interface SeatingPlan {
  loading: boolean;
  /** Set when the plan could not be reached at all. */
  loadError: string | null;
  published: Layout | null;
  draft: Layout | null;
  /** The layout the current viewer should see. */
  visible: Layout | null;

  /** The shared draft's version, as last seen. Sent with every write. */
  draftVersion: number;
  /** Who last wrote the shared draft. */
  draftBy: string | null;

  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  /** Set briefly after a save or publish, for the confirmation line. */
  lastAction: string | null;
  /** Set when an edit was refused, e.g. by capacity. Cleared on the next edit. */
  error: string | null;
  /** Set when another planner got there first. Cleared by reloading. */
  conflict: Conflict | null;

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
  /** Throws away local edits and takes the server's draft. */
  reloadDraft(): Promise<void>;
  /** Uploads a recovered browser-local draft as the shared draft. */
  adoptLayout(layout: Layout): Promise<void>;
}

export function useSeatingPlan(viewerIsAdmin: boolean): SeatingPlan {
  const [published, setPublished] = useState<Layout | null>(null);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [draftVersion, setDraftVersion] = useState(1);
  const [draftBy, setDraftBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);

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

  const resetHistory = () => { past.current = []; future.current = []; };

  /**
   * Loads the published room, and the shared draft as well for a planner.
   *
   * A guest never asks for the draft: the request would be refused anyway,
   * and not making it keeps the page to one round trip.
   */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const pub = await seatingService.loadPublished();
        if (!live) return;
        setPublished(pub.layout);

        if (viewerIsAdmin) {
          const { draft: d, published: full } = await seatingService.loadDraft();
          if (!live) return;
          setDraft(d.layout);
          setDraftVersion(d.version);
          setDraftBy(d.updatedBy);
          // The planner's copy of the published layout, with guest names. The
          // public one above has them stripped, and comparing against that
          // would mark every table as changed forever.
          if (full) setPublished(full.layout);
        }
        setLoadError(null);
      } catch {
        if (live) setLoadError('The seating plan could not be loaded. Check the connection and refresh.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [viewerIsAdmin]);

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
      if (res.ok === false) { setError(res.reason); return cur; }
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
      // `res.ok === false` rather than `!res.ok`: this project compiles with
      // strictNullChecks off, and truthiness alone does not narrow a
      // discriminated union there. The explicit comparison does.
      if (res.ok === false) {
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
      if (res.ok === false) { setError(res.reason); return cur; }
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

  /**
   * Shared handling for a refused write. Returns true when the caller should
   * stop. Note what it never does: change `draft`. A planner whose save was
   * refused still has every one of their edits on screen.
   */
  const refused = useCallback((during: 'save' | 'publish', res: any): boolean => {
    if (res.ok) return false;
    if (res.kind === 'conflict') {
      setConflict({ during, by: res.current?.updatedBy ?? null, current: res.current ?? null });
      setLastAction(null);
    } else if (res.kind === 'auth') {
      setError('The planner session has ended. Sign in again — these changes are still on screen.');
    } else {
      setError(res.reason);
    }
    return true;
  }, []);

  const saveDraft = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    const res = await seatingService.saveDraft(draft, draftVersion);
    setSaving(false);
    if (refused('save', res)) return;
    if (!res.ok) return;
    setConflict(null);
    setDraftVersion(res.version);
    setDraftBy(res.updatedBy);
    setLastAction(`Draft saved · version ${res.version}`);
  }, [draft, draftVersion, refused]);

  const publish = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    // Publishing promotes what is IN the shared draft, so an unsaved edit has
    // to be saved first or it is not what goes live. Doing that here rather
    // than nagging the planner is the difference between a publish button
    // that works and one that quietly publishes yesterday.
    const saved = await seatingService.saveDraft(draft, draftVersion);
    if (refused('publish', saved)) { setSaving(false); return; }
    if (!saved.ok) { setSaving(false); return; }
    setDraftVersion(saved.version);

    const res = await seatingService.publish(saved.version);
    setSaving(false);
    if (refused('publish', res)) return;
    if (!res.ok) return;

    setConflict(null);
    setPublished(res.published.layout);
    if (res.draft) {
      setDraft(res.draft.layout);
      setDraftVersion(res.draft.version);
      setDraftBy(res.draft.updatedBy);
    }
    resetHistory();
    bumpHistory((n) => n + 1);
    setLastAction(`Published · version ${res.published.version}`);
  }, [draft, draftVersion, refused]);

  const discardDraft = useCallback(async () => {
    if (!published) return;
    const fresh: Layout = { ...structuredClone(published), status: 'draft' };
    setSaving(true);
    const res = await seatingService.saveDraft(fresh, draftVersion);
    setSaving(false);
    if (refused('save', res)) return;
    if (!res.ok) return;
    setDraft(fresh);
    setDraftVersion(res.version);
    setDraftBy(res.updatedBy);
    resetHistory();
    bumpHistory((n) => n + 1);
    setLastAction('Draft discarded');
  }, [published, draftVersion, refused]);

  const reloadDraft = useCallback(async () => {
    setSaving(true);
    try {
      const { draft: d, published: full } = await seatingService.loadDraft();
      setDraft(d.layout);
      setDraftVersion(d.version);
      setDraftBy(d.updatedBy);
      if (full) setPublished(full.layout);
      setConflict(null);
      resetHistory();
      bumpHistory((n) => n + 1);
      setLastAction(`Loaded the shared draft · version ${d.version}`);
      setError(null);
    } catch {
      setError('The shared draft could not be loaded.');
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Uploads a layout recovered from this browser as the shared draft.
   *
   * Goes through exactly the same optimistic version check as any other save,
   * so a recovery cannot bulldoze work another planner did in the meantime —
   * it gets the same 409 and the same choice.
   */
  const adoptLayout = useCallback(async (layout: Layout) => {
    setSaving(true);
    const res = await seatingService.saveDraft(layout, draftVersion);
    setSaving(false);
    if (refused('save', res)) return;
    if (!res.ok) return;
    setDraft({ ...structuredClone(layout), status: 'draft' });
    setDraftVersion(res.version);
    setDraftBy(res.updatedBy);
    resetHistory();
    bumpHistory((n) => n + 1);
    setLastAction(`Uploaded as the shared draft · version ${res.version}`);
  }, [draftVersion, refused]);

  const dirty = useMemo(
    () => (draft && published ? hasUnpublishedChanges(draft, published) : false),
    [draft, published],
  );

  // historyTick is read so the memo re-evaluates when the refs change.
  const canUndo = useMemo(() => { void historyTick; return past.current.length > 0; }, [historyTick]);
  const canRedo = useMemo(() => { void historyTick; return future.current.length > 0; }, [historyTick]);

  return {
    loading, loadError, published, draft,
    // Falls back to published for a planner whose draft has not arrived yet,
    // so the room never flashes empty between the two requests.
    visible: viewerIsAdmin ? draft ?? published : published,
    draftVersion, draftBy,
    dirty, canUndo, canRedo, saving, lastAction, error, conflict,
    moveTableTo, moveGuestTo, renameGuest,
    renumber, swapNumbers, numberConflict, clearNumberConflict, notice,
    undo, redo, saveDraft, publish, discardDraft, reloadDraft, adoptLayout,
  };
}
