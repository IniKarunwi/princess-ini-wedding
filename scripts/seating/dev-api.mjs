/**
 * A Vite plugin that serves api/ during `npm run dev`.
 *
 * Vercel runs those files as Serverless Functions in production. Vite knows
 * nothing about them, so without this the seating chart is broken the moment
 * you open it locally: every /api call falls through to index.html.
 *
 * ── Two modes ───────────────────────────────────────────────────────────────
 * If SUPABASE_URL and the rest are set in the environment, the handlers talk
 * to the real project — useful for checking a migration landed.
 *
 * Otherwise it starts an in-memory stand-in seeded from migration 0009, signs
 * you in with PIN 2530, and prints that it has done so. Nothing here is
 * bundled or deployed: this file is dev-only and Vite drops it from the
 * production build entirely.
 */

import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeSupabase, interceptFetch, seedFromMigration,
         FAKE_SUPABASE_URL, FAKE_SERVICE_KEY } from './fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ROUTES = {
  '/api/planner/login': 'api/planner/login.ts',
  '/api/planner/logout': 'api/planner/logout.ts',
  '/api/planner/session': 'api/planner/session.ts',
  '/api/planner/draft': 'api/planner/draft.ts',
  '/api/planner/publish': 'api/planner/publish.ts',
  '/api/seating/published': 'api/seating/published.ts',
  '/api/seating/lookup': 'api/seating/lookup.ts',
};

async function compile() {
  const outdir = mkdtempSync(join(tmpdir(), 'dev-api-'));
  const handlers = {};
  for (const [route, file] of Object.entries(ROUTES)) {
    const outfile = join(outdir, route.replaceAll('/', '_') + '.mjs');
    await build({
      entryPoints: [join(ROOT, file)],
      bundle: true, format: 'esm', platform: 'node', outfile,
      external: ['@vercel/node'], logLevel: 'warning',
    });
    handlers[route] = (await import(`file://${outfile}?t=${Date.now()}`)).default;
  }
  return handlers;
}

export default function devApi() {
  return {
    name: 'planner-dev-api',
    apply: 'serve',
    async configureServer(server) {
      const live = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        && process.env.PLANNER_PIN_HASH && process.env.PLANNER_SESSION_SECRET;

      if (!live) {
        const seed = seedFromMigration(join(ROOT, 'supabase/migrations/0009_seating_layouts.sql'));
        interceptFetch(createFakeSupabase(seed));
        const { hashPin } = await import('./session-build.mjs');
        process.env.SUPABASE_URL = FAKE_SUPABASE_URL;
        process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_KEY;
        process.env.PLANNER_PIN_HASH = await hashPin('2530');
        process.env.PLANNER_SESSION_SECRET = 'dev-only-secret';
        server.config.logger.info(
          '\n  planner api: in-memory (no database). PIN 2530. Changes vanish on restart.\n');
      } else {
        server.config.logger.info('\n  planner api: live Supabase project\n');
      }

      const handlers = await compile();

      server.middlewares.use(async (req, res, next) => {
        const path = req.url.split('?')[0];
        const handler = handlers[path];
        if (!handler) return next();

        const chunks = [];
        for await (const c of req) chunks.push(c);
        let body = {};
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { /* leave empty */ }

        const vres = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          setHeader(k, v) { res.setHeader(k, v); return this; },
          json(payload) {
            res.writeHead(this.statusCode, { 'content-type': 'application/json' });
            res.end(JSON.stringify(payload));
          },
        };
        try {
          await handler({ ...req, method: req.method, headers: req.headers, body, query: {} }, vres);
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'threw', detail: String(e) }));
        }
      });
    },
  };
}
