/**
 * End-to-end tests for the shared planner backend.
 *
 * ── What is real here and what is not ───────────────────────────────────────
 * REAL: the api/ handlers themselves, compiled from the same TypeScript that
 * Vercel will compile; real HTTP over a local server; real cookies, carried
 * between "devices" exactly as a browser would; real scrypt; real HMAC; and a
 * router that reproduces Vercel's resolution order (filesystem and functions
 * BEFORE rewrites) against the real dist/ output and the real vercel.json.
 *
 * NOT REAL: Postgres. There is no database in this container, so the Supabase
 * REST calls are answered by an in-memory stand-in that implements the same
 * semantics the SQL does — `?version=eq.N` matching zero rows when the
 * version has moved on, and publish_seating raising 40001 on a stale draft.
 * That makes the CONCURRENCY LOGIC genuinely tested and the SQL itself only
 * reviewed. Migration 0009 has to be applied to a real project before anyone
 * says this works end to end.
 *
 *   npm run test:planner
 */

import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');
const FAKE_SUPABASE = 'http://supabase.test';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ── The database stand-in ───────────────────────────────────────────────── */

/**
 * The seed comes out of migration 0009 itself, not a fixture beside it.
 * If the migration's payload is malformed, these tests fail rather than
 * passing against a copy that happens to be fine.
 */
const seed = (() => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/0009_seating_layouts.sql'), 'utf8');
  const m = sql.match(/\$seed\$([\s\S]*?)\$seed\$/);
  if (!m) throw new Error('could not find the seed payload in migration 0009');
  return JSON.parse(m[1]);
})();

let db;
const resetDb = () => {
  db = {
    epoch: 1,
    rows: {
      draft: { status: 'draft', version: 1, payload: structuredClone(seed), updated_at: '2026-09-21T09:00:00.000Z', updated_by: 'canonical import' },
      published: { status: 'published', version: 1, payload: structuredClone(seed), updated_at: '2026-09-21T09:00:00.000Z', updated_by: 'canonical import' },
    },
  };
};

const jsonRes = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith(FAKE_SUPABASE)) return realFetch(input, init);

  const u = new URL(url);
  const method = (init.method ?? 'GET').toUpperCase();

  // Every call must present the service-role key. A handler that forgot it
  // would work against a permissive fake and fail in production.
  if (init.headers?.apikey !== 'service-role-test-key') return jsonRes({ message: 'no key' }, 401);

  if (u.pathname === '/rest/v1/planner_settings') {
    return jsonRes([{ session_epoch: db.epoch }]);
  }

  if (u.pathname === '/rest/v1/rpc/publish_seating') {
    const { expected_version, actor } = JSON.parse(init.body);
    const d = db.rows.draft;
    if (!d) return jsonRes({ code: 'P0002', message: 'no draft' }, 400);
    if (d.version !== expected_version) {
      return jsonRes({ code: '40001', message: `draft is at version ${d.version}, caller held ${expected_version}` }, 400);
    }
    const p = db.rows.published;
    p.payload = structuredClone(d.payload);
    p.version = (p.version ?? 0) + 1;
    p.updated_at = new Date().toISOString();
    p.updated_by = actor;
    d.payload = structuredClone(p.payload);
    d.version = d.version + 1;
    d.updated_at = p.updated_at;
    d.updated_by = actor;
    return jsonRes(structuredClone(p));
  }

  if (u.pathname === '/rest/v1/seating_layouts') {
    const status = (u.searchParams.get('status') ?? '').replace('eq.', '');
    const row = db.rows[status];

    if (method === 'GET') return jsonRes(row ? [structuredClone(row)] : []);

    if (method === 'PATCH') {
      const vFilter = u.searchParams.get('version');
      const expected = vFilter ? Number(vFilter.replace('eq.', '')) : null;
      // This is the whole point: the filter, not a read, decides.
      if (!row || (expected !== null && row.version !== expected)) return jsonRes([]);
      Object.assign(row, JSON.parse(init.body));
      return jsonRes([structuredClone(row)]);
    }
  }
  return jsonRes({ message: `unhandled ${method} ${u.pathname}` }, 500);
};

