/**
 * Compiles api/_lib/session.ts so Node scripts can use hashPin() and the
 * token helpers without a build step of their own.
 *
 * One definition of how a PIN is hashed and how a token is signed. A second
 * copy written in JavaScript "just for the dev server" is how a hash format
 * quietly diverges from the one production verifies.
 */

import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outfile = join(mkdtempSync(join(tmpdir(), 'session-')), 'session.mjs');

await build({
  entryPoints: [join(ROOT, 'api/_lib/session.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'warning',
});

export const { hashPin, checkPin, issue, verify, readCookie } =
  await import(`file://${outfile}`);
