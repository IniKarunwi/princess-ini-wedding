/**
 * POST /api/seating/lookup — "which table am I on?"
 *
 * The one place a guest's name meets the seating plan, and it answers about
 * ONE person: the one who typed their own name. The published layout itself
 * is served without any names at all, so this endpoint is the whole public
 * surface for guest data and it is deliberately narrow.
 *
 * ── What it will not do ─────────────────────────────────────────────────────
 * It never returns who else is at the table, never returns a list of
 * everybody matching, and never returns a table number for a name the guest
 * has not identified as their own. On an ambiguous search it returns just
 * enough — the matching names, no tables — and waits for them to pick.
 *
 * ── Keeping it from becoming a guest directory ──────────────────────────────
 * Any search box over a list of names is an oracle: ask for "a" and you get
 * the room. Three things bound that, and none of them needs a new system:
 *
 *   • at least three characters, so single letters return nothing;
 *   • matches must start at a WORD boundary, so "a" cannot match "Damola";
 *   • more than six matches is treated as too vague and returns no names at
 *     all, just a prompt to type more.
 *
 * That leaves someone able to confirm a name they already know is on the
 * list, which is the same thing they could do by asking at the door, and it
 * is the unavoidable cost of letting a guest find their own seat.
 *
 *   { q: "ini karunwi" }   → { found, name, table, side }
 *                          → { choices: [{ id, name }] }   (no tables)
 *                          → { tooMany: true } | { none: true }
 *   { id: "<entry id>" }   → { found, name, table, side }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from '../_lib/env';
import { fail, json, methodIs } from '../_lib/http';
import { getLayout } from '../_lib/store';

const MIN_QUERY = 3;
const MAX_CHOICES = 6;

interface Row { id: string; name: string; tableId: string; number: number; side: string; kind: string }

const flatten = (payload: any): Row[] =>
  (payload?.tables ?? []).flatMap((t: any) =>
    (t.entries ?? []).map((e: any) => ({
      id: e.id, name: e.name, tableId: t.id, number: t.number, side: t.side, kind: t.kind,
    })));

/**
 * Forgiving in the ways a guest at a door is: case, stray spaces, a first
 * name only, a surname only, a title in front of it. Not forgiving about
 * where the match starts — mid-word matching is what turns this into a
 * directory.
 */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function score(hay: string, needle: string): number | null {
  const h = norm(hay);
  const n = norm(needle);
  if (h === n) return 0;                       // exact
  if (h.startsWith(n)) return 1;               // starts with what they typed
  // Any word boundary: surnames, and rows led by "Pastor", "Mrs", "Dr".
  const at = h.indexOf(n);
  if (at > 0 && /[\s+·,&/-]/.test(h[at - 1])) return 2;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodIs(req, res, 'POST')) return;

  try {
    const env = readEnv();
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};

    const row = await getLayout(env, 'published');
    if (!row) return json(res, 404, { error: 'no_published_layout' });
    const people = flatten(row.payload);

    const answer = (p: Row) => json(res, 200, {
      found: true,
      name: p.name,
      // The DISPLAYED number, so a renumber by a planner is what the guest is
      // told — the id is an internal handle and means nothing at the door.
      table: p.number,
      // Both sides number their tables from 01, so the number alone cannot
      // say WHICH Table 12 to highlight. The id can.
      tableId: p.tableId,
      side: p.side,
      vip: p.kind === 'vip',
    });

    // Second step of an ambiguous search: they picked their own name.
    if (typeof body.id === 'string' && body.id) {
      const picked = people.find((p) => p.id === body.id);
      return picked ? answer(picked) : json(res, 200, { none: true });
    }

    const q = typeof body.q === 'string' ? body.q.trim() : '';
    if (q.length < MIN_QUERY) {
      return json(res, 200, { tooShort: true, min: MIN_QUERY });
    }

    const hits = people
      .map((p) => ({ p, rank: score(p.name, q) }))
      .filter((h): h is { p: Row; rank: number } => h.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name));

    if (hits.length === 0) return json(res, 200, { none: true });

    // One clear winner: either the only hit, or the only exact match.
    const exact = hits.filter((h) => h.rank === 0);
    if (hits.length === 1) return answer(hits[0].p);
    if (exact.length === 1) return answer(exact[0].p);

    if (hits.length > MAX_CHOICES) return json(res, 200, { tooMany: true });

    // Names only. Handing back table numbers here would answer for people
    // who never asked.
    return json(res, 200, {
      choices: hits.map((h) => ({ id: h.p.id, name: h.p.name })),
    });
  } catch (e) {
    return fail(res, e);
  }
}
