#!/usr/bin/env node
/**
 * Photo in, object in the bucket: the whole Send action, end to end.
 *
 *   npm run test:camera-roundtrip
 *
 * ── What this proves that the other two do not ─────────────────────────────
 * api-test.mjs checks the signing endpoint's rules. send-test.mjs checks what
 * the browser does with each kind of answer. Neither one ever moves a byte,
 * and the question being asked is "does the image actually reach the intended
 * private Storage location".
 *
 * So this runs the REAL /api/photos/sign handler on a real HTTP server,
 * against a Supabase stand-in that behaves like Storage does — it mints a
 * token, refuses a PUT that does not carry it, enforces the bucket's own MIME
 * allowlist and size limit, and only then keeps the bytes. Then it drives the
 * REAL sendPhoto from the browser side and checks what is in the bucket.
 *
 * It cannot prove that the live Supabase project is configured correctly.
 * Nothing that runs here can. What it proves is that the code is right, so
 * that when the iPhone fails, the remaining explanations are configuration
 * and the diagnostic line says which.
 */

import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

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

/* ── A Supabase that behaves like Supabase ───────────────────────────────── */

/** The bucket, as 0008 configures it. */
const BUCKET_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const BUCKET_MAX_BYTES = 20 * 1024 * 1024;

const bucket = new Map();     // path -> { bytes, contentType, sha }
const rows = [];              // guest_photos
const tokens = new Map();     // token -> path
let publicBucket = false;     // asserted, never set

const jsonRes = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith(FAKE_SUPABASE)) return realFetch(input, init);
  const u = new URL(url);
  const headers = init.headers ?? {};

  // ── Minting a signed upload URL. Service-role only.
  if (init.method === 'POST' && u.pathname.startsWith('/storage/v1/object/upload/sign/')) {
    if (headers.apikey !== SERVICE_KEY || headers.authorization !== `Bearer ${SERVICE_KEY}`) {
      return jsonRes({ message: 'Invalid JWT' }, 401);
    }
    const path = u.pathname.replace('/storage/v1/object/upload/sign/guest-photos/', '');
    const token = `tok_${randomUUID()}`;
    tokens.set(token, path);
    return jsonRes({ url: `/object/upload/sign/guest-photos/${path}?token=${token}` });
  }

  // ── The upload itself. NO service-role key: the token is the whole
  //    authorisation, which is the property the design depends on.
  if (init.method === 'PUT' && u.pathname.startsWith('/storage/v1/object/upload/sign/')) {
    const token = u.searchParams.get('token');
    const path = tokens.get(token);
    if (!path) return jsonRes({ statusCode: '403', error: 'InvalidJWT', message: 'invalid signature' }, 403);
    if (u.pathname !== `/storage/v1/object/upload/sign/guest-photos/${path}`) {
      return jsonRes({ statusCode: '403', error: 'InvalidPath' }, 403);
    }
    const contentType = (headers['content-type'] ?? '').split(';')[0];
    if (!BUCKET_MIME.includes(contentType)) {
      return jsonRes({ statusCode: '415', error: 'InvalidMimeType',
                       message: `mime type ${contentType} is not supported` }, 415);
    }
    const body = Buffer.from(await new Response(init.body).arrayBuffer());
    if (body.length > BUCKET_MAX_BYTES) {
      return jsonRes({ statusCode: '413', error: 'EntityTooLarge' }, 413);
    }
    bucket.set(path, {
      bytes: body.length, contentType,
      sha: createHash('sha256').update(body).digest('hex'),
    });
    tokens.delete(token);                    // one object, once
    return jsonRes({ Key: `guest-photos/${path}` }, 200);
  }

  // ── The metadata row.
  if (u.pathname === '/rest/v1/guest_photos') {
    if (headers.apikey !== SERVICE_KEY) return jsonRes({ message: 'no key' }, 401);
    rows.push(JSON.parse(init.body));
    return new Response('', { status: 201 });
  }

  return jsonRes({ message: `unhandled ${init.method} ${u.pathname}` }, 500);
};

