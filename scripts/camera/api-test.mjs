/**
 * Tests for /api/photos/sign.
 *
 * ── What is real here and what is not ───────────────────────────────────────
 * REAL: the handler itself, compiled from the same TypeScript Vercel will
 * compile; real HTTP; the real validation, the real rate limiter, and the
 * real request the handler makes to Supabase.
 *
 * NOT REAL: Supabase. There is no project in this container, so Storage and
 * PostgREST are answered by a stand-in that asserts the handler presented the
 * service-role key and recorded what it claimed to. That makes the CONTRACT
 * tested and the Supabase behaviour itself only reviewed — 0008 has to be
 * applied to a real project before anyone says this works end to end.
 *
 *   npm run test:camera-api
 */

import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAKE_SUPABASE = 'http://supabase.test';
const SERVICE_KEY = 'service-role-test-key';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ── The Supabase stand-in ───────────────────────────────────────────────── */

let signed = [];      // every object the handler asked to sign
let recorded = [];    // every metadata row the handler wrote
let storageStatus = 200;
let restStatus = 201;

const jsonRes = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith(FAKE_SUPABASE)) return realFetch(input, init);

  const u = new URL(url);

  // A handler that forgot the key would pass against a permissive fake and
  // then fail in production.
  if (init.headers?.apikey !== SERVICE_KEY) return jsonRes({ message: 'no key' }, 401);
  if (init.headers?.authorization !== `Bearer ${SERVICE_KEY}`) {
    return jsonRes({ message: 'no bearer' }, 401);
  }

  if (u.pathname.startsWith('/storage/v1/object/upload/sign/')) {
    if (storageStatus !== 200) return jsonRes({ message: 'storage said no' }, storageStatus);
    const objectPath = u.pathname.replace('/storage/v1/object/upload/sign/guest-photos/', '');
    signed.push(objectPath);
    return jsonRes({ url: `/object/upload/sign/guest-photos/${objectPath}?token=signed-token` });
  }

  if (u.pathname === '/rest/v1/guest_photos') {
    if (restStatus >= 300) return jsonRes({ message: 'rest said no', code: '42P01' }, restStatus);
    recorded.push(JSON.parse(init.body));
    return new Response('', { status: 201 });
  }

  return jsonRes({ message: `unhandled ${u.pathname}` }, 500);
};

/* ── Compile the handler ─────────────────────────────────────────────────── */

const outdir = mkdtempSync(join(tmpdir(), 'camera-api-'));
const outfile = join(outdir, 'sign.mjs');
await build({
  entryPoints: [join(ROOT, 'api/photos/sign.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile,
  external: ['@vercel/node'], logLevel: 'warning',
});
const handler = (await import(`file://${outfile}`)).default;

/* ── A server shaped like Vercel's ───────────────────────────────────────── */

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = raw; }

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
    res.end(JSON.stringify({ error: 'threw', message: String(e) }));
  }
});

process.env.SUPABASE_URL = FAKE_SUPABASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const sign = (body, method = 'POST') =>
  fetch(`${BASE}/api/photos/sign`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': currentIp },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

let ipCounter = 0;
let currentIp = '10.0.0.1';
/** A fresh address per group, so the shared limiter cannot leak between them. */
const freshIp = () => { currentIp = `10.0.1.${++ipCounter}`; };

const SESSION = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const good = (over = {}) =>
  ({ sessionId: SESSION, contentType: 'image/jpeg', bytes: 900_000, width: 2400, height: 1800, ...over });

/* ── Method ──────────────────────────────────────────────────────────────── */

console.log('\nMethod');
freshIp();
{
  const res = await sign(null, 'GET');
  eq('GET is refused', res.status, 405);
  eq('and says what is allowed', res.headers.get('allow'), 'POST');
}
{
  const res = await sign(null, 'DELETE');
  eq('DELETE is refused', res.status, 405);
}

/* ── MIME types ──────────────────────────────────────────────────────────── */

console.log('\nAccepted types');
for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
  freshIp();
  const res = await sign(good({ contentType: t }));
  eq(`${t} is accepted`, res.status, 200);
}

console.log('\nRefused types');
freshIp();
for (const t of ['image/gif', 'image/svg+xml', 'video/mp4', 'application/pdf', 'text/html', '']) {
  const res = await sign(good({ contentType: t }));
  ok(`${t || '(empty)'} is refused`, res.status === 415 || res.status === 400,
     `got ${res.status}`);
}
{
  // A parameterised type is still the type it names.
  freshIp();
  const res = await sign(good({ contentType: 'image/jpeg; charset=binary' }));
  eq('image/jpeg with parameters is accepted', res.status, 200);
}

/* ── Size ────────────────────────────────────────────────────────────────── */

