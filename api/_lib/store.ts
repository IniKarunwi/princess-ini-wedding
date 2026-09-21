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

export class StoreError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const headers = (env: PlannerEnv, extra: Record<string, string> = {}) => ({
  apikey: env.serviceRoleKey,
  authorization: `Bearer ${env.serviceRoleKey}`,
  'content-type': 'application/json',
  ...extra,
});

async function rest(env: PlannerEnv, path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, init);
  return res;
}

export async function getLayout(
  env: PlannerEnv, status: 'draft' | 'published',
): Promise<LayoutRow | null> {
  const res = await rest(env,
    `seating_layouts?status=eq.${status}&select=status,version,payload,updated_at,updated_by`,
    { headers: headers(env) });
  if (!res.ok) throw new StoreError(await res.text(), 502);
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
  if (!res.ok) throw new StoreError(await res.text(), 502);
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
  throw new StoreError(text, 502);
}

/**
 * The counter every session token is checked against. A failure here is not
 * treated as "allow": the caller turns it into a 503, because a revocation
 * check that fails open is not a revocation check.
 */
export async function sessionEpoch(env: PlannerEnv): Promise<number> {
  const res = await rest(env, 'planner_settings?id=eq.true&select=session_epoch',
    { headers: headers(env) });
  if (!res.ok) throw new StoreError(await res.text(), 502);
  const rows = (await res.json()) as Array<{ session_epoch: number }>;
  if (!rows[0]) throw new StoreError('planner_settings row is missing', 502);
  return rows[0].session_epoch;
}