/* ── Compile the handlers ────────────────────────────────────────────────── */

const ROUTES = {
  '/api/planner/login': 'api/planner/login.ts',
  '/api/planner/logout': 'api/planner/logout.ts',
  '/api/planner/session': 'api/planner/session.ts',
  '/api/planner/draft': 'api/planner/draft.ts',
  '/api/planner/publish': 'api/planner/publish.ts',
  '/api/seating/published': 'api/seating/published.ts',
  '/api/seating/lookup': 'api/seating/lookup.ts',
};

const outdir = mkdtempSync(join(tmpdir(), 'planner-api-'));
const handlers = {};
for (const [route, file] of Object.entries(ROUTES)) {
  const outfile = join(outdir, route.replaceAll('/', '_') + '.mjs');
  await build({
    entryPoints: [join(ROOT, file)],
    bundle: true, format: 'esm', platform: 'node', outfile,
    external: ['@vercel/node'], logLevel: 'warning',
  });
  handlers[route] = (await import(`file://${outfile}`)).default;
}

/* ── A server that routes the way Vercel does ────────────────────────────── */

const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);

  // ── Step 3a: functions. Part of the filesystem layer, before rewrites.
  const handler = handlers[path];
  if (handler) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');

    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

    // The shape Vercel hands a Node function.
    const vres = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      setHeader(k, v) { res.setHeader(k, v); return this; },
      json(payload) { res.writeHead(this.statusCode, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); },
    };
    try {
      await handler({ ...req, method: req.method, headers: req.headers, body, query: {} }, vres);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'threw', detail: String(e) }));
    }
    return;
  }

  // ── Step 3b: static files.
  const onDisk = join(DIST, normalize(path));
  if (onDisk.startsWith(DIST) && existsSync(onDisk) && statSync(onDisk).isFile()) {
    res.writeHead(200, { 'content-type': TYPES[extname(onDisk)] ?? 'application/octet-stream', 'x-served-by': 'filesystem' });
    return res.end(readFileSync(onDisk));
  }

  // ── Step 4: rewrites.
  for (const r of cfg.rewrites ?? []) {
    if (new RegExp(`^${r.source}$`).test(path)) {
      const dest = join(DIST, r.destination);
      if (existsSync(dest)) {
        res.writeHead(200, { 'content-type': 'text/html', 'x-served-by': 'rewrite' });
        return res.end(readFileSync(dest));
      }
    }
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('404 NOT_FOUND');
});

await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ── A "device": its own cookie jar, like a separate browser ─────────────── */

function device() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async call(path, init = {}) {
      const res = await realFetch(BASE + path, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7',
                   ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* HTML, probably */ }
      return { status: res.status, json, text, setCookie: set, headers: res.headers };
    },
  };
}

/* ── Environment ─────────────────────────────────────────────────────────── */

const { hashPin } = await import(`file://${await (async () => {
  const o = join(outdir, 'session.mjs');
  await build({ entryPoints: [join(ROOT, 'api/_lib/session.ts')], bundle: true,
                format: 'esm', platform: 'node', outfile: o, logLevel: 'warning' });
  return o;
})()}`);

process.env.SUPABASE_URL = FAKE_SUPABASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
process.env.PLANNER_PIN_HASH = await hashPin('2530');
process.env.PLANNER_SESSION_SECRET = 'test-secret-not-a-real-one';

/* ══ Tests ═══════════════════════════════════════════════════════════════ */

const tableOf = (layout, id) => layout.tables.find((t) => t.id === id);

