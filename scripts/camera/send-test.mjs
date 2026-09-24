#!/usr/bin/env node
/**
 * What the guest is told when a send fails.
 *
 *   npm run test:camera-send
 *
 * ── Why this test exists ───────────────────────────────────────────────────
 * The reported bug was "pressing Send gives a generic connection error". The
 * cause was not the network: every failure — a 503 from our own function
 * because an environment variable is unset, a 502 because Supabase refused
 * the key, a 400 from Storage — is either >= 500 or a thrown fetch, and all
 * of them were funnelled into one message about a dropped connection while
 * the server's own explanation was read and discarded.
 *
 * So these cases are driven through the REAL sendPhoto, with fetch stubbed at
 * the two points it calls. What is asserted is not that a send fails — it is
 * what the guest and the couple are told when it does.
 *
 * Nothing here touches the network, and no photograph is uploaded.
 */

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ── Load the real module ────────────────────────────────────────────────── */

const out = join(mkdtempSync(join(tmpdir(), 'camera-send-')), 'photoService.mjs');
await build({
  entryPoints: [join(ROOT, 'src/features/camera/photoService.ts')],
  outfile: out, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
});
const svc = await import(out);

/** A prepared photograph, without a browser. */
const photo = {
  id: 'p1',
  blob: { size: 900_000, type: 'image/jpeg' },
  contentType: 'image/jpeg',
  previewUrl: 'blob:x',
  width: 2400, height: 1800,
  processed: true,
};
const SESSION = '11111111-2222-4333-a444-555555555555';

/** Replaces the two fetches. `plan` answers by URL. */
function stub(plan) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const which = u.includes('/api/photos/sign') ? 'sign' : 'upload';
    calls.push({ which, url: u, method: init?.method });
    const answer = plan[which];
    if (typeof answer === 'function') return answer(init);
    // A Response body can only be read once, and a retry makes the same call
    // again. Clone, or the second attempt sees an already-consumed body —
    // which is a fact about this stub, not about the browser.
    return answer.clone();
  };
  return calls;
}

const jsonRes = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// The real backoff is 2s then 6s. Three attempts of that in every failing
// case would make this suite take a minute for nothing, so it is neutralised.
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 50 ? 0 : ms, ...a);

/* ── The success path ────────────────────────────────────────────────────── */

console.log('\nA send that works');
{
  const calls = stub({
    sign: jsonRes(200, { uploadUrl: 'https://x.supabase.co/storage/v1/object/upload/sign/guest-photos/s/o.jpg?token=SECRET', path: 's/o.jpg' }),
    upload: new Response('', { status: 200 }),
  });
  const r = await svc.sendPhoto(SESSION, photo);
  ok('it reports ok', r.ok, JSON.stringify(r));
  eq('and the path it stored', r.path, 's/o.jpg');
  eq('two requests', calls.length, 2);
  eq('the first is our own API', calls[0].url, '/api/photos/sign');
  eq('POSTed', calls[0].method, 'POST');
  eq('the second PUTs the bytes to Supabase', calls[1].method, 'PUT');
  ok('straight to Storage, not through the function',
     calls[1].url.includes('/storage/v1/object/upload/sign/'));
  ok('no diagnostic on success', !('diagnostic' in r));
}

/* ── The failure that started all this ───────────────────────────────────── */

console.log('\nA 503 from our own function is NOT a dropped connection');
{
  // Exactly what an unset SUPABASE_SERVICE_ROLE_KEY produces: readStorageEnv
  // throws ConfigError, fail() answers 503 not_configured.
  stub({
    sign: jsonRes(503, { error: 'not_configured', detail: 'SUPABASE_SERVICE_ROLE_KEY is not set' }),
    upload: new Response('', { status: 200 }),
  });
  const r = await svc.sendPhoto(SESSION, photo);
  ok('it fails', !r.ok);
  ok('and does NOT claim the connection dropped',
     !/connection dropped/i.test(r.detail ?? ''), r.detail);
  ok('it says the service answered with an error', /answered with an error/i.test(r.detail ?? ''));
  ok('naming the status', /503/.test(r.detail ?? ''));

  const d = r.diagnostic;
  eq('the stage is recorded', d.stage, 'sign');
  eq('the category is server, not network', d.kind, 'server');
  eq('the status survives the retries', d.status, 503);
  eq('and so does the code', d.code, 'not_configured');
  eq('all three attempts are counted', d.attempts, 3);
  eq('the line a phone shows', svc.diagnosticLine(d), 'sign · server · HTTP 503 · not_configured · 3 attempts');
}

console.log('\nA 502 because Supabase refused the key');
{
  stub({
    sign: jsonRes(502, { error: 'upstream', detail: 'The photo store did not answer.', upstreamStatus: 401 }),
    upload: new Response('', { status: 200 }),
  });
  const r = await svc.sendPhoto(SESSION, photo);
  eq('reported as a server failure', r.diagnostic.kind, 'server');
  eq('at the signing stage', r.diagnostic.stage, 'sign');
  eq('with our own error code', r.diagnostic.code, 'upstream');
}

/* ── Failures that are refusals, not retries ─────────────────────────────── */

