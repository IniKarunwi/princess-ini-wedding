/**
 * The persistence boundary.
 *
 * ── The store is the server now ─────────────────────────────────────────────
 * This used to be localStorage, and the file said so at length: one browser,
 * no sharing, drafts invisible to the planner standing next to you. Every one
 * of those limits is gone. Both layouts live in Postgres (migration 0009) and
 * are reached through same-origin functions under /api, so:
 *
 *   • two planners on two devices edit ONE draft;
 *   • a publish reaches every guest's phone;
 *   • the draft is private because no RLS policy lets the anon key read it,
 *     not because it happens to be in someone's browser;
 *   • clearing a browser loses nothing.
 *
 * ── Versions are not decoration ─────────────────────────────────────────────
 * Every load carries the draft's version and every save sends it back. The
 * server refuses a save whose version has moved on and answers 409 with the
 * current draft. That is the whole multi-device safety story, and it is why
 * saveDraft returns a result instead of void: the caller has to be able to
 * tell a planner "someone else changed this" rather than pretending.
 *
 * Nothing merges automatically. Two people rearranging a room have intentions
 * the server cannot infer.
 *
 * ── The old localStorage draft ──────────────────────────────────────────────
 * Drafts made before this change still sit in `pi.seating.draft.v1` on
 * whichever laptop made them. They are NOT read as a live store any more, and
 * they are NOT deleted. legacy.ts finds them and offers to upload them.
 */

import type { Layout } from './types';

/** A layout as it came from the server, with the version to send back. */
export interface Loaded {
  layout: Layout;
  version: number;
  updatedBy: string | null;
}

export type SaveResult =
  | { ok: true; version: number; updatedBy: string | null }
  | { ok: false; kind: 'conflict'; current: Loaded | null }
  | { ok: false; kind: 'auth' }
  | { ok: false; kind: 'error'; reason: string };

export type PublishResult =
  | { ok: true; published: Loaded; draft: Loaded | null }
  | { ok: false; kind: 'conflict'; current: Loaded | null }
  | { ok: false; kind: 'auth' }
  | { ok: false; kind: 'error'; reason: string };

export interface SeatingService {
  /** What guests see. Public; no session needed. */
  loadPublished(): Promise<Loaded>;
  /** The shared planner draft. Requires a planner session. */
  loadDraft(): Promise<Loaded>;
  saveDraft(layout: Layout, version: number): Promise<SaveResult>;
  publish(version: number): Promise<PublishResult>;
  /** True when this store genuinely persists across devices. */
  readonly isDurable: boolean;
  readonly describe: string;
}

export class SeatingUnavailable extends Error {}

/* ── Wire format ─────────────────────────────────────────────────────────── */

/**
 * The server keeps version and status in the row's columns and the rest in
 * the payload; it flattens them together on the way out. Rebuilding a Layout
 * here rather than trusting the shape keeps one definition of what a layout
 * is — the types in types.ts — on both sides of the network.
 */
function toLoaded(raw: any, status: 'draft' | 'published'): Loaded {
  const layout: Layout = {
    version: Number(raw?.version ?? 1),
    status,
    tables: Array.isArray(raw?.tables) ? raw.tables : [],
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    label: typeof raw?.label === 'string' ? raw.label : undefined,
  };
  return { layout, version: layout.version, updatedBy: raw?.updatedBy ?? null };
}

const call = (path: string, init: RequestInit = {}) =>
  fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

/**
 * The seating plan on the server. The only implementation that ships.
 */
export class ApiSeatingService implements SeatingService {
  readonly isDurable = true;
  readonly describe = 'Shared across every planner and every device';

  async loadPublished(): Promise<Loaded> {
    const res = await call('/api/seating/published');
    if (!res.ok) throw new SeatingUnavailable(`published: ${res.status}`);
    const body = await res.json();
    return toLoaded(body.published, 'published');
  }

  async loadDraft(): Promise<Loaded> {
    const res = await call('/api/planner/draft');
    if (!res.ok) throw new SeatingUnavailable(`draft: ${res.status}`);
    const body = await res.json();
    return toLoaded(body.draft, 'draft');
  }

  async saveDraft(layout: Layout, version: number): Promise<SaveResult> {
    let res: Response;
    try {
      res = await call('/api/planner/draft', {
        method: 'PUT',
        body: JSON.stringify({
          version,
          // version and status are the server's to decide; sending them would
          // only create a second opinion about what version this is.
          payload: { tables: layout.tables, updatedAt: layout.updatedAt, label: layout.label },
        }),
      });
    } catch {
      return { ok: false, kind: 'error', reason: 'No connection — nothing was saved.' };
    }

    if (res.status === 409) {
      const body = await res.json().catch(() => ({} as any));
      return { ok: false, kind: 'conflict', current: body?.current ? toLoaded(body.current, 'draft') : null };
    }
    if (res.status === 401) return { ok: false, kind: 'auth' };
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as any));
      return { ok: false, kind: 'error', reason: body?.detail ?? 'The draft could not be saved.' };
    }

    const body = await res.json();
    const loaded = toLoaded(body.draft, 'draft');
    return { ok: true, version: loaded.version, updatedBy: loaded.updatedBy };
  }

  async publish(version: number): Promise<PublishResult> {
    let res: Response;
    try {
      res = await call('/api/planner/publish', {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
    } catch {
      return { ok: false, kind: 'error', reason: 'No connection — nothing was published.' };
    }

    if (res.status === 409) {
      const body = await res.json().catch(() => ({} as any));
      return { ok: false, kind: 'conflict', current: body?.current ? toLoaded(body.current, 'draft') : null };
    }
    if (res.status === 401) return { ok: false, kind: 'auth' };
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as any));
      return { ok: false, kind: 'error', reason: body?.detail ?? 'Publishing failed.' };
    }

    const body = await res.json();
    return {
      ok: true,
      published: toLoaded(body.published, 'published'),
      draft: body.draft ? toLoaded(body.draft, 'draft') : null,
    };
  }
}

export const seatingService: SeatingService = new ApiSeatingService();
