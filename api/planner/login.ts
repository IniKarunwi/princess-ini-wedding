/**
 * POST /api/planner/login   { pin, name }
 *
 * Verifies the shared planner PIN against a scrypt hash held in the server
 * environment and, on success, sets a seven-day signed httpOnly cookie.
 *
 * `name` is required and is not a credential. It is the label that appears on
 * every save — "Version 16 · Princess · 10:52" — so that when two planners
 * disagree about who moved table nine there is an answer. Asking for it at
 * sign-in rather than per action is the only point at which a person will
 * actually type it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from '../_lib/env.js';
import { checkPin, issue, setCookie, SESSION_DAYS } from '../_lib/session.js';
import { sessionEpoch } from '../_lib/store.js';
import { clientIp, fail, json, methodIs, rateForgive, rateLimit } from '../_lib/http.js';

/** Keeps a label a human typed; refuses one that would break the audit line. */
function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 40) return null;
  // Control characters only. Accents, apostrophes and hyphens are names.
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodIs(req, res, 'POST')) return;

  try {
    const env = readEnv();
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};

    const name = cleanName(body.name);
    if (!name) {
      return json(res, 400, {
        error: 'name_required',
        detail: 'Give the name you plan under, so changes can be attributed.',
      });
    }

    const gate = rateLimit(clientIp(req));
    if (!gate.allowed) {
      res.setHeader('retry-after', String(gate.retryAfter));
      return json(res, 429, { error: 'too_many_attempts', retryAfter: gate.retryAfter });
    }

    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!pin || !(await checkPin(pin, env.pinHash))) {
      return json(res, 401, { error: 'bad_pin' });
    }

    const epoch = await sessionEpoch(env);
    rateForgive(clientIp(req));
    res.setHeader('set-cookie', setCookie(issue(name, epoch, env.sessionSecret)));
    return json(res, 200, { name, days: SESSION_DAYS });
  } catch (e) {
    return fail(res, e);
  }
}