console.log('\nA refusal is not retried, and says what the server said');
{
  const calls = stub({
    sign: jsonRes(415, { error: 'unsupported_type', detail: 'Only image/jpeg, image/png … may be uploaded.' }),
    upload: new Response('', { status: 200 }),
  });
  const r = await svc.sendPhoto(SESSION, photo);
  ok('it fails', !r.ok);
  ok('with the server\'s own words', /may be uploaded/.test(r.reason), r.reason);
  eq('asked exactly once — repeating would change nothing', calls.length, 1);
  eq('category', r.diagnostic.kind, 'refused');
  eq('status', r.diagnostic.status, 415);
  eq('code', r.diagnostic.code, 'unsupported_type');
  eq('one attempt', r.diagnostic.attempts, 1);
}
{
  stub({
    sign: jsonRes(429, { error: 'rate_limited', detail: 'That is a lot of photos at once — give it a minute.' }),
    upload: new Response('', { status: 200 }),
  });
  const r = await svc.sendPhoto(SESSION, photo);
  eq('a rate limit is a refusal', r.diagnostic.kind, 'refused');
  eq('and is named', r.diagnostic.code, 'rate_limited');
}

/* ── Failures at the upload, not the signing ─────────────────────────────── */

console.log('\nThe stage tells you which half broke');
{
  // Signing works; the PUT to Supabase is rejected. This is the shape of a
  // bucket that does not accept the type, or a stale signature.
  stub({
    sign: jsonRes(200, { uploadUrl: 'https://x.supabase.co/storage/v1/o?token=SECRET', path: 's/o.jpg' }),
    upload: new Response('{"statusCode":"400","error":"InvalidRequest"}', { status: 400 }),
  });
  const r = await svc.sendPhoto(SESSION, photo);
  eq('the upload stage is named', r.diagnostic.stage, 'upload');
  eq('as a refusal', r.diagnostic.kind, 'refused');
  eq('with the status Storage gave', r.diagnostic.status, 400);
  ok('and Storage\'s body is NOT shown — the URL it came from holds a token',
     !/token|SECRET/i.test(JSON.stringify(r)), JSON.stringify(r));
}
{
  // Our API is reachable, Supabase is not. A CORS rejection looks exactly
  // like this too, and the stage is what narrows it.
  stub({
    sign: jsonRes(200, { uploadUrl: 'https://x.supabase.co/storage/v1/o?token=SECRET', path: 's/o.jpg' }),
    upload: () => { throw new TypeError('Load failed'); },
  });
  const r = await svc.sendPhoto(SESSION, photo);
  eq('a thrown fetch at the PUT is a network failure', r.diagnostic.kind, 'network');
  eq('at the upload stage', r.diagnostic.stage, 'upload');
  eq('with no status, because there was none', r.diagnostic.status, 0);
  ok('this one DOES read as a dropped connection', /connection dropped/i.test(r.detail ?? ''));
}
{
  stub({ sign: () => { throw new TypeError('Load failed'); }, upload: new Response('', { status: 200 }) });
  const r = await svc.sendPhoto(SESSION, photo);
  eq('offline at the first request is the sign stage', r.diagnostic.stage, 'sign');
  eq('network', r.diagnostic.kind, 'network');
}
{
  // A timeout is a different fact from a refused connection.
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  stub({ sign: () => { throw abort; }, upload: new Response('', { status: 200 }) });
  const r = await svc.sendPhoto(SESSION, photo);
  eq('an AbortError is a timeout, not a network failure', r.diagnostic.kind, 'timeout');
  ok('and says so', /took too long/i.test(r.detail ?? ''), r.detail);
}

/* ── Retries still work ──────────────────────────────────────────────────── */

console.log('\nA blip still recovers by itself');
{
  let n = 0;
  stub({
    sign: () => { n++; return n === 1 ? jsonRes(500, { error: 'server_error' })
      : jsonRes(200, { uploadUrl: 'https://x.supabase.co/storage/v1/o?token=T', path: 's/o.jpg' }); },
    upload: new Response('', { status: 200 }),
  });
  const r = await svc.sendPhoto(SESSION, photo);
  ok('the second attempt succeeds', r.ok, JSON.stringify(r));
  eq('and the guest is told nothing about the first', r.path, 's/o.jpg');
}

/* ── Nothing sensitive is ever in what we show ───────────────────────────── */

console.log('\nWhat a diagnostic may contain');
{
  for (const d of [
    { stage: 'sign', kind: 'server', status: 503, code: 'not_configured', attempts: 3 },
    { stage: 'upload', kind: 'network', status: 0, attempts: 3 },
  ]) {
    const line = svc.diagnosticLine(d);
    ok(`"${line}" has no URL`, !/https?:\/\//.test(line));
    ok('  …no token', !/token|bearer|key/i.test(line));
    ok('  …and is short enough to read aloud', line.length < 60, String(line.length));
  }
  // The detail the server sends for a config failure names a variable. It is
  // logged server-side, and deliberately not painted on a guest's screen.
  stub({
    sign: jsonRes(503, { error: 'not_configured', detail: 'SUPABASE_SERVICE_ROLE_KEY is not set' }),
    upload: new Response('', { status: 200 }),
  });
  const r = await svc.sendPhoto(SESSION, photo);
  ok('no environment variable name reaches the client state',
     !/SUPABASE|SERVICE_ROLE/i.test(JSON.stringify(r)), JSON.stringify(r));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
