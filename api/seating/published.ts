/**
 * GET /api/seating/published — the public seating chart.
 *
 * No session, no cookie, no key in the page. A guest opening /seating-chart
 * gets exactly one thing from the server: the published room.
 *
 * It could have been read directly with the anon key and RLS, and that would
 * be safe. It goes through a function anyway so the browser needs no Supabase
 * credentials at all for this page, and so the draft and the published plan
 * are reached the same way — one boundary to reason about rather than two.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from '../_lib/env';
import { rowToLayout } from '../_lib/layout';
import { fail, json, methodIs } from '../_lib/http';
import { getLayout } from '../_lib/store';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodIs(req, res, 'GET')) return;

  try {
    const row = await getLayout(readEnv(), 'published');
    if (!row) return json(res, 404, { error: 'no_published_layout' });

    // Guests arriving at once should not each wake a function, but a plan
    // republished during the reception has to reach them quickly. Ten seconds
    // of shared cache, and a stale copy served for up to a minute while the
    // next one is fetched.
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=60');
    return res.status(200).json({ published: rowToLayout(row) });
  } catch (e) {
    return fail(res, e);
  }
}
