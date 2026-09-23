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

import { sendEmail, sendWithRetry, SendError } from './resend.mjs';
import { idempotencyKey, newRunId, CAMPAIGN } from './idempotency.mjs';
import { parseSchedule, inWAT } from './schedule.mjs';
import { verdictFor } from './verify-scheduled.mjs';

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
        idempotencyKey: init?.headers?.['Idempotency-Key'] ?? null,
        scheduledAt: (() => {
          try { return JSON.parse(init?.body ?? '{}').scheduled_at ?? null; } catch { return null; }
        })(),
        bodyLength: typeof init?.body === 'string' ? init.body.length : null,
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

/* ── Repeated test sends ─────────────────────────────────────────────────────
 * The second test send failed with
 *
 *   HTTP 409: This idempotency key has been used with this HTTP method and
 *   endpoint within the last 24 hours, but the request body was modified and
 *   doesn't match the original request.
 *
 * because the key was the campaign and the address, which is exactly right
 * for a guest and exactly wrong for a test. You send one, look at it, change
 * the letter, send another — that is what a test send IS, and the old key
 * made the second one indistinguishable from an accidental duplicate. */

console.log('\nA second test send, after the letter changed');
{
  // Two separate invocations, with different content: the doodles on in one
  // and off in the other, which is the shape of the change that caused the
  // 409 in the first place.
  const first  = runSender({ key: FAKE_KEY, args: ['--send', '--to', 'selftest@example.com', '--yes'] });
  const second = runSender({ key: FAKE_KEY, args: ['--send', '--to', 'selftest@example.com', '--yes',
                                                   '--preview-tier', 'RECEPTION'] });

  const a = first.seen.requests.find(q => q.url.includes('api.resend.com'));
  const b = second.seen.requests.find(q => q.url.includes('api.resend.com'));

  ok('both runs reached Resend', !!a && !!b);
  ok('the letters really were different', a?.bodyLength !== b?.bodyLength,
     `${a?.bodyLength} vs ${b?.bodyLength}`);
  ok('the two runs used DIFFERENT idempotency keys',
     a?.idempotencyKey !== b?.idempotencyKey,
     `both were ${a?.idempotencyKey}`);
  ok('each key is marked as a test', /:test:/.test(a?.idempotencyKey ?? ''),
     a?.idempotencyKey);
  ok('and still carries the campaign and the address',
     (a?.idempotencyKey ?? '').startsWith(`${CAMPAIGN}:test:`) &&
     (a?.idempotencyKey ?? '').endsWith(':selftest@example.com'), a?.idempotencyKey);
  eq('both runs succeeded', `${first.status}${second.status}`, '00');
}

console.log('\nWithin ONE run, a retry reuses the key');
{
  // The protection that must survive: a lost response must not deliver two
  // copies. sendWithRetry is driven here directly, because a dropped
  // connection cannot be produced from the command line.
  const keys = [];
  let attempts = 0;
  const fetchImpl = async (url, init) => {
    keys.push(init.headers['Idempotency-Key']);
    attempts++;
    if (attempts === 1) throw new Error('socket hang up');   // retryable
    return new Response(JSON.stringify({ id: 'msg_retry' }), {
      status: 200, headers: { 'content-type': 'application/json' } });
  };
  const key = idempotencyKey({ email: 'you@example.com', test: true, runId: 'abc123' });
  const id = await sendWithRetry({
    apiKey: FAKE_KEY, from: 'a@b.com', to: 'you@example.com',
    subject: 's', html: 'h', text: 't', idempotencyKey: key, fetchImpl,
  });
  eq('it eventually sent', id, 'msg_retry');
  eq('after two attempts', attempts, 2);
  ok('both attempts carried the SAME key — Resend returns the first message',
     keys.length === 2 && keys[0] === keys[1], keys.join(' vs '));
}

console.log('\nThe key rules themselves');
{
  const guest = (e) => idempotencyKey({ email: e });
  eq('a guest key is the campaign and the address',
     guest('Guest@Example.com '), `${CAMPAIGN}:guest@example.com`);
  eq('and is stable across runs — a re-run cannot email them twice',
     guest('g@example.com'), guest('g@example.com'));
  ok('a guest key carries no run id', !/:test:/.test(guest('g@example.com')));

  const t = (runId) => idempotencyKey({ email: 'you@example.com', test: true, runId });
  ok('a test key is stable within a run', t('r1') === t('r1'));
  ok('and different across runs', t('r1') !== t('r2'));
  ok('a test key never collides with that guest\'s real key',
     t('r1') !== idempotencyKey({ email: 'you@example.com' }));

  let err = null;
  try { idempotencyKey({ email: 'a@b.com', test: true }); } catch (e) { err = e; }
  ok('a test key without a runId is refused, not silently generated',
     /needs a runId/.test(err?.message ?? ''), err?.message);

  // Two ids in a row must differ, or the whole scheme is decorative.
  const ids = new Set(Array.from({ length: 200 }, () => newRunId()));
  eq('run ids are unique', ids.size, 200);
}

/* ── Scheduling ──────────────────────────────────────────────────────────── */

