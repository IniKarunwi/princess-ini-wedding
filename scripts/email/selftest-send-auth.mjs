#!/usr/bin/env node
/**
 * Does the final-details sender actually authenticate?
 *
 *   npm run test:email:send-auth
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The sender was built passing every field sendEmail needs except `apiKey`.
 * Nothing failed at the call site: sendEmail interpolates whatever it is given
 * into `Bearer ${apiKey}`, so an absent key becomes the literal string
 * "Bearer undefined" and Resend replies "API key is invalid". A valid key in
 * .env, a valid key in the dashboard, and a 401 that blames the key — the one
 * place the fault actually was is the only place the message did not point.
 *
 * No unit test could have caught it, because every unit was correct. What was
 * wrong was the wiring between them. So this test drives the REAL entry point
 * — the same file, the same flags, the same argument parsing — with the HTTP
 * layer replaced, and then reads the Authorization header that was actually
 * constructed.
 *
 * ── Nothing is sent ────────────────────────────────────────────────────────
 * fetch is replaced in the child process before the sender is imported, so no
 * request leaves the machine, and the key is a fake one that Resend would
 * reject anyway.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { sendEmail, SendError } from './resend.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FAKE_KEY = 're_selftest_not_a_real_key';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ── The transport, on its own ───────────────────────────────────────────── */

console.log('\nThe transport builds the header it is given');
{
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ id: 'msg_1' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const id = await sendEmail({
    apiKey: FAKE_KEY, from: 'a@b.com', to: 'c@d.com',
    subject: 's', html: '<p>h</p>', text: 't', fetchImpl,
  });
  eq('the message id comes back', id, 'msg_1');
  eq('the key is sent as a bearer token',
     seen.init.headers.Authorization, `Bearer ${FAKE_KEY}`);
  ok('with no stray whitespace',
     !/Bearer\s\s|\s$/.test(seen.init.headers.Authorization));
  eq('and it is the endpoint we think', seen.url, 'https://api.resend.com/emails');
}
{
  // Surrounding whitespace in .env is invisible and would 401 exactly like a
  // wrong key. Trim it, rather than making someone find it by eye.
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = init;
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  };
  await sendEmail({
    apiKey: `  ${FAKE_KEY}\n`, from: 'a@b.com', to: 'c@d.com',
    subject: 's', html: 'h', text: 't', fetchImpl,
  });
  eq('a padded key is trimmed, not sent as-is',
     seen.headers.Authorization, `Bearer ${FAKE_KEY}`);
}

console.log('\nA missing key is a caller error, not a rejected credential');
for (const missing of [undefined, null, '', '   ']) {
  let called = false;
  const fetchImpl = async () => { called = true; return new Response('{}', { status: 200 }); };
  let err = null;
  try {
    await sendEmail({ apiKey: missing, from: 'a@b.com', to: 'c@d.com',
                      subject: 's', html: 'h', text: 't', fetchImpl });
  } catch (e) { err = e; }
  ok(`${JSON.stringify(missing)} is refused`, err instanceof SendError);
  ok(`  …before any request is made`, called === false);
  ok(`  …and the message blames the caller, not the key`,
     /caller did not supply apiKey/.test(err?.message ?? ''), err?.message);
}

/* ── The real sender, end to end ─────────────────────────────────────────── */

console.log('\nThe sender passes the environment key through to the request');

/**
 * Runs prepare-final-details.mjs for real, in a child process, with fetch
 * replaced. Returns whatever the stubbed transport saw.
 */
function runSender({ key, args }) {
  const dir = mkdtempSync(join(tmpdir(), 'send-auth-'));
  const out = join(dir, 'seen.json');
  const harness = join(dir, 'harness.mjs');

  writeFileSync(harness, `
    import { writeFileSync } from 'node:fs';
    const seen = { requests: [] };
    globalThis.fetch = async (url, init) => {
      seen.requests.push({
        url: String(url),
        method: init?.method ?? 'GET',
        authorization: init?.headers?.Authorization ?? null,
      });
      writeFileSync(${JSON.stringify(out)}, JSON.stringify(seen));
      if (String(url).includes('api.resend.com')) {
        return new Response(JSON.stringify({ id: 'msg_stub' }), {
          status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    process.argv = [process.argv[0], 'prepare-final-details.mjs', ${args.map(a => JSON.stringify(a)).join(', ')}];
    await import(${JSON.stringify(join(HERE, 'prepare-final-details.mjs'))});
    writeFileSync(${JSON.stringify(out)}, JSON.stringify(seen));
  `);

  const env = { ...process.env };
  if (key === null) delete env.RESEND_API_KEY;
  else env.RESEND_API_KEY = key;

  const r = spawnSync(process.execPath, [harness], {
    env, encoding: 'utf8', cwd: process.cwd(), timeout: 60_000,
  });
  let seen = { requests: [] };
  try { seen = JSON.parse(readFileSync(out, 'utf8')); } catch { /* none */ }
  return { ...r, seen };
}

{
  const r = runSender({
    key: FAKE_KEY,
    args: ['--send', '--to', 'selftest@example.com', '--yes'],
  });
  const send = r.seen.requests.find(q => q.url.includes('api.resend.com'));

  ok('the sender reached Resend', !!send, r.stderr?.slice(0, 400));
  eq('it POSTed', send?.method, 'POST');
  eq('carrying the key from the environment',
     send?.authorization, `Bearer ${FAKE_KEY}`);
  ok('and NOT the string that caused the 401',
     send?.authorization !== 'Bearer undefined', send?.authorization);
  ok('the run reported success', /accepted the test message/.test(r.stdout ?? ''),
     (r.stdout ?? '').slice(-300));
  eq('exit code', r.status, 0);

  // A test message must not read the guest list or the seating plan.
  ok('no guest list or seating request was made',
     !r.seen.requests.some(q => /rest\/v1/.test(q.url)),
     r.seen.requests.map(q => q.url).join(' '));
}

console.log('\nWithout a key it refuses early, and says so in the right words');
{
  const r = runSender({ key: null, args: ['--send', '--to', 'selftest@example.com', '--yes'] });
  const all = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  ok('nothing was sent', !r.seen.requests.some(q => q.url.includes('api.resend.com')));
  ok('it names RESEND_API_KEY', /RESEND_API_KEY is not set/.test(all), all.slice(-300));
  ok('it suggests --env-file', /--env-file/.test(all));
  eq('and fails', r.status, 1);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