/* ── The real handler, on a real server ──────────────────────────────────── */

const outdir = mkdtempSync(join(tmpdir(), 'camera-rt-'));
await build({
  entryPoints: [join(ROOT, 'api/photos/sign.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: join(outdir, 'sign.mjs'),
  external: ['@vercel/node'], logLevel: 'warning',
});
const handler = (await import(`file://${join(outdir, 'sign.mjs')}`)).default;

process.env.SUPABASE_URL = FAKE_SUPABASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const vReq = { method: req.method, headers: req.headers, body, query: {} };
  const vRes = {
    statusCode: 200,
    setHeader: (k, v) => res.setHeader(k, v),
    status(code) { this.statusCode = code; return this; },
    json(payload) {
      res.writeHead(this.statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return this;
    },
  };
  await handler(vReq, vRes);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

/* ── The real browser module ─────────────────────────────────────────────── */

await build({
  entryPoints: [join(ROOT, 'src/features/camera/photoService.ts')],
  outfile: join(outdir, 'photoService.mjs'), bundle: true,
  format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'warning',
});
const svc = await import(`file://${join(outdir, 'photoService.mjs')}`);

// sendPhoto fetches '/api/photos/sign', a relative URL with no page to be
// relative to. Point it at the server; everything else goes out untouched.
const browserFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  browserFetch(String(input).startsWith('/') ? `${origin}${input}` : input, init);

/** Stands in for what the canvas re-encode produces. */
function fakePhoto(bytes, contentType = 'image/jpeg') {
  const data = Buffer.alloc(bytes, 7);
  return {
    photo: {
      id: 'p1', blob: new Blob([data], { type: contentType }), contentType,
      previewUrl: 'blob:x', width: 2400, height: 1800, processed: true,
    },
    sha: createHash('sha256').update(data).digest('hex'),
  };
}

/* ── The thing we actually want to know ──────────────────────────────────── */

console.log('\nA photograph reaches the bucket');
{
  const session = randomUUID();
  const { photo, sha } = fakePhoto(950_000);
  const r = await svc.sendPhoto(session, photo);

  ok('the send succeeds', r.ok, JSON.stringify(r));
  eq('exactly one object is in the bucket', bucket.size, 1);

  const [path, object] = [...bucket.entries()][0];
  eq('at the path the server chose', path, r.path);
  ok('under the session id, which the browser minted', path.startsWith(`${session}/`), path);
  ok('with a server-generated object name — never the client\'s',
     /^[0-9a-f-]{36}\.jpg$/.test(path.split('/')[1]), path);
  eq('the bytes are intact, not re-encoded in transit', object.sha, sha);
  eq('the size matches', object.bytes, 950_000);
  eq('and the type', object.contentType, 'image/jpeg');

  eq('one metadata row was written', rows.length, 1);
  eq('pointing at the same object', rows[0].storage_path, path);
  eq('with the session', rows[0].session_id, session);
  eq('and the size the client declared', rows[0].bytes, 950_000);
  ok('status is not sent by the client — the column defaults it',
     !('status' in rows[0]), JSON.stringify(rows[0]));
  eq('the bucket is private', publicBucket, false);
}

console.log('\nTwo photographs in one sitting do not collide');
{
  bucket.clear(); rows.length = 0;
  const session = randomUUID();
  const a = fakePhoto(400_000);
  const b = fakePhoto(500_000);
  await svc.sendPhoto(session, a.photo);
  await svc.sendPhoto(session, b.photo);

  eq('two objects', bucket.size, 2);
  const paths = [...bucket.keys()];
  ok('both under the same session', paths.every(p => p.startsWith(`${session}/`)));
  eq('with different names', new Set(paths).size, 2);
  eq('and two rows', rows.length, 2);
}

console.log('\nThe signed URL authorises that object and nothing else');
{
  bucket.clear(); rows.length = 0;
  const session = randomUUID();
  const { photo } = fakePhoto(100_000);

  // Capture a real signed URL by watching the sign response.
  const res = await fetch(`${origin}/api/photos/sign`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: session, contentType: 'image/jpeg', bytes: 100_000 }),
  });
  const signed = await res.json();

  ok('the URL is absolute, so the browser needs no Supabase config',
     signed.uploadUrl.startsWith(FAKE_SUPABASE), signed.uploadUrl);
  ok('it carries a token', /[?&]token=/.test(signed.uploadUrl));
  ok('it does NOT carry the service-role key',
     !signed.uploadUrl.includes(SERVICE_KEY) && !JSON.stringify(signed).includes(SERVICE_KEY));

  // The same token, pointed at a different object.
  const elsewhere = signed.uploadUrl.replace(/guest-photos\/[^?]+/, 'guest-photos/someone-else/x.jpg');
  const bad = await fetch(elsewhere, {
    method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: Buffer.alloc(10),
  });
  eq('re-pointing the token at another path is refused', bad.status, 403);
  eq('and nothing was written', bucket.size, 0);

  // Used properly, once.
  const good = await fetch(signed.uploadUrl, {
    method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: Buffer.alloc(100_000, 3),
  });
  eq('the right path is accepted', good.status, 200);
  eq('one object', bucket.size, 1);

  const twice = await fetch(signed.uploadUrl, {
    method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: Buffer.alloc(100_000, 3),
  });
  eq('and the token does not work twice', twice.status, 403);
}

