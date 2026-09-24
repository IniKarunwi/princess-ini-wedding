/**
 * Builds every api/ route with the REAL Vercel builder and loads the result.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The first production deploy of the seating API returned
 * FUNCTION_INVOCATION_FAILED on every endpoint, while 109 local API tests
 * passed. The cause was invisible to those tests by construction:
 *
 *   @vercel/node does NOT bundle. It compiles each file to .js, ships them
 *   beside a package.json carrying this project's "type": "module", and
 *   Node's ESM resolver loads them. Under ESM a relative import must carry
 *   its extension, so `from '../_lib/env'` threw ERR_MODULE_NOT_FOUND before
 *   the handler ever ran.
 *
 * The test harness and the dev server both bundle with esbuild, which
 * resolves extensionless specifiers without complaint. So the one thing
 * neither could test was the thing that broke: how the code is loaded.
 *
 * This runs the actual builder — the same package, the same version Vercel
 * uses — writes the lambda to disk exactly as deployed, and imports each
 * handler. If a function cannot even be loaded, this fails here rather than
 * in production.
 *
 * `npm run typecheck` now catches the specific extension mistake too
 * (moduleResolution: nodenext). This catches the general case: anything that
 * makes a deployed function unloadable.
 *
 *   npm run test:vercel-build
 */

import { build } from '@vercel/node';
import { glob } from '@vercel/build-utils';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'node_modules/.cache/vercel-build-test');

const ROUTES = [
  'api/planner/login.ts',
  'api/planner/logout.ts',
  'api/planner/session.ts',
  'api/planner/draft.ts',
  'api/planner/publish.ts',
  'api/seating/published.ts',
  'api/seating/lookup.ts',
  'api/photos/sign.ts',
];

const results = [];
const ck = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? '✓' : '✗'} ${name}${!pass && detail ? `  — ${detail}` : ''}`);
};

rmSync(OUT, { recursive: true, force: true });

const files = await glob('**', {
  cwd: ROOT,
  ignore: ['node_modules/**', 'dist/**', '.git/**', '.vercel/**', 'scratchpad/**'],
});

console.log('\nBuilding each function the way Vercel does');

for (const entrypoint of ROUTES) {
  let lambda;
  try {
    const res = await build({
      files, entrypoint, workPath: ROOT, repoRootPath: ROOT,
      config: {}, meta: { skipDownload: true },
    });
    lambda = res.output;
  } catch (e) {
    ck(`${entrypoint} builds`, false, String(e).slice(0, 200));
    continue;
  }
  ck(`${entrypoint} builds`, !!lambda);

  const dir = join(OUT, entrypoint.replaceAll('/', '_'));
  for (const [name, f] of Object.entries(lambda.files)) {
    const dest = join(dir, name);
    mkdirSync(dirname(dest), { recursive: true });
    await new Promise((resolve, reject) => {
      f.toStream().pipe(createWriteStream(dest)).on('finish', resolve).on('error', reject);
    });
  }

  // The moment of truth: can Node actually load what was deployed?
  const handlerPath = join(dir, lambda.handler);
  try {
    const mod = await import(`file://${handlerPath}`);
    ck(`${entrypoint} loads at runtime`, typeof mod.default === 'function',
       `default export is ${typeof mod.default}`);
  } catch (e) {
    ck(`${entrypoint} loads at runtime`, false, `${e.code ?? ''} ${e.message.split('\n')[0]}`);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
