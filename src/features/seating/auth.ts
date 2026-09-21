/**
 * The admin authentication boundary.
 *
 * ══ THIS IS NOT SECURITY ═════════════════════════════════════════════════
 *
 * The PIN below ships inside the JavaScript bundle. Anyone who opens dev
 * tools, or simply reads the source of a page they have already downloaded,
 * has it. It is not hashed, not salted, and not checked by anything the guest
 * does not control — a determined visitor can skip the check entirely by
 * editing the running page.
 *
 * What it actually buys: a guest cannot wander into edit mode by accident,
 * and the editing controls stay out of the way. That is worth having. It is
 * not access control and must not be described as any.
 *
 * ── Why it is a whole file ────────────────────────────────────────────────
 * So there is exactly ONE place to replace. The rest of the feature asks
 * `useAdminSession()` whether the user may edit and never learns how that was
 * decided. When feature/wedding-day-backend lands staff authentication, this
 * file's internals change and nothing else does.
 *
 * ── What real auth has to do ──────────────────────────────────────────────
 *   1. verify the staff credential SERVER-SIDE — an Edge Function that holds
 *      the secret, never the bundle;
 *   2. return a short-lived token the client stores in memory;
 *   3. have the database enforce it: writes to seating_layouts allowed only
 *      for that identity, so a forged client cannot write even if it lies
 *      about being an admin. Frontend gating alone is decoration.
 *
 * Until (3) exists, publishing is guarded by nothing but politeness, and the
 * UI says so rather than implying otherwise.
 */

import { useCallback, useEffect, useState } from 'react';

/** Supplied in the brief. Present in the bundle — see the header. */
const PROTOTYPE_PIN = '2530';

/** Survives a reload within the tab; deliberately not localStorage. */
const SESSION_KEY = 'pi.seating.admin';

export interface AdminSession {
  /** May the current user see and use editing controls? */
  canEdit: boolean;
  /** Attempts to unlock. Returns false on a wrong PIN. */
  unlock(pin: string): boolean;
  lock(): void;
  /**
   * False while auth is a bundled PIN. The UI reads this to label the admin
   * area honestly instead of implying the room is protected.
   */
  readonly isRealAuth: boolean;
}

export function useAdminSession(): AdminSession {
  const [canEdit, setCanEdit] = useState(false);

  // sessionStorage, not localStorage: closing the tab should end the session.
  // A shared planner's laptop left open on a table at the venue is the exact
  // situation this is for.
  useEffect(() => {
    try {
      setCanEdit(window.sessionStorage.getItem(SESSION_KEY) === '1');
    } catch { /* storage blocked — start locked, which is the safe default */ }
  }, []);

  const unlock = useCallback((pin: string) => {
    const ok = pin.trim() === PROTOTYPE_PIN;
    if (ok) {
      setCanEdit(true);
      try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* fine */ }
    }
    return ok;
  }, []);

  const lock = useCallback(() => {
    setCanEdit(false);
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* fine */ }
  }, []);

  return { canEdit, unlock, lock, isRealAuth: false };
}
