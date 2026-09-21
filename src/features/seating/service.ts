/**
 * The persistence boundary.
 *
 * ══ READ THIS BEFORE CALLING ANY OF THIS PRODUCTION-READY ═════════════════
 *
 * The implementation that ships today is LocalSeatingService: browser
 * localStorage, one device, no sharing, no auth. It is a prototype backing
 * store and nothing more. Specifically, it does NOT satisfy the brief's
 * persistence requirements:
 *
 *   ✗ admins editing from one device and seeing it on another
 *   ✗ a publish by a planner being visible to guests
 *   ✗ drafts staying private from guests — localStorage is per-browser, so
 *     the draft is invisible to everyone INCLUDING other admins, which is
 *     not privacy, it is isolation
 *   ✗ surviving a cleared browser
 *
 * What IS real today: the draft/published SEPARATION, the publish gesture,
 * undo/redo, and every capacity and placement rule. Those are domain logic
 * and they do not change when the store behind this interface changes.
 *
 * ── What the backend has to provide ───────────────────────────────────────
 * Nothing in this repository stores a hall layout. The existing migrations
 * (0001–0006) cover the RSVP sync layer; 0003_seat_allocation is about
 * plus-one labelling on `rsvps` and is unrelated to the hall. The
 * feature/wedding-day-backend branch owns migration 0007 and staff auth, and
 * this branch deliberately does not touch either.
 *
 * To make this real, one table is needed — sketched here, NOT created by this
 * branch, so it does not collide with 0007:
 *
 *     seating_layouts
 *       id           uuid primary key default gen_random_uuid()
 *       status       text not null check (status in ('draft','published'))
 *       version      integer not null
 *       payload      jsonb not null      -- Layout, exactly as typed here
 *       updated_at   timestamptz not null default now()
 *       updated_by   text                -- staff identity, once auth exists
 *       -- exactly one row per status:
 *       unique (status)
 *
 * Access rules, which matter as much as the table:
 *   • anon may SELECT the row WHERE status = 'published' and nothing else.
 *     RLS with no policy for 'draft' means a guest cannot read the draft even
 *     by guessing — deny-all is the default once RLS is on.
 *   • writing either row requires an authenticated staff identity. Not the
 *     PIN in this branch: see auth.ts.
 *   • publish is a single transaction that copies draft → published and
 *     bumps version, so guests never observe a half-published room.
 *
 * Swapping LocalSeatingService for a SupabaseSeatingService means implementing
 * the four methods below against that table. No component changes.
 */

import type { Layout } from './types';
import { buildInitialLayout } from './model';

export interface SeatingService {
  /** What guests see. */
  loadPublished(): Promise<Layout>;
  /** What admins edit. Falls back to a copy of published when none exists. */
  loadDraft(): Promise<Layout>;
  /** Saves the draft. Must NOT affect what guests see. */
  saveDraft(layout: Layout): Promise<void>;
  /** Promotes the draft to published and bumps the version. */
  publish(layout: Layout): Promise<Layout>;
  /**
   * True when this implementation genuinely persists across devices.
   * The UI reads this to decide whether to tell the user the truth about
   * what their "Save draft" actually did.
   */
  readonly isDurable: boolean;
  readonly describe: string;
}

const KEY_PUB = 'pi.seating.published.v1';
const KEY_DRAFT = 'pi.seating.draft.v1';

const read = (key: string): Layout | null => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Layout) : null;
  } catch {
    return null;   // private mode, disabled storage, or corrupt JSON
  }
};

const write = (key: string, l: Layout) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(l));
  } catch {
    /* Storage full or blocked. The in-memory layout is still correct. */
  }
};

/**
 * Prototype store. One browser, one device, no sharing. See the file header.
 */
export class LocalSeatingService implements SeatingService {
  readonly isDurable = false;
  readonly describe = 'This browser only — not shared, not a real backend';

  async loadPublished(): Promise<Layout> {
    const stored = read(KEY_PUB);
    if (stored) return stored;
    const fresh = { ...buildInitialLayout(), status: 'published' as const };
    write(KEY_PUB, fresh);
    return fresh;
  }

  async loadDraft(): Promise<Layout> {
    const stored = read(KEY_DRAFT);
    if (stored) return stored;
    const pub = await this.loadPublished();
    return { ...structuredClone(pub), status: 'draft' };
  }

  async saveDraft(layout: Layout): Promise<void> {
    write(KEY_DRAFT, { ...layout, status: 'draft' });
  }

  async publish(layout: Layout): Promise<Layout> {
    const published: Layout = {
      ...structuredClone(layout),
      status: 'published',
      version: layout.version + 1,
      updatedAt: new Date().toISOString(),
    };
    write(KEY_PUB, published);
    write(KEY_DRAFT, { ...structuredClone(published), status: 'draft' });
    return published;
  }

  /** Development aid — drops both stores and re-imports the document. */
  async reset(): Promise<void> {
    try {
      window.localStorage.removeItem(KEY_PUB);
      window.localStorage.removeItem(KEY_DRAFT);
    } catch { /* nothing to clear */ }
  }
}

export const seatingService: SeatingService = new LocalSeatingService();
