/**
 * POST /api/planner/logout
 *
 * Ends THIS browser's session and nothing else. It does not touch the shared
 * draft, does not bump the session epoch, and does not sign out the planner
 * working from the venue on their phone. Signing off a borrowed laptop should
 * not cost anyone else their work.
 *
 * To end every session everywhere — a lost phone, a rotated PIN — bump
 * planner_settings.session_epoch. See api/_lib/session.ts.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearCookie } from '../_lib/session';
import { json, methodIs } from '../_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodIs(req, res, 'POST')) return;
  res.setHeader('set-cookie', clearCookie());
  return json(res, 200, { authenticated: false });
}