console.log('\nThe schedule is parsed strictly, because an hour out is a disaster');
{
  const NOW = new Date('2026-09-24T09:00:00Z');
  const s = parseSchedule('2026-09-24T11:00:00Z', { now: NOW });
  eq('11:00 UTC goes on the wire as itself', s.iso, '2026-09-24T11:00:00.000Z');
  eq('and is noon in Lagos', s.wat, '2026-09-24 12:00 WAT');

  const wat = parseSchedule('2026-09-24T12:00:00+01:00', { now: NOW });
  eq('the same instant written in WAT normalises to the same UTC', wat.iso, s.iso);

  const bad = (input, why) => {
    let err = null;
    try { parseSchedule(input, { now: NOW }); } catch (e) { err = e; }
    ok(`refused: ${why}`, !!err, `accepted ${input}`);
    return err;
  };
  // The one that would silently be an hour out on a UTC server.
  const noOffset = bad('2026-09-24T12:00:00', 'no timezone offset');
  ok('  …and the message explains why', /explicit offset/.test(noOffset?.message ?? ''));
  bad('2026-09-24', 'a date with no time');
  bad('in 2 hours', 'natural language');
  bad('2026-09-24T09:00:00Z', 'in the past');
  bad('', 'empty');
  bad('2026-12-31T11:00:00Z', 'more than 30 days out');

  eq('WAT is UTC+1 with no DST', inWAT(new Date('2026-01-15T23:30:00Z')), '2026-01-16 00:30 WAT');
}

console.log('\nThe scheduled instant reaches Resend');
{
  let body = null;
  const fetchImpl = async (url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'msg_sched' }), {
      status: 200, headers: { 'content-type': 'application/json' } });
  };
  await sendEmail({
    apiKey: FAKE_KEY, from: 'a@b.com', to: 'c@d.com', subject: 's', html: 'h', text: 't',
    scheduledAt: '2026-09-24T11:00:00.000Z', fetchImpl,
  });
  eq('as scheduled_at, the field Resend reads', body.scheduled_at, '2026-09-24T11:00:00.000Z');

  // Absent, the body must be exactly what it always was.
  body = null;
  await sendEmail({ apiKey: FAKE_KEY, from: 'a@b.com', to: 'c@d.com',
                    subject: 's', html: 'h', text: 't', fetchImpl });
  ok('an unscheduled send carries no scheduled_at key at all',
     !('scheduled_at' in body), JSON.stringify(Object.keys(body)));
}

console.log('\nA test send is immediate unless it is explicitly scheduled');
{
  // Relative to the clock, not a fixed date: a test that starts failing on a
  // particular morning is a test nobody trusts. Three days out at 11:00 UTC,
  // which is noon in Lagos and well inside Resend's 30-day limit.
  const when = new Date(Date.now() + 3 * 86_400_000);
  when.setUTCHours(11, 0, 0, 0);
  const WHEN_ISO = when.toISOString();
  const WHEN_ARG = WHEN_ISO.replace('.000Z', 'Z');
  const WHEN_WAT = inWAT(when);

  const plain = runSender({ key: FAKE_KEY, args: ['--send', '--to', 'selftest@example.com', '--yes'] });
  const q = plain.seen.requests.find(r => r.url.includes('api.resend.com'));
  eq('no --schedule means no scheduled_at', q?.scheduledAt, null);
  ok('and the output says immediate', /immediate/i.test(plain.stdout ?? ''));
  eq('it succeeded', plain.status, 0);

  const later = runSender({ key: FAKE_KEY, args: ['--send', '--to', 'selftest@example.com', '--yes',
                                                  '--schedule', WHEN_ARG] });
  const q2 = later.seen.requests.find(r => r.url.includes('api.resend.com'));
  eq('an explicit --schedule on a test is honoured', q2?.scheduledAt, WHEN_ISO);
  ok('and it is not called sent', !/\bsent\b/i.test((later.stdout ?? '').split('Resend accepted')[1] ?? ''));

  // --schedule without --send is meaningless and must not be quietly ignored.
  const noSend = runSender({ key: FAKE_KEY, args: ['--audit', '--schedule', WHEN_ARG] });
  ok('--schedule without --send is refused',
     /only applies to a send/.test(`${noSend.stdout ?? ''}${noSend.stderr ?? ''}`));
  eq('and it fails', noSend.status, 1);
}

console.log('\nAccepted is reported as accepted, never as delivered');
{
  const when = new Date(Date.now() + 3 * 86_400_000);
  when.setUTCHours(11, 0, 0, 0);
  const WHEN_ARG = when.toISOString().replace('.000Z', 'Z');
  const WHEN_WAT = inWAT(when);
  const r = runSender({ key: FAKE_KEY, args: ['--send', '--to', 'selftest@example.com', '--yes',
                                              '--schedule', WHEN_ARG] });
  const out = r.stdout ?? '';
  ok('the run says Resend HOLDS it', /holds it for/i.test(out), out.slice(-300));
  ok('it prints the instant in WAT', out.includes(WHEN_WAT), WHEN_WAT);
  ok('it does not claim delivery', !/delivered/i.test(out));
}

console.log('\nThe verifier judges Resend\'s answer, not our own hopes');
{
  const want = '2026-09-24T11:00:00.000Z';
  const good = verdictFor({ last_event: 'scheduled', scheduled_at: want }, want);
  ok('a correctly scheduled message passes', good.ok);

  ok('a message with no scheduled_at fails',
     verdictFor({ last_event: 'delivered', scheduled_at: null }, want).ok === false);
  ok('the wrong instant fails',
     verdictFor({ last_event: 'scheduled', scheduled_at: '2026-09-24T12:00:00.000Z' }, want).ok === false);
  ok('a cancelled message fails',
     verdictFor({ last_event: 'canceled', scheduled_at: want }, want).ok === false);
  ok('an unreadable one fails rather than passing quietly',
     verdictFor({ error: 'HTTP 404' }, want).ok === false);
  ok('the same instant written differently still passes',
     verdictFor({ last_event: 'scheduled', scheduled_at: '2026-09-24T12:00:00+01:00' }, want).ok);
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
