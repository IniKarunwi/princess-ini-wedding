/**
 * /api/planner/draft — the shared working copy.
 *
 *   GET  → the current draft, with its version
 *   PUT  → { version, payload }; 409 if the draft has moved on
 *
 * Both require a planner session. The draft is not merely unlisted for
 * guests: there is no RLS policy that would let the anon key read it, so the
 * only way to see it is through this function with a valid cookie.
 *
 * ── On 409 ──────────────────────────────────────────────────────────────────
 * A stale save is refused, never merged. The response carries the current
 * draft so the client can say what happened and offer to reload, rather than
 * making the planner guess which of their changes survived.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkLayout, rowToLayout } from '../_lib/layout.js';
import { fail, json, methodIs, requirePlanner } from '../_lib/http.js';
import { getLayout, saveDraft } from '../_lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodIs(req, res, 'GET', 'PUT')) return;

  const auth = await requirePlanner(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const row = await getLayout(auth.env, 'draft');
      if (!row) return json(res, 404, { error: 'no_draft', detail: 'Run migration 0009.' });
      // The published layout comes back too, WITH its guest names. The public
      // endpoint strips them, and comparing a full draft against a stripped
      // published layout would report every table as changed — a planner
      // would never see "Published", only a permanent "unpublished changes".
      const pub = await getLayout(auth.env, 'published');
      return json(res, 200, {
        draft: rowToLayout(row),
        published: pub ? rowToLayout(pub) : null,
      });
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    if (!Number.isInteger(body.version)) {
      return json(res, 400, { error: 'version_required' });
    }

    const check = checkLayout(body.payload);
    if (!check.ok) return json(res, 422, { error: 'bad_payload', detail: check.reason });

    const result = await saveDraft(auth.env, check.payload, body.version, auth.claims.n);
    if (!result.ok) {
      return json(res, 409, {
        error: 'stale_version',
        detail: 'The seating plan has changed since you opened it.',
        current: result.current ? rowToLayout(result.current) : null,
      });
    }
    return json(res, 200, { draft: rowToLayout(result.row) });
  } catch (e) {
    return fail(res, e);
  }
}
