/**
 * The planner authentication boundary.
 *
 * ── What changed, and why it matters ────────────────────────────────────────
 * This file used to hold the PIN as a string constant. It shipped inside the
 * JavaScript bundle, where anyone who opened the page could read it, and it
 * gated nothing but the UI: the draft lived in localStorage and a determined
 * visitor could have edited the running page instead.
 *
 * Now the PIN is verified by /api/planner/login against a scrypt hash held in
 * a server environment variable, and what comes back is an httpOnly signed
 * cookie this code cannot read — which is the point. The browser never learns
 * the secret and never holds the token, so there is nothing here to steal or
 * forge. Writes are refused by the server, not by this hook: seating_layouts
 * has no RLS policy permitting them, and only the service-role key on the
 * server can write.
 *
 * `canEdit` is still just a rendering decision. A visitor who flips it in dev
 * tools gets the editing chrome and a 401 from every endpoint behind it. That
 * is the correct shape: the frontend decides what to SHOW, the server decides
 * what may HAPPEN.
 *
 * ── The name ────────────────────────────────────────────────────────────────
 * Signing in asks for a display name as well as the PIN. It is not a second
 * credential and is not checked against anything — it is the label written
 * onto every save, so "Version 16 · Princess · 10:52" answers who moved what.
 *
 * ── Seven days ──────────────────────────────────────────────────────────────
 * The cookie lasts a week and survives refreshes, closed tabs and restarts,
 * because a planner setting up a room should not be signing in again every
 * time a phone locks. Signing out clears this browser's cookie and touches
 * nothing shared. To end every session at once, bump
 * planner_settings.session_epoch — see api/_lib/session.ts.
 */

import { useCallback, useEffect, useState } from 'react';

export type UnlockResult =
  | { ok: true }
  | { ok: false; error: string };

export interface AdminSession {
  /** True once the session has been checked, either way. */
  ready: boolean;
  /** May the current user see and use editing controls? */
  canEdit: boolean;
  /** The planner's display name, for the audit line. */
  name: string | null;
  unlock(pin: string, name: string): Promise<UnlockResult>;
  lock(): void;
  /**
   * True now: the credential is verified server-side and writes are enforced
   * by the database. The admin bar reads this to stop apologising for itself.
   */
  readonly isRealAuth: boolean;
}

/** Everything here is same-origin; credentials are needed for the cookie. */
export const plannerFetch = (path: string, init: RequestInit = {}) =>
  fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

export function useAdminSession(): AdminSession {
  const [canEdit, setCanEdit] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await plannerFetch('/api/planner/session');
        const body = await res.json();
        if (!live) return;
        if (body?.authenticated) { setCanEdit(true); setName(body.name ?? null); }
      } catch {
        // Offline, or the API is not deployed. Start locked: a guest sees the
        // published room either way, which is this page's actual job.
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => { live = false; };
  }, []);

  const unlock = useCallback(async (pin: string, who: string): Promise<UnlockResult> => {
    let res: Response;
    try {
      res = await plannerFetch('/api/planner/login', {
        method: 'POST',
        body: JSON.stringify({ pin, name: who }),
      });
    } catch {
      return { ok: false, error: 'No connection. Try again in a moment.' };
    }

    if (res.ok) {
      const body = await res.json().catch(() => ({} as any));
      setCanEdit(true);
      setName(body?.name ?? who);
      return { ok: true };
    }

    const body = await res.json().catch(() => ({} as any));
    if (res.status === 429) {
      const mins = Math.ceil((body?.retryAfter ?? 600) / 60);
      return { ok: false, error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
    }
    if (res.status === 400) return { ok: false, error: 'Add the name you plan under.' };
    if (res.status === 503) return { ok: false, error: 'Planner sign-in is not configured on this deployment.' };
    return { ok: false, error: 'Not that one.' };
  }, []);

  const lock = useCallback(() => {
    // Optimistic: the controls go away at once. The cookie clears behind it,
    // and if that request fails the next session check restores edit mode
    // rather than leaving a planner locked out of their own work.
    setCanEdit(false);
    setName(null);
    void plannerFetch('/api/planner/logout', { method: 'POST' }).catch(() => {});
  }, []);

  return { ready, canEdit, name, unlock, lock, isRealAuth: true };
}
