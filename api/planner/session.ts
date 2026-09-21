/**
 * GET /api/planner/session
 *
 * "Am I still a planner, and under what name?" Called once when the seating
 * page mounts, which is what makes the session survive a refresh, a closed
 * tab and a restarted browser without the page ever holding the cookie
 * itself — it cannot, the cookie is httpOnly.
 *
 * Answers 200 either way. Not being signed in is the ordinary state of this
 * endpoint (every guest hits it) and a 401 on the common path would fill the
 * browser console with red for something entirely normal.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from '../_lib/env.js';
import { readCookie, verify } from '../_lib/session.js';
import { sessionEpoch } from '../_lib/store.js';
import { fail, json, methodIs } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodIs(req, res, 'GET')) return;

  try {
    const env = readEnv();
    const epoch = await sessionEpoch(env);
    const v = verify(readCookie(req.headers.cookie), env.sessionSecret, epoch);
    if (!v.ok) return json(res, 200, { authenticated: false, reason: v.reason });
    return json(res, 200, {
      authenticated: true,
      name: v.claims.n,
      expiresAt: new Date(v.claims.exp * 1000).toISOString(),
    });
  } catch (e) {
    return fail(res, e);
  }
}
