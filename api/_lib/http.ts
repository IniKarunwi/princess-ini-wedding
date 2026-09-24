/**
 * Shared plumbing for the planner functions: JSON replies, auth, and a
 * deliberately small rate limiter.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ConfigError, readEnv, type PlannerEnv } from './env.js';
import { readCookie, verify, type SessionClaims } from './session.js';
import { sessionEpoch, StoreError } from './store.js';

export function json(res: VercelResponse, status: number, body: unknown) {
  // A seating draft is not cacheable by anything, ever. Vercel's edge will
  // happily cache a 200 from a function otherwise, and a planner would be
  // shown a stale version number and then handed a 409 for no visible reason.
  res.setHeader('cache-control', 'no-store');
  res.status(status).json(body);
}

/** Method guard that also answers with the right Allow header. */
export function methodIs(req: VercelRequest, res: VercelResponse, ...allowed: string[]): boolean {
  if (allowed.includes(req.method ?? '')) return true;
  res.setHeader('allow', allowed.join(', '));
  json(res, 405, { error: 'method_not_allowed' });
  return false;
}

/**
 * Turns thrown configuration and store errors into honest status codes.
 *
 * `scope` only changes the wording of the log line and of the caller-facing
 * `detail`. It defaults to 'seating' so every existing call site behaves
 * exactly as it did — the camera passes 'photos' so that a storage failure
 * does not report itself as a seating-chart failure.
 */
export function fail(res: VercelResponse, err: unknown, scope: 'seating' | 'photos' = 'seating') {
  const tag = `[${scope}]`;
  const upstreamDetail = scope === 'photos'
    ? 'The photo store did not answer.'
    : 'The seating store did not answer.';

  if (err instanceof ConfigError) {
    // Names the variable that is missing. There is no way to guess this from
    // outside, and the name of an unset variable is not a secret.
    console.error(`${tag} not configured:`, err.message);
    return json(res, 503, {
      error: 'not_configured',
      detail: err.message,
    });
  }

  if (err instanceof StoreError) {
    /*
     * Say what the store actually said.
     *
     * This used to return a flat "The seating store did not answer.", which
     * is indistinguishable between a missing table, a rejected key, a paused
     * project and a malformed URL — and production sat on exactly that
     * message with no way to tell which. The upstream status and PostgREST's
     * own error code describe our schema and our request; the service-role
     * key travels in a header and is never echoed in an error body, so none
     * of this can leak it.
     */
    console.error(`${tag} store error:`, {
      where: err.where,
      upstreamStatus: err.upstreamStatus,
      code: err.code,
      message: err.message,
      hint: err.hint,
      body: err.body,
    });
    return json(res, err.status, {
      error: 'upstream',
      detail: upstreamDetail,
      upstreamStatus: err.upstreamStatus,
      where: err.where,
      code: err.code,
      message: err.message,
      hint: err.hint,
    });
  }

  console.error(`${tag} unhandled:`, err);
  return json(res, 500, {
    error: 'server_error',
    message: err instanceof Error ? err.message.slice(0, 200) : undefined,
  });
}

export interface Authed {
  env: PlannerEnv;
  claims: SessionClaims;
  epoch: number;
}

/**
 * Resolves the session or answers for you.
 *
 * Returns null after having already written a 401/503, so a handler reads
 *     const a = await requirePlanner(req, res); if (!a) return;
 */
export async function requirePlanner(
  req: VercelRequest, res: VercelResponse,
): Promise<Authed | null> {
  let env: PlannerEnv;
  try { env = readEnv(); } catch (e) { fail(res, e); return null; }

  let epoch: number;
  try {
    epoch = await sessionEpoch(env);
  } catch (e) {
    // Fail closed. If we cannot check revocation we do not get to guess.
    fail(res, e);
    return null;
  }

  const token = readCookie(req.headers.cookie);
  const v = verify(token, env.sessionSecret, epoch);
  if (!v.ok) {
    json(res, 401, { error: 'unauthorized', reason: v.reason });
    return null;
  }
  return { env, claims: v.claims, epoch };
}

/* ── Rate limiting ───────────────────────────────────────────────────────── */

/**
 * Per-instance, in memory, and honest about it.
 *
 * A four-digit PIN is ten thousand guesses. Unthrottled that is minutes of
 * scripting. This makes it days. It is NOT a distributed limiter: Vercel may
 * run several instances, so the real ceiling is (instances × limit) per
 * window. Making it exact would mean a table write on every login attempt —
 * a whole moving part for a login page used by three people. The brief asked
 * to keep it simple, and the reason it is safe to keep simple is that the
 * hash is server-side and the blast radius of the PIN is one seating chart.
 */
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 8;
const attempts = new Map<string, number[]>();

export function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw?.split(',')[0] ?? '').trim() || 'unknown';
}

/** Records an attempt. Returns seconds to wait when the caller is over. */
export function rateLimit(key: string, limit: number = LIMIT): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (attempts.size > 500) attempts.clear();   // crude, bounded, good enough

  if (hits.length >= limit) {
    attempts.set(key, hits);
    return { allowed: false, retryAfter: Math.ceil((WINDOW_MS - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  attempts.set(key, hits);
  return { allowed: true, retryAfter: 0 };
}

/** A successful login clears the counter for that address. */
export const rateForgive = (key: string) => { attempts.delete(key); };

/** Test seam — the limiter is module state and tests need a clean slate. */
export const rateReset = () => { attempts.clear(); };
