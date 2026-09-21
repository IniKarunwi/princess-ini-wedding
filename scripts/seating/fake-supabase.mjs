/**
 * An in-memory stand-in for the two tables migration 0009 creates.
 *
 * Used by the tests and by the dev server. It exists because there is no
 * Postgres in development, and a seating chart that cannot load locally is a
 * seating chart nobody will touch before the wedding.
 *
 * It implements the SEMANTICS the SQL implements, and the ones that matter
 * are the concurrency ones:
 *   • `?version=eq.N` matches zero rows once the version has moved on, which
 *     is what a 409 is made of;
 *   • publish_seating raises 40001 for a stale draft and otherwise promotes
 *     draft → published atomically.
 *
 * It is NOT Postgres and proves nothing about the SQL, RLS or the real
 * service-role path. Those are only proven by applying 0009 to the project.
 */

import { readFileSync } from 'node:fs';

export const FAKE_SUPABASE_URL = 'http://supabase.test';
export const FAKE_SERVICE_KEY = 'service-role-test-key';

/** Reads the seed straight out of the migration, so the two cannot drift. */
export function seedFromMigration(migrationPath) {
  const sql = readFileSync(migrationPath, 'utf8');
  const m = sql.match(/\$seed\$([\s\S]*?)\$seed\$/);
  if (!m) throw new Error('could not find the seed payload in the migration');
  return JSON.parse(m[1]);
}

export function createFakeSupabase(seed) {
  const now = '2026-09-21T09:00:00.000Z';
  const state = {
    epoch: 1,
    rows: {
      draft: { status: 'draft', version: 1, payload: structuredClone(seed), updated_at: now, updated_by: 'canonical import' },
      published: { status: 'published', version: 1, payload: structuredClone(seed), updated_at: now, updated_by: 'canonical import' },
    },
  };

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  async function handle(url, init = {}) {
    const u = new URL(url);
    const method = (init.method ?? 'GET').toUpperCase();

    // Every call must present the service-role key. A handler that forgot it
    // would pass against a permissive fake and fail in production.
    if (init.headers?.apikey !== FAKE_SERVICE_KEY) return json({ message: 'no key' }, 401);

    if (u.pathname === '/rest/v1/planner_settings') {
      return json([{ session_epoch: state.epoch }]);
    }

    if (u.pathname === '/rest/v1/rpc/publish_seating') {
      const { expected_version, actor } = JSON.parse(init.body);
      const d = state.rows.draft;
      if (!d) return json({ code: 'P0002', message: 'no draft' }, 400);
      if (d.version !== expected_version) {
        return json({ code: '40001', message: `draft is at version ${d.version}, caller held ${expected_version}` }, 400);
      }
      const p = state.rows.published;
      p.payload = structuredClone(d.payload);
      p.version = (p.version ?? 0) + 1;
      p.updated_at = new Date().toISOString();
      p.updated_by = actor;
      d.payload = structuredClone(p.payload);
      d.version += 1;
      d.updated_at = p.updated_at;
      d.updated_by = actor;
      return json(structuredClone(p));
    }

    if (u.pathname === '/rest/v1/seating_layouts') {
      const status = (u.searchParams.get('status') ?? '').replace('eq.', '');
      const row = state.rows[status];
      if (method === 'GET') return json(row ? [structuredClone(row)] : []);
      if (method === 'PATCH') {
        const filter = u.searchParams.get('version');
        const expected = filter ? Number(filter.replace('eq.', '')) : null;
        // The filter decides, not a read. That is the whole mechanism.
        if (!row || (expected !== null && row.version !== expected)) return json([]);
        Object.assign(row, JSON.parse(init.body));
        return json([structuredClone(row)]);
      }
    }
    return json({ message: `unhandled ${method} ${u.pathname}` }, 500);
  }

  return { state, handle };
}

/**
 * Points global fetch at the stand-in for the fake host only. Returns the
 * original, so a caller can still make real requests.
 */
export function interceptFetch(fake, host = FAKE_SUPABASE_URL) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith(host)) return real(input, init);
    return fake.handle(url, init);
  };
  return real;
}
