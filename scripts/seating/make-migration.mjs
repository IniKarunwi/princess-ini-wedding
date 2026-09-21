/**
 * Generates supabase/migrations/0009_seating_layouts.sql.
 *
 * The seed payload is NOT hand-written and NOT taken from anybody's browser.
 * It is produced by running the application's own buildInitialLayout() — the
 * same function the prototype used — so the first server-side published
 * layout is the canonical plan from the seating document, byte for byte.
 *
 * Re-run this only if the canonical source changes AND the migration has not
 * been applied yet. Once 0009 is applied, the server rows are the truth and
 * this file must not be regenerated over them: the SQL guards that with
 * `on conflict (status) do nothing`, but do not tempt it.
 *
 *   node scripts/seating/make-migration.mjs
 */

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(tmpdir(), 'seed-layout.mjs');

await build({
  entryPoints: [join(root, 'src/features/seating/model.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'warning',
});

const { buildInitialLayout } = await import(`file://${out}?t=${Date.now()}`);
const layout = buildInitialLayout();

/**
 * The stored payload carries no version and no status.
 *
 * Those live in the row's own columns, and duplicating them inside the JSON
 * is how a row ends up claiming to be version 4 while its payload says 3.
 * The API reassembles the Layout from column + payload on the way out.
 */
const payload = {
  tables: layout.tables,
  // A fixed instant, so regenerating this file produces an identical diff
  // instead of a timestamp-only change.
  updatedAt: '2026-09-21T00:00:00.000Z',
  label: 'Imported from the seating document',
};

const seats = layout.tables.reduce(
  (n, t) => n + t.entries.reduce((m, e) => m + e.seats, 0), 0);

const json = JSON.stringify(payload);
if (json.includes('$seed$')) throw new Error('payload would break the dollar quote');

const sql = readFileSync(join(root, 'scripts/seating/0009.template.sql'), 'utf8')
  .replaceAll('__PAYLOAD__', json)
  .replaceAll('__TABLES__', String(layout.tables.length))
  .replaceAll('__SEATS__', String(seats));

const dest = join(root, 'supabase/migrations/0009_seating_layouts.sql');
writeFileSync(dest, sql);
console.log(`wrote ${dest}`);
console.log(`  ${layout.tables.length} tables, ${seats} seats, ${json.length} bytes of payload`);