console.log('\nSize');
freshIp();
{
  const res = await sign(good({ bytes: 20 * 1024 * 1024 }));
  eq('exactly 20MB is accepted', res.status, 200);
}
{
  const res = await sign(good({ bytes: 20 * 1024 * 1024 + 1 }));
  eq('one byte over 20MB is refused', res.status, 413);
  const body = await res.json();
  eq('and names the limit', body.error, 'too_large');
}
for (const b of [0, -1, 1.5, '900', null, undefined]) {
  const res = await sign(good({ bytes: b }));
  eq(`bytes=${JSON.stringify(b)} is refused`, res.status, 400);
}

/* ── Session id ──────────────────────────────────────────────────────────── */

console.log('\nSession id');
freshIp();
for (const s of ['', 'not-a-uuid', '../../etc/passwd', 123, null]) {
  const res = await sign(good({ sessionId: s }));
  eq(`sessionId=${JSON.stringify(s)} is refused`, res.status, 400);
}
{
  const res = await sign('not json at all');
  eq('a non-object body is refused', res.status, 400);
}

/* ── The signed reply ────────────────────────────────────────────────────── */

console.log('\nWhat comes back');
freshIp();
signed = []; recorded = [];
{
  const res = await sign(good());
  const body = await res.json();
  eq('200', res.status, 200);
  ok('an absolute upload URL', typeof body.uploadUrl === 'string'
     && body.uploadUrl.startsWith(`${FAKE_SUPABASE}/storage/v1/object/upload/sign/guest-photos/`));
  ok('carrying the token', body.uploadUrl.includes('token=signed-token'));
  ok('a path inside the session folder', body.path.startsWith(`${SESSION}/`));
  ok('ending in .jpg for a jpeg', body.path.endsWith('.jpg'));
  eq('the content type it may send', body.contentType, 'image/jpeg');
  eq('the ceiling', body.maxBytes, 20 * 1024 * 1024);

  ok('the object id is a uuid, not anything the client sent',
     /^[0-9a-f-]{36}\.jpg$/.test(body.path.split('/')[1]));

  eq('one metadata row was written', recorded.length, 1);
  eq('for that path', recorded[0].storage_path, body.path);
  eq('in that session', recorded[0].session_id, SESSION);
  eq('with the claimed size', recorded[0].bytes, 900_000);
  eq('and the dimensions', recorded[0].width, 2400);
  ok('status is NOT sent by the client path', !('status' in recorded[0]));
}
{
  // Two calls must never collide, even within one session.
  freshIp();
  const a = await (await sign(good())).json();
  const b = await (await sign(good())).json();
  ok('two photos in one session get different paths', a.path !== b.path);
}
{
  freshIp();
  const res = await sign(good({ contentType: 'image/heic' }));
  const body = await res.json();
  ok('a heic keeps its own extension', body.path.endsWith('.heic'));
}

/* ── No secret leakage ───────────────────────────────────────────────────── */

console.log('\nSecrets');
freshIp();
{
  const res = await sign(good());
  const text = await res.text();
  ok('the service-role key is not in a success body', !text.includes(SERVICE_KEY));
  ok('nor is the word service_role', !/service[_-]?role/i.test(text));
  ok('the signed URL is the only credential returned',
     (text.match(/token=/g) ?? []).length === 1);
}
{
  storageStatus = 500;
  freshIp();
  const res = await sign(good());
  const text = await res.text();
  ok('an upstream storage failure is a 5xx', res.status >= 500, `got ${res.status}`);
  ok('and leaks no key', !text.includes(SERVICE_KEY));
  ok('and does not claim the seating chart broke', !/seating/i.test(text));
  storageStatus = 200;
}
{
  restStatus = 400;
  freshIp();
  const res = await sign(good());
  const text = await res.text();
  ok('an upstream metadata failure is reported', res.status >= 400);
  ok('and leaks no key', !text.includes(SERVICE_KEY));
  restStatus = 201;
}
{
  // Configuration errors must name the variable, never its value.
  const url = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  freshIp();
  const res = await sign(good());
  const text = await res.text();
  eq('missing configuration is a 503', res.status, 503);
  ok('and names the variable', text.includes('SUPABASE_URL'));
  ok('and not the key', !text.includes(SERVICE_KEY));
  process.env.SUPABASE_URL = url;
}

/* ── Rate limiting ───────────────────────────────────────────────────────── */

console.log('\nRate limiting');
freshIp();
{
  let lastOk = 0;
  let limited = null;
  for (let i = 1; i <= 45; i++) {
    const res = await sign(good());
    if (res.status === 200) lastOk = i;
    else if (res.status === 429) { limited = i; break; }
  }
  eq('the 40th is still allowed', lastOk, 40);
  eq('the 41st is refused', limited, 41);
}
{
  const res = await sign(good());
  eq('and stays refused', res.status, 429);
  ok('with a retry-after', Number(res.headers.get('retry-after')) > 0);
}
{
  freshIp();
  const res = await sign(good());
  eq('a different address is unaffected', res.status, 200);
}

/* ── Done ────────────────────────────────────────────────────────────────── */

server.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  • ${f}`)); process.exit(1); }
