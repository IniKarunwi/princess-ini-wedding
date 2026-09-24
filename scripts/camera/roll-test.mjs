#!/usr/bin/env node
/**
 * The photo roll: persistence, recovery, and what survives a partial batch.
 *
 *   npm run test:camera-roll
 *
 * ── What is being protected here ───────────────────────────────────────────
 * One rule, and everything else follows from it:
 *
 *     a photograph is deleted when its upload is CONFIRMED, or when the guest
 *     removes it — and at no other time.
 *
 * Not on reaching a result screen. Not on starting a new batch. Not on a
 * partial failure. If four of five send, the fifth is still on the phone, and
 * it is still there after the tab has been closed and reopened — which is
 * exactly when somebody gives up and comes back later.
 *
 * These run against fake-indexeddb, a real implementation of the IndexedDB
 * spec, rather than a hand-rolled stand-in. A mock of my own would be a test
 * of my own assumptions about a notoriously fiddly API.
 */

import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { IDBFactory } from 'fake-indexeddb';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ── The real module ─────────────────────────────────────────────────────── */

const outdir = mkdtempSync(join(tmpdir(), 'roll-'));
await build({
  entryPoints: ['src/features/camera/photoStore.ts'],
  outfile: join(outdir, 'store.mjs'), bundle: true,
  format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'error',
});
const store = await import(`file://${join(outdir, 'store.mjs')}`);

/** A fresh database per scenario, so nothing leaks between them. */
function freshDb() {
  store.useIndexedDB(new IDBFactory());
  store.resetForTests();
}

const photo = (id, status = 'ready') => ({
  id, blob: new Blob([Buffer.alloc(1024, 1)], { type: 'image/jpeg' }),
  contentType: 'image/jpeg', width: 1920, height: 1440,
  takenAt: Date.now(), status,
});

/* ── Storing and recovering ──────────────────────────────────────────────── */

console.log('\nA roll survives the page going away');
{
  freshDb();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const [i, id] of ids.entries()) {
    await store.put({ ...photo(id), takenAt: 1000 + i });
  }

  // The page is reclaimed by Safari while the OS camera is open, and comes
  // back. A new database handle, the same stored data.
  store.resetForTests();

  const back = await store.all();
  eq('all three come back', back.length, 3);
  eq('in the order they were taken', back.map(p => p.id).join(','), ids.join(','));
  ok('with their bytes', back.every(p => p.blob.size === 1024));
  ok('and their dimensions', back.every(p => p.width === 1920 && p.height === 1440));
}

console.log('\nA confirmed upload is the one thing that forgets a photograph');
{
  freshDb();
  const kept = randomUUID();
  const sent = randomUUID();
  await store.put(photo(kept));
  await store.put(photo(sent));

  await store.remove(sent);                  // what send() does on success

  const left = await store.all();
  eq('one left', left.length, 1);
  eq('and it is the one that did not send', left[0].id, kept);
}

console.log('\nA partial batch leaves the failure recoverable');
{
  freshDb();
  const ids = Array.from({ length: 5 }, () => randomUUID());
  for (const id of ids) await store.put(photo(id));

  // Four succeed, one fails — exactly the 4-of-5 case.
  for (const id of ids.slice(0, 4)) await store.remove(id);
  await store.setStatus(ids[4], 'failed');

  // Reaching the result screen does NOT clear anything.
  const afterResult = await store.all();
  eq('the fifth is still stored', afterResult.length, 1);
  eq('marked failed', afterResult[0].status, 'failed');

  // The guest closes the tab and comes back tomorrow.
  store.resetForTests();
  const afterReload = await store.all();
  eq('and it is still there after a reload', afterReload.length, 1);
  eq('same photograph', afterReload[0].id, ids[4]);
  ok('with its bytes intact, so it can be retried without retaking',
     afterReload[0].blob.size === 1024);
}

console.log('\nStarting another batch does not touch what is left');
{
  freshDb();
  const failed = randomUUID();
  await store.put(photo(failed, 'failed'));

  // takeMore() clears the RESULT, not the roll: it writes nothing here.
  const before = await store.all();
  const newOne = randomUUID();
  await store.put(photo(newOne));
  const after = await store.all();

  eq('the failure was still there', before.length, 1);
  eq('and the new photograph joins it', after.length, 2);
  ok('rather than replacing it', after.some(p => p.id === failed));
}

console.log('\nThe guest\'s own decisions');
{
  freshDb();
  const a = randomUUID(), b = randomUUID();
  await store.put(photo(a));
  await store.put(photo(b));

  await store.remove(a);
  eq('removing one removes one', (await store.all()).length, 1);

  await store.clear();
  eq('discarding the roll clears it', (await store.all()).length, 0);
}

/* ── Failing soft ────────────────────────────────────────────────────────── */

console.log('\nWithout IndexedDB, nothing throws');
{
  // Private Browsing, a full disk, a Safari that has decided otherwise.
  store.useIndexedDB(null);
  store.resetForTests();

  eq('it reports itself unavailable', await store.isAvailable(), false);
  let threw = null;
  try {
    await store.put(photo(randomUUID()));
    await store.setStatus('x', 'failed');
    await store.remove('x');
    await store.clear();
    eq('reads come back empty rather than failing', (await store.all()).length, 0);
  } catch (e) { threw = e; }
  ok('and no call throws', threw === null, String(threw));
}

console.log('\nA database that refuses to open is the same as not having one');
{
  const broken = { open() { throw new Error('SecurityError'); } };
  store.useIndexedDB(broken);
  store.resetForTests();
  eq('unavailable', await store.isAvailable(), false);
  let threw = null;
  try { await store.put(photo(randomUUID())); } catch (e) { threw = e; }
  ok('writes are silently dropped, not thrown', threw === null, String(threw));
}

/* ── The constants the batch model depends on ────────────────────────────── */

console.log('\nThe settings this was all measured against');
{
  await build({
    entryPoints: ['src/features/camera/photoService.ts'],
    outfile: join(outdir, 'svc.mjs'), bundle: true,
    format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'error',
  });
  const svc = await import(`file://${join(outdir, 'svc.mjs')}`);
  eq('the long edge is 1920', svc.MAX_EDGE, 1920);
  eq('quality is 0.78', svc.JPEG_QUALITY, 0.78);
  ok('the ceiling is unchanged at 20MB', svc.MAX_INPUT_BYTES === 20 * 1024 * 1024);

  const roll = await build({
    entryPoints: ['src/features/camera/useCameraRoll.ts'],
    write: false, bundle: true, format: 'esm', platform: 'neutral',
    target: 'es2022', logLevel: 'error', external: ['react'],
  });
  const src = roll.outputFiles[0].text;
  ok('the roll caps at ten', /MAX_ROLL\s*=\s*10/.test(src));
  // The promise that nothing uploads before Send: sendPhoto must be reachable
  // from send() and from nowhere else.
  const accept = src.slice(src.indexOf('const accept ='), src.indexOf('const send ='));
  ok('capture never reaches the network', !/sendPhoto/.test(accept));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
