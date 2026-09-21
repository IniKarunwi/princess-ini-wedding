/**
 * The seating_layouts table, over PostgREST.
 *
 * Uses fetch against Supabase's REST endpoint rather than @supabase/supabase-js
 * because the whole surface is four requests, and a function that starts fast
 * is worth more here than a client object.
 *
 * ── Optimistic concurrency, and why it is a filter and not a read ───────────
 * Two planners open the chart. One moves a table, the other renames a guest,
 * both press Save. A read-then-write loses the first edit with no trace.
 *
 * So a write is
 *     PATCH …?status=eq.draft&version=eq.<what the caller loaded>
 * and Postgres decides. If the row has moved on, zero rows match, the write
 * does nothing, and the API answers 409. There is deliberately no automatic
 * merge: two people rearranging a room have intentions the server cannot
 * infer, and inventing one is how a guest ends up at the wrong table.
 */

import type { PlannerEnv } from './env.js';

export interface LayoutRow {
  status: 'draft' | 'published';
  version: number;
  payload: unknown;
  updated_at: string;
  updated_by: string | null;
}

/**
 * A failed call to the seating store.
 *
 * Carries what PostgREST actually said. The first production deploy answered
 * every request with "The seating store did not answer." and nothing else,
 * because the upstream body was read into an Error message and then dropped
 * on the floor — which is a diagnosis of "something went wrong somewhere",
 * i.e. no diagnosis at all.
 *
 * `upstreamStatus` and `code`/`hint` describe OUR schema and OUR request.
 * They contain no credential: the key travels in a request header and is
 * never echoed in a PostgREST error body. `where` is the request path with
 * the query string kept — it is a table name and a filter, not a secret.
 */
export class StoreError extends Error {
  readonly upstreamStatus: number;
  readonly where: string;
  /** PostgREST's error code, e.g. 42P01 for "relation does not exist". */
  readonly code?: string;
  readonly hint?: string;
  /** The upstream body, capped. */
  readonly body: string;

  constructor(opts: {
    where: string; upstreamStatus: number; body: string; status?: number;
  }) {
    let code: string | undefined;
    let hint: string | undefined;
    let message = opts.body;
    try {
      const parsed = JSON.parse(opts.body);
      code = parsed?.code;
      hint = parsed?.hint ?? parsed?.details ?? undefined;
      message = parsed?.message ?? opts.body;
    } catch { /* not JSON — an HTML error page from a proxy, most likely */ }

    super(message.slice(0, 300));
    this.upstreamStatus = opts.upstreamStatus;
    this.where = opts.where;
    this.code = code;
    this.hint = typeof hint === 'string' ? hint.slice(0, 200) : undefined;
    this.body = opts.body.slice(0, 500);
    // 502 unless told otherwise: we reached the store and it refused.
    this.status = opts.status ?? 502;
  }

  status: number;
}

const headers = (env: PlannerEnv, extra: Record<string, string> = {}) => ({
  apikey: env.serviceRoleKey,
  authorization: `Bearer ${env.serviceRoleKey}`,
  'content-type': 'application/json',
  ...extra,
});

/**
 * One request to PostgREST.
 *
 * The URL is built as `<SUPABASE_URL>/rest/v1/<path>`. readEnv() strips
 * trailing slashes from SUPABASE_URL, so a pasted "https://x.supabase.co/"
 * is fine — but a pasted "https://x.supabase.co/rest/v1" would produce
 * ".../rest/v1/rest/v1/..." and a 404. The thrown error now reports the
 * resolved path so that is visible rather than inferred.
 */
async function rest(env: PlannerEnv, path: string, init: RequestInit): Promise<Response> {
  const url = `${env.supabaseUrl}/rest/v1/${path}`;
  try {
    return await fetch(url, init);
  } catch (cause) {
    // A network-level failure never reached PostgREST, so it is not a 502
    // from the store — it is us being unable to get there at all.
    throw new StoreError({
      where: `${init.method ?? 'GET'} /rest/v1/${path}`,
      upstreamStatus: 0,
      body: `fetch failed: ${(cause as Error)?.message ?? String(cause)}`,
      status: 502,
    });
  }
}

/** Reads a response's body once, for an error path. */
const fault = async (res: Response, method: string, path: string) =>
  new StoreError({
    where: `${method} /rest/v1/${path}`,
    upstreamStatus: res.status,
    body: await res.text().catch(() => ''),
  });

export async function getLayout(
  env: PlannerEnv, status: 'draft' | 'published',
): Promise<LayoutRow | null> {
  const path =
    `seating_layouts?status=eq.${status}&select=status,version,payload,updated_at,updated_by`;
  const res = await rest(env, path, { headers: headers(env) });
  if (!res.ok) throw await fault(res, 'GET', path);
  const rows = (await res.json()) as LayoutRow[];
  return rows[0] ?? null;
}

export type WriteResult =
  | { ok: true; row: LayoutRow }
  | { ok: false; conflict: true; current: LayoutRow | null };

export async function saveDraft(
  env: PlannerEnv, payload: unknown, expectedVersion: number, actor: string,
): Promise<WriteResult> {
  const res = await rest(env,
    `seating_layouts?status=eq.draft&version=eq.${encodeURIComponent(String(expectedVersion))}`,
    {
      method: 'PATCH',
      headers: headers(env, { prefer: 'return=representation' }),
      body: JSON.stringify({
        payload,
        version: expectedVersion + 1,
        updated_at: new Date().toISOString(),
        updated_by: actor,
      }),
    });
  if (!res.ok) throw await fault(res, 'PATCH', 'seating_layouts');
  const rows = (await res.json()) as LayoutRow[];
  if (rows.length === 0) {
    return { ok: false, conflict: true, current: await getLayout(env, 'draft') };
  }
  return { ok: true, row: rows[0] };
}

/** Calls publish_seating(), which does the whole promotion in one transaction. */
export async function publish(
  env: PlannerEnv, expectedVersion: number, actor: string,
): Promise<WriteResult> {
  const res = await rest(env, 'rpc/publish_seating', {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ expected_version: expectedVersion, actor }),
  });

  if (res.ok) return { ok: true, row: (await res.json()) as LayoutRow };

  const text = await res.text();
  // The function raises 40001 when the caller's draft version is stale. That
  // is not a server fault, it is the concurrency answer, so it becomes a 409.
  if (text.includes('40001') || /caller held/.test(text)) {
    return { ok: false, conflict: true, current: await getLayout(env, 'draft') };
  }
  throw new StoreError({
    where: 'POST /rest/v1/rpc/publish_seating',
    upstreamStatus: res.status,
    body: text,
  });
}

/**
 * The counter every session token is checked against. A failure here is not
 * treated as "allow": the caller turns it into a 503, because a revocation
 * check that fails open is not a revocation check.
 */
export async function sessionEpoch(env: PlannerEnv): Promise<number> {
  const path = 'planner_settings?id=eq.true&select=session_epoch';
  const res = await rest(env, path, { headers: headers(env) });
  if (!res.ok) throw await fault(res, 'GET', path);
  const rows = (await res.json()) as Array<{ session_epoch: number }>;
  if (!rows[0]) {
    throw new StoreError({
      where: `GET /rest/v1/${path}`, upstreamStatus: 200,
      body: 'planner_settings has no row — migration 0009 seeds one',
    });
  }
  return rows[0].session_epoch;
}
