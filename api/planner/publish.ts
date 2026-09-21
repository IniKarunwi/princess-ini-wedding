/**
 * POST /api/planner/publish   { version }
 *
 * Promotes the shared draft to the published plan that guests see, inside one
 * database transaction (publish_seating, migration 0009). The body carries no
 * layout at all — deliberately. Publishing the bytes the client happens to be
 * holding would let a planner publish something they had not saved, and could
 * quietly discard a colleague's save made thirty seconds earlier. What gets
 * published is what is in the shared draft; `version` only states which draft
 * the planner believed they were promoting.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rowToLayout } from '../_lib/layout.js';
import { fail, json, methodIs, requirePlanner } from '../_lib/http.js';
import { getLayout, publish } from '../_lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodIs(req, res, 'POST')) return;

  const auth = await requirePlanner(req, res);
  if (!auth) return;

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    if (!Number.isInteger(body.version)) {
      return json(res, 400, { error: 'version_required' });
    }

    const result = await publish(auth.env, body.version, auth.claims.n);
    if (!result.ok) {
      return json(res, 409, {
        error: 'stale_version',
        detail: 'The seating plan has changed since you opened it.',
        current: result.current ? rowToLayout(result.current) : null,
      });
    }

    const draft = await getLayout(auth.env, 'draft');
    return json(res, 200, {
      published: rowToLayout(result.row),
      draft: draft ? rowToLayout(draft) : null,
    });
  } catch (e) {
    return fail(res, e);
  }
}