console.log('\nRouting — /api alongside the SPA catch-all');
{
  resetDb();
  const d = device();

  const spa = await d.call('/seating-chart');
  eq('/seating-chart still serves the app', spa.status, 200);
  ok('/seating-chart is HTML, not JSON', spa.text.includes('<div id="root"'));

  const asset = await d.call('/assets/' + (readFileSync(join(DIST, 'index.html'), 'utf8')
    .match(/assets\/(index-[^"]+\.js)/)?.[1] ?? 'missing.js'));
  eq('the JS bundle is served as itself, not rewritten', asset.status, 200);
  ok('the bundle really is JavaScript', asset.text.startsWith('import') || asset.text.includes('function'));

  const api = await d.call('/api/seating/published');
  eq('/api/seating/published reaches the function', api.status, 200);
  ok('and answers JSON, not index.html', api.json !== null);

  const nope = await d.call('/api/nope');
  eq('an unknown /api path 404s instead of returning the app', nope.status, 404);

  const deep = await d.call('/wedding/camera');
  eq('other SPA deep links still work', deep.status, 200);
}

console.log('\nThe public chart');
{
  resetDb();
  const guest = device();
  const res = await guest.call('/api/seating/published');
  eq('200 without any session', res.status, 200);
  eq('carries the published version', res.json.published.version, 1);
  eq('and the whole room', res.json.published.tables.length, seed.tables.length);
  ok('no cookie is set for a guest', !res.setCookie);

  const draft = await guest.call('/api/planner/draft');
  eq('a guest asking for the draft gets 401', draft.status, 401);
  ok('and no part of the draft leaks in the body', !JSON.stringify(draft.json).includes('tables'));
}

console.log('\nThe built bundle carries no guest names');
{
  /**
   * The seating document is a TypeScript module in src/, so it is one stray
   * import away from being compiled into the public bundle — the app only
   * stops shipping 219 names because buildInitialLayout() is now unreachable
   * from it and the bundler drops the data. That is a real guarantee but an
   * incidental one, so it is pinned here: anything that imports the source
   * tables back into the app fails this test rather than quietly publishing
   * the guest list.
   */
  const bundle = readFileSync(join(ROOT, 'dist/index.html'), 'utf8')
    .match(/assets\/[^"]+\.js/g)
    .map((f) => readFileSync(join(DIST, f), 'utf8')).join('');

  const names = seed.tables.flatMap((t) => t.entries.map((e) => e.name));
  const leaked = names.filter((n) => n.length > 5 && bundle.includes(n));
  ok('no guest name is compiled into the JavaScript', leaked.length === 0,
     `${leaked.length} leaked, e.g. ${leaked[0]}`);
  ok('and neither is the seating dataset', !bundle.includes('SOURCE_TABLES'));
}

console.log('\nThe public chart carries no guest names');
{
  resetDb();
  const guest = device();

  const res = await guest.call('/api/seating/published');
  const everyName = seed.tables.flatMap((t) => t.entries.map((e) => e.name));
  const leaked = everyName.filter((n) => res.text.includes(n));
  ok('not one of the guest names is in the response', leaked.length === 0,
     `${leaked.length} leaked, e.g. ${leaked[0]}`);
  ok('no table carries any entries at all',
     res.json.published.tables.every((t) => Array.isArray(t.entries) && t.entries.length === 0));
  ok('but the geometry is all there',
     res.json.published.tables.every((t) =>
       Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.number)
       && Number.isFinite(t.capacity)));
  ok('including a seated count, so the map still draws correctly',
     res.json.published.tables.every((t) => Number.isFinite(t.seated)));

  // Titles and group names can identify a family as surely as a name.
  ok('no table titles or group labels either',
     res.json.published.tables.every((t) => t.title === undefined && t.group === undefined));
}

console.log('\nLooking up your own seat');
{
  resetDb();
  const guest = device();

  const target = seed.tables.find((t) => t.kind === 'round' && t.entries.length);
  const person = target.entries[0];
  const others = target.entries.slice(1).map((e) => e.name);

  const hit = await guest.call('/api/seating/lookup', { method: 'POST', body: { q: person.name } });
  eq('a full name is found', hit.json.found, true);
  eq('and answered with the published table number', hit.json.table, target.number);
  eq('and the table id, since both sides number from 01', hit.json.tableId, target.id);

  // The heart of it.
  const alsoThere = others.filter((n) => hit.text.includes(n));
  ok('nobody else at that table is named', alsoThere.length === 0,
     `leaked ${alsoThere[0]}`);
  ok('and no list of tables comes back', !('tables' in hit.json));

  const cased = await guest.call('/api/seating/lookup', {
    method: 'POST', body: { q: `   ${person.name.toUpperCase()}   ` },
  });
  eq('case and stray spaces do not matter', cased.json.table, target.number);

  const word = person.name.split(/\s+/).filter((w) => w.length > 3).pop();
  if (word) {
    const partial = await guest.call('/api/seating/lookup', { method: 'POST', body: { q: word } });
    ok('a surname on its own is enough to get somewhere',
       partial.json.found === true || Array.isArray(partial.json.choices)
       || partial.json.tooMany === true,
       JSON.stringify(partial.json).slice(0, 120));
  }

  const nope = await guest.call('/api/seating/lookup', {
    method: 'POST', body: { q: 'Somebody Who Was Not Invited' },
  });
  eq('an unknown name finds nothing', nope.json.none, true);

  const short = await guest.call('/api/seating/lookup', { method: 'POST', body: { q: 'a' } });
  eq('a single letter is refused rather than answered', short.json.tooShort, true);
  ok('and returns no names', !('choices' in short.json));

  // The enumeration case: something that matches a lot of people.
  const vague = await guest.call('/api/seating/lookup', { method: 'POST', body: { q: 'mrs' } });
  ok('a very common fragment does not return the room',
     vague.json.tooMany === true || vague.json.none === true
     || (vague.json.choices?.length ?? 0) <= 6,
     JSON.stringify(vague.json).slice(0, 120));

  if (Array.isArray(vague.json.choices)) {
    ok('and an ambiguous answer never includes table numbers',
       vague.json.choices.every((c) => !('table' in c)));
  } else {
    ok('and an ambiguous answer never includes table numbers', true);
  }

  const badMethod = await guest.call('/api/seating/lookup');
  eq('GET is refused', badMethod.status, 405);
}

console.log('\nA renumber reaches the public lookup only after publishing');
{
  resetDb();
  const planner = device();
  await planner.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Princess' }, headers: { 'x-forwarded-for': '198.51.100.21' } });

  const { draft } = (await planner.call('/api/planner/draft')).json;
  const target = draft.tables.find((t) => t.kind === 'round' && t.entries.length);
  const person = target.entries[0];
  const wasNumber = target.number;
  const newNumber = 61;

  const edited = structuredClone(draft);
  edited.tables.find((t) => t.id === target.id).number = newNumber;
  const saved = await planner.call('/api/planner/draft', {
    method: 'PUT', body: { version: draft.version, payload: edited },
  });
  eq('the renumber saves to the shared draft', saved.status, 200);

  const beforePublish = await device().call('/api/seating/lookup', { method: 'POST', body: { q: person.name } });
  eq('the public lookup still gives the OLD number', beforePublish.json.table, wasNumber);

  const pub = await planner.call('/api/planner/publish', { method: 'POST', body: { version: saved.json.draft.version } });
  eq('publishing succeeds', pub.status, 200);

  const after = await device().call('/api/seating/lookup', { method: 'POST', body: { q: person.name } });
  eq('and now the guest is told the new number', after.json.table, newNumber);

  const map = await device().call('/api/seating/published');
  eq('the public map shows it too',
     map.json.published.tables.find((t) => t.id === target.id).number, newNumber);
}

console.log('\nPlanners still see everything');
{
  resetDb();
  const planner = device();
  await planner.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Ini' }, headers: { 'x-forwarded-for': '198.51.100.22' } });

  const res = await planner.call('/api/planner/draft');
  const seated = res.json.draft.tables.reduce((n, t) => n + t.entries.length, 0);
  const expected = seed.tables.reduce((n, t) => n + t.entries.length, 0);
  eq('the planner draft has every entry', seated, expected);
  ok('with names', res.json.draft.tables.some((t) => t.entries.some((e) => e.name)));
  ok('and the published layout comes back with its names too, for the dirty check',
     res.json.published !== null
     && res.json.published.tables.reduce((n, t) => n + t.entries.length, 0) === expected);
}

console.log('\nSigning in');
{
  resetDb();
  const d = device();

  const anon = await d.call('/api/planner/session');
  eq('session check answers 200 when signed out', anon.status, 200);
  eq('and says so plainly', anon.json.authenticated, false);

  const noName = await d.call('/api/planner/login', { method: 'POST', body: { pin: '2530' } });
  eq('the name is required', noName.status, 400);
  eq('with a reason', noName.json.error, 'name_required');

  const wrong = await d.call('/api/planner/login', { method: 'POST', body: { pin: '9999', name: 'Ini' } });
  eq('a wrong PIN is refused', wrong.status, 401);
  ok('and sets no cookie', !wrong.setCookie);

  const good = await d.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Princess' } });
  eq('the right PIN signs in', good.status, 200);
  eq('under the name given', good.json.name, 'Princess');
  ok('the cookie is httpOnly', /httponly/i.test(good.setCookie));
  ok('the cookie is Secure', /secure/i.test(good.setCookie));
  ok('the cookie is SameSite=Lax', /samesite=lax/i.test(good.setCookie));
  ok('the cookie lasts seven days', /max-age=604800/i.test(good.setCookie));
  ok('the PIN is not echoed anywhere in the response', !good.text.includes('2530'));

  const after = await d.call('/api/planner/session');
  eq('the session is recognised on the next request', after.json.authenticated, true);
  eq('and remembers the name', after.json.name, 'Princess');

  const out = await d.call('/api/planner/logout', { method: 'POST' });
  eq('signing out answers 200', out.status, 200);
  ok('and clears the cookie', /max-age=0/i.test(out.setCookie));
}

console.log('\nSessions: persistence, forgery and revocation');
{
  resetDb();
  const d = device();
  await d.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Ini' } });
  const token = d.cookie;

  // A closed tab, a restarted browser: same cookie, brand-new request.
  const fresh = device();
  const reopened = await realFetch(BASE + '/api/planner/session', { headers: { cookie: token } });
  eq('the same cookie still works from a new connection', (await reopened.json()).authenticated, true);
  void fresh;

  const forged = await realFetch(BASE + '/api/planner/draft', {
    headers: { cookie: 'pi_planner=' + Buffer.from(JSON.stringify(
      { n: 'Attacker', e: 1, iat: 0, exp: 9999999999 })).toString('base64url') + '.notasignature' },
  });
  eq('a forged token is refused', forged.status, 401);
  eq('for the right reason', (await forged.json()).reason, 'bad-signature');

  // Rotating the PIN: bump the epoch, every cookie dies at once.
  db.epoch = 2;
  const revoked = await realFetch(BASE + '/api/planner/draft', { headers: { cookie: token } });
  eq('bumping session_epoch revokes a live session', revoked.status, 401);
  eq('and says why', (await revoked.json()).reason, 'revoked');
  db.epoch = 1;
}

console.log('\nRate limiting the PIN');
{
  resetDb();
  let limited = 0;
  for (let i = 0; i < 12; i++) {
    const d = device();
    const r = await d.call('/api/planner/login', { method: 'POST', body: { pin: '0000', name: 'Guesser' } });
    if (r.status === 429) limited++;
  }
  ok('repeated wrong PINs start being refused', limited > 0, `${limited} of 12 were rate limited`);

  // The limiter is module state shared with the tests above; a correct PIN
  // must still be reachable once the window has been cleared by a success.
  const d = device();
  const r = await d.call('/api/planner/login', {
    method: 'POST', body: { pin: '2530', name: 'Ini' }, headers: { 'x-forwarded-for': '198.51.100.4' },
  });
  eq('a different address is unaffected', r.status, 200);
}

console.log('\nOne shared draft, two devices');
{
  resetDb();
  const laptop = device();
  const phone = device();
  await laptop.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Princess' }, headers: { 'x-forwarded-for': '198.51.100.1' } });
  await phone.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Ini' }, headers: { 'x-forwarded-for': '198.51.100.2' } });

  const a = await laptop.call('/api/planner/draft');
  eq('the laptop loads the shared draft', a.status, 200);
  eq('at version 1', a.json.draft.version, 1);

  // Move a table on the laptop and save.
  const moved = structuredClone(a.json.draft);
  const target = moved.tables.find((t) => t.kind === 'round');
  target.x += 40;
  const save = await laptop.call('/api/planner/draft', {
    method: 'PUT', body: { version: a.json.draft.version, payload: moved },
  });
  eq('the laptop saves', save.status, 200);
  eq('the version advances', save.json.draft.version, 2);
  eq('and the save is attributed', save.json.draft.updatedBy, 'Princess');

  const b = await phone.call('/api/planner/draft');
  eq("the phone sees the laptop's edit", tableOf(b.json.draft, target.id).x, target.x);
  eq('at the new version', b.json.draft.version, 2);

  // Guests are untouched until somebody publishes.
  const guest = await device().call('/api/seating/published');
  eq('guests still see the published room', guest.json.published.version, 1);
  ok('and not the draft edit',
    tableOf(guest.json.published, target.id).x !== target.x);
}

console.log('\nStale saves are refused, never merged');
{
  resetDb();
  const laptop = device();
  const phone = device();
  await laptop.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Princess' }, headers: { 'x-forwarded-for': '198.51.100.1' } });
  await phone.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Ini' }, headers: { 'x-forwarded-for': '198.51.100.2' } });

  // Both open the same version.
  const mine = (await laptop.call('/api/planner/draft')).json.draft;
  const theirs = (await phone.call('/api/planner/draft')).json.draft;
  eq('both hold version 1', mine.version, theirs.version);

  const a = structuredClone(mine);
  a.tables.find((t) => t.kind === 'round').x += 25;
  const first = await laptop.call('/api/planner/draft', { method: 'PUT', body: { version: mine.version, payload: a } });
  eq('the first save succeeds', first.status, 200);

  const b = structuredClone(theirs);
  const bTarget = b.tables.find((t) => t.kind === 'round');
  bTarget.y += 25;
  const second = await phone.call('/api/planner/draft', { method: 'PUT', body: { version: theirs.version, payload: b } });
  eq('the second, stale save is refused with 409', second.status, 409);
  eq('with a message a planner can act on', second.json.detail,
     'The seating plan has changed since you opened it.');
  eq('and the current draft to reload', second.json.current.version, 2);

  const onServer = (await laptop.call('/api/planner/draft')).json.draft;
  eq("the first planner's work survived", tableOf(onServer, a.tables[0].id).x, tableOf(a, a.tables[0].id).x);
  ok('and the second planner did NOT silently overwrite it',
    tableOf(onServer, bTarget.id).y !== bTarget.y);

  // Publishing with a stale version is refused the same way.
  const stalePublish = await phone.call('/api/planner/publish', { method: 'POST', body: { version: 1 } });
  eq('a stale publish is refused with 409', stalePublish.status, 409);
  const stillPublished = (await device().call('/api/seating/published')).json.published;
  eq('and nothing reached the guests', stillPublished.version, 1);
}

console.log('\nPublishing');
{
  resetDb();
  const laptop = device();
  await laptop.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Princess' }, headers: { 'x-forwarded-for': '198.51.100.1' } });

  const d0 = (await laptop.call('/api/planner/draft')).json.draft;
  const edited = structuredClone(d0);
  const t = edited.tables.find((x) => x.kind === 'round');
  t.x += 60;
  const saved = await laptop.call('/api/planner/draft', { method: 'PUT', body: { version: d0.version, payload: edited } });

  const pub = await laptop.call('/api/planner/publish', { method: 'POST', body: { version: saved.json.draft.version } });
  eq('publishing succeeds', pub.status, 200);
  eq('the published version is bumped', pub.json.published.version, 2);
  eq('and attributed', pub.json.published.updatedBy, 'Princess');
  eq('the edit is live', tableOf(pub.json.published, t.id).x, t.x);

  const guest = (await device().call('/api/seating/published')).json.published;
  eq('a guest sees it', tableOf(guest, t.id).x, t.x);

  const after = (await laptop.call('/api/planner/draft')).json.draft;
  eq('the draft moved with it, so nothing looks unpublished',
     tableOf(after, t.id).x, t.x);

  const anon = await device().call('/api/planner/publish', { method: 'POST', body: { version: 3 } });
  eq('an anonymous publish is refused', anon.status, 401);
}

console.log('\nTable numbers survive the whole round trip');
{
  resetDb();
  const laptop = device();
  const phone = device();
  await laptop.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Princess' }, headers: { 'x-forwarded-for': '198.51.100.1' } });
  await phone.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Ini' }, headers: { 'x-forwarded-for': '198.51.100.2' } });

  const d0 = (await laptop.call('/api/planner/draft')).json.draft;
  const brideRounds = d0.tables.filter((t) => t.side === 'bride' && t.kind === 'round');
  const [one, two] = brideRounds;
  const spare = Math.max(...brideRounds.map((t) => t.number)) + 1;

  const renumbered = structuredClone(d0);
  const rOne = tableOf(renumbered, one.id);
  const rTwo = tableOf(renumbered, two.id);
  const originalSeats = rOne.entries.map((e) => e.id).join(',');
  const originalXY = [rOne.x, rOne.y].join(',');

  rOne.number = spare;                       // renumber
  const [a, b] = [rTwo.number, rOne.number];
  void a; void b;

  const saved = await laptop.call('/api/planner/draft', { method: 'PUT', body: { version: d0.version, payload: renumbered } });
  eq('a renumber saves', saved.status, 200);

  const onPhone = (await phone.call('/api/planner/draft')).json.draft;
  eq('the new number reaches the other device', tableOf(onPhone, one.id).number, spare);
  eq('the table id is unchanged', tableOf(onPhone, one.id).id, one.id);
  eq('nobody moved', [tableOf(onPhone, one.id).x, tableOf(onPhone, one.id).y].join(','), originalXY);
  eq('and nobody was reseated', tableOf(onPhone, one.id).entries.map((e) => e.id).join(','), originalSeats);

  // Swap two numbers from the phone, then publish from the phone.
  const swapped = structuredClone(onPhone);
  const sA = tableOf(swapped, one.id), sB = tableOf(swapped, two.id);
  const [nA, nB] = [sA.number, sB.number];
  sA.number = nB; sB.number = nA;
  const sSaved = await phone.call('/api/planner/draft', { method: 'PUT', body: { version: onPhone.version, payload: swapped } });
  eq('a swap saves', sSaved.status, 200);

  const pub = await phone.call('/api/planner/publish', { method: 'POST', body: { version: sSaved.json.draft.version } });
  eq('and publishes', pub.status, 200);

  const guest = (await device().call('/api/seating/published')).json.published;
  eq('the guest chart shows the swapped numbers (a)', tableOf(guest, one.id).number, nB);
  eq('the guest chart shows the swapped numbers (b)', tableOf(guest, two.id).number, nA);
  // The public chart carries no entries by design, so who is seated where is
  // checked on the planner's side — which is where it is visible at all.
  ok('and the public chart still names nobody', tableOf(guest, one.id).entries.length === 0);
  const plannerView = (await phone.call('/api/planner/draft')).json.draft;
  eq('with guests still where they were',
     tableOf(plannerView, one.id).entries.map((e) => e.id).join(','), originalSeats);
}

console.log('\nThe server refuses nonsense');
{
  resetDb();
  const d = device();
  await d.call('/api/planner/login', { method: 'POST', body: { pin: '2530', name: 'Princess' }, headers: { 'x-forwarded-for': '198.51.100.9' } });

  const empty = await d.call('/api/planner/draft', { method: 'PUT', body: { version: 1, payload: { tables: [] } } });
  eq('an empty room is refused', empty.status, 422);

  const junk = await d.call('/api/planner/draft', { method: 'PUT', body: { version: 1, payload: { tables: [{ id: 'x' }] } } });
  eq('a malformed table is refused', junk.status, 422);

  const dupes = await d.call('/api/planner/draft', {
    method: 'PUT',
    body: { version: 1, payload: { tables: [seed.tables[0], structuredClone(seed.tables[0])] } },
  });
  eq('two tables with one id are refused', dupes.status, 422);

  const noVersion = await d.call('/api/planner/draft', { method: 'PUT', body: { payload: seed } });
  eq('a save with no version is refused', noVersion.status, 400);

  const wrongMethod = await d.call('/api/planner/publish', { method: 'GET' });
  eq('the wrong method is refused', wrongMethod.status, 405);

  const survived = (await d.call('/api/planner/draft')).json.draft;
  eq('and the room is untouched after all that', survived.tables.length, seed.tables.length);
  eq('still at version 1', survived.version, 1);
}

/* ── Done ────────────────────────────────────────────────────────────────── */

server.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