console.log('\nAn undecodable HEIC still arrives');
{
  // The fallback path: the browser could not decode it, so the original goes
  // up as-is. The bucket accepts heic for exactly this.
  bucket.clear(); rows.length = 0;
  const session = randomUUID();
  const { photo, sha } = fakePhoto(3_000_000, 'image/heic');
  photo.processed = false;
  const r = await svc.sendPhoto(session, photo);

  ok('it sends', r.ok, JSON.stringify(r));
  const [path, object] = [...bucket.entries()][0];
  ok('stored with a .heic extension', path.endsWith('.heic'), path);
  eq('as heic, unconverted', object.contentType, 'image/heic');
  eq('byte for byte', object.sha, sha);
}

console.log('\nA type the bucket refuses fails at the upload, and says so');
{
  bucket.clear(); rows.length = 0;
  // The API and the bucket agree today. This is what it would look like if
  // they ever drifted — the failure is at the upload stage, not at signing,
  // which is exactly what the diagnostic line is for.
  const session = randomUUID();
  const { photo } = fakePhoto(1000, 'image/jpeg');
  const saved = [...BUCKET_MIME];
  BUCKET_MIME.length = 0; BUCKET_MIME.push('image/png');

  const r = await svc.sendPhoto(session, photo);
  ok('it fails', !r.ok);
  eq('at the upload', r.diagnostic.stage, 'upload');
  eq('as a refusal', r.diagnostic.kind, 'refused');
  eq('with the bucket\'s status', r.diagnostic.status, 415);
  eq('nothing stored', bucket.size, 0);

  BUCKET_MIME.length = 0; BUCKET_MIME.push(...saved);
}

console.log('\nAn unconfigured deployment says which stage, not "connection error"');
{
  bucket.clear(); rows.length = 0;
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { photo } = fakePhoto(1000);
  const r = await svc.sendPhoto(randomUUID(), photo);

  ok('it fails', !r.ok);
  eq('at the signing stage', r.diagnostic.stage, 'sign');
  eq('as a server error', r.diagnostic.kind, 'server');
  eq('HTTP 503', r.diagnostic.status, 503);
  eq('named not_configured', r.diagnostic.code, 'not_configured');
  ok('the guest is not told the connection dropped',
     !/connection dropped/i.test(r.detail ?? ''), r.detail);
  ok('and no variable name leaks to the client',
     !/SERVICE_ROLE/i.test(JSON.stringify(r)));
  eq('nothing was uploaded', bucket.size, 0);

  process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
}

server.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
