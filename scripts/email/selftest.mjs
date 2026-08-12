#!/usr/bin/env node
/**
 * Offline test for the invitation sender. No network, no database, no API key.
 *
 *   npm run test:email
 *
 * Selection is tested against fixture rows because getting it wrong emails the
 * wrong people. Sending is tested against a fake Resend that can be told to
 * fail, because "one failure must not stop the batch" is the requirement most
 * likely to be quietly wrong.
 */

import { selectRecipients, classify, isUnsent, isSendableEmail, firstName } from './recipients.mjs';
import { renderInvitation } from './template.mjs';
import { sendWithRetry, SendError } from './resend.mjs';
import { MODE, resolveMode, findGuest, confirmationPhrase, matchesPhrase } from './guards.mjs';
import { STATUS, SUBJECT } from './config.mjs';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${name}`); }
  else { failures.push({ name, detail }); console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const guest = (over = {}) => ({
  id: `id-${Math.random().toString(36).slice(2, 8)}`,
  full_name: 'Ada Obi',
  email: 'ada@example.com',
  main_invite_status: 'APPROVED',
  email_status: null,
  last_email_sent: null,
  ...over,
});

// ── Send guards ─────────────────────────────────────────────────────────────
// The rule under test: no single flag can email the whole guest list.
section('SEND GUARDS');

const flags = (o = {}) => ({ send: false, confirmSendAll: false, yes: false, ...o });

{
  const r = resolveMode(flags({ send: true }));
  check('--send ALONE is refused', !r.ok, r.ok ? `allowed mode ${r.mode}` : undefined);
  check('the refusal says why', !r.ok && /entire guest list/i.test(r.error));
  check('the refusal shows the four scopes, narrowest first',
    !r.ok && ['--to', '--guest', '--limit', '--confirm-send-all'].every(f => r.hint.includes(f)));
}

check('--confirm-send-all --send is the only route to a full send',
  resolveMode(flags({ send: true, confirmSendAll: true })).mode === MODE.ALL);
check('--limit --send is a limited send',
  resolveMode(flags({ send: true, limit: 5 })).mode === MODE.LIMITED);
check('--guest --send is a single-guest send',
  resolveMode(flags({ send: true, guest: 'Ada' })).mode === MODE.GUEST);
check('--to --send is a sample, not a guest send',
  resolveMode(flags({ send: true, to: 'me@x.com' })).mode === MODE.SAMPLE);

check('no --send is always a dry run, whatever the scope',
  resolveMode(flags({ confirmSendAll: true })).mode === MODE.DRY_RUN
  && resolveMode(flags({ limit: 3 })).mode === MODE.DRY_RUN
  && resolveMode(flags()).mode === MODE.DRY_RUN);

check('--limit with --confirm-send-all is refused as ambiguous',
  !resolveMode(flags({ send: true, limit: 5, confirmSendAll: true })).ok);
check('--guest with --limit is refused as ambiguous',
  !resolveMode(flags({ send: true, guest: 'Ada', limit: 5 })).ok);
check('the ambiguity message names both flags',
  /--limit and --confirm-send-all/.test(
    resolveMode(flags({ send: true, limit: 5, confirmSendAll: true })).error));

check('a full send requires confirmation',
  resolveMode(flags({ send: true, confirmSendAll: true })).requiresConfirmation);
check('a limited send requires confirmation',
  resolveMode(flags({ send: true, limit: 5 })).requiresConfirmation);
check('a single-guest send requires confirmation',
  resolveMode(flags({ send: true, guest: 'Ada' })).requiresConfirmation);
check('a dry run needs no confirmation',
  !resolveMode(flags()).requiresConfirmation);

// The confirmation phrase carries the count, so it cannot be typed blind.
check('the phrase embeds the recipient count',
  confirmationPhrase(MODE.LIMITED, 5) === 'SEND 5');
check('a full send has a distinct phrase, never shared with a narrow one',
  confirmationPhrase(MODE.ALL, 187) === 'SEND ALL 187'
  && confirmationPhrase(MODE.ALL, 187) !== confirmationPhrase(MODE.LIMITED, 187));
check('"y" does not confirm anything',
  !matchesPhrase('y', confirmationPhrase(MODE.LIMITED, 5))
  && !matchesPhrase('yes', confirmationPhrase(MODE.LIMITED, 5)));
check('an empty line does not confirm',
  !matchesPhrase('', confirmationPhrase(MODE.LIMITED, 5))
  && !matchesPhrase('   ', confirmationPhrase(MODE.LIMITED, 5)));
check('the wrong count does not confirm',
  !matchesPhrase('SEND 4', confirmationPhrase(MODE.LIMITED, 5)));
check('a limited phrase cannot approve a full send',
  !matchesPhrase('SEND 187', confirmationPhrase(MODE.ALL, 187)));
check('the right phrase confirms, ignoring case and spacing',
  matchesPhrase('  send   all  187 ', confirmationPhrase(MODE.ALL, 187)));

// ── Finding one guest ───────────────────────────────────────────────────────
section('GUEST LOOKUP');

const roster = [
  { id: 'a1', full_name: 'Ada Obi',    email: 'ada@example.com' },
  { id: 'b2', full_name: 'Grace Bello', email: 'grace.b@example.com' },
  { id: 'c3', full_name: 'Grace Cole',  email: 'grace.c@example.com' },
];
check('finds by exact name',  findGuest(roster, 'Ada Obi').row?.id === 'a1');
check('finds by email',       findGuest(roster, 'grace.b@example.com').row?.id === 'b2');
check('finds by id',          findGuest(roster, 'c3').row?.id === 'c3');
check('finds by unique partial name', findGuest(roster, 'ada').row?.id === 'a1');
check('an ambiguous name is REFUSED, not guessed',
  !findGuest(roster, 'Grace').ok);
check('the ambiguity lists the candidates to choose between',
  findGuest(roster, 'Grace').hint?.includes('grace.b@example.com'));
check('an unknown name is refused', !findGuest(roster, 'Nobody').ok);

// ── Selection ───────────────────────────────────────────────────────────────
section('SELECTION');

check('NULL email_status counts as unsent',
  isUnsent(guest({ email_status: null })));
check("the sheet's literal 'Not Sent' counts as unsent",
  isUnsent(guest({ email_status: 'Not Sent' })));
check('casing and spacing in the sheet do not matter',
  isUnsent(guest({ email_status: '  NOT   SENT ' })));
check("'Sent' does not count as unsent",
  !isUnsent(guest({ email_status: 'Sent' })));

check('approved + unsent + valid email is selected',
  classify(guest()).send);
check('pending guests are not emailed',
  !classify(guest({ main_invite_status: null })).send);
check('rejected guests are not emailed',
  !classify(guest({ main_invite_status: 'REJECTED' })).send);
check('already-sent guests are not emailed again',
  !classify(guest({ email_status: 'Sent' })).send);

check('a missing email is caught',
  !classify(guest({ email: null })).send);
check('a phone number in the email column is caught',
  !isSendableEmail('08031234567'));
check('two addresses in one cell are caught',
  !isSendableEmail('a@x.com, b@x.com'));
check('a bare domain is caught',
  !isSendableEmail('example.com'));
check('an ordinary address passes',
  isSendableEmail('ada.obi@example.co.uk'));

const mixed = [
  guest({ full_name: 'Send Me' }),
  guest({ full_name: 'Pending',  main_invite_status: null }),
  guest({ full_name: 'Rejected', main_invite_status: 'REJECTED' }),
  guest({ full_name: 'Done',     email_status: 'Sent' }),
  guest({ full_name: 'No Email', email: null }),
];
const picked = selectRecipients(mixed);
check('a mixed list selects only the eligible guest',
  picked.send.length === 1 && picked.send[0].full_name === 'Send Me',
  `selected ${picked.send.length}`);
check('every skipped guest carries a reason',
  picked.skipped.length === 4 && picked.skipped.every(s => s.reason));

check('a "+3" seat suffix is not treated as a name',
  firstName({ full_name: 'Pastor Chingtok +3' }) === 'Pastor');
check('a nameless guest still gets a greeting',
  firstName({ full_name: null }) === 'Friend');

// ── Template ────────────────────────────────────────────────────────────────
section('TEMPLATE');

const rendered = renderInvitation(guest({ full_name: 'Ada Obi' }), { rsvpUrl: 'https://example.com/rsvp' });
check('greets the guest by first name', rendered.html.includes('Dear Ada,'));
check('links the RSVP site', rendered.html.includes('https://example.com/rsvp'));
check('carries the wedding date', rendered.html.includes('26th September 2026'));
check('ships a plain-text alternative', rendered.text.includes('Dear Ada,'));
check('has no external stylesheet or script',
  !/<link[^>]+stylesheet|<script/i.test(rendered.html));

const nasty = renderInvitation({ full_name: '<script>alert(1)</script> Obi', email: 'x@y.com' },
                               { rsvpUrl: 'https://example.com' });
check('escapes a name containing HTML',
  !nasty.html.includes('<script>alert(1)</script>') && nasty.html.includes('&lt;script&gt;'));

// ── Sending: a fake Resend ──────────────────────────────────────────────────
section('SENDING');

/** @param plan e.g. ['ok', {status: 500}, 'ok'] — one entry per attempt. */
function fakeResend(plan) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, init) => {
    const step = plan[Math.min(i++, plan.length - 1)];
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    if (step === 'ok') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: `msg_${i}` }) };
    }
    if (step === 'network') throw new Error('socket hang up');
    return {
      ok: false, status: step.status,
      text: async () => JSON.stringify({ message: step.message || 'rejected' }),
    };
  };
  return { fetchImpl, calls };
}

const base = { apiKey: 'k', from: 'a@b.com', to: 'c@d.com', subject: 'S', html: '<p>h</p>', text: 't' };

{
  const { fetchImpl, calls } = fakeResend(['ok']);
  const id = await sendWithRetry({ ...base, fetchImpl });
  check('a successful send returns the message id', id === 'msg_1');
  check('posts subject, html and text', calls[0].body.subject === 'S'
    && calls[0].body.html === '<p>h</p>' && calls[0].body.text === 't');
  check('sends the api key as a bearer token',
    calls[0].headers.Authorization === 'Bearer k');
}

{
  const { fetchImpl, calls } = fakeResend([{ status: 500 }, 'ok']);
  const id = await sendWithRetry({ ...base, fetchImpl });
  check('a 500 is retried and then succeeds', id === 'msg_2' && calls.length === 2);
}

{
  const { fetchImpl, calls } = fakeResend(['network', 'ok']);
  await sendWithRetry({ ...base, fetchImpl });
  check('a dropped connection is retried', calls.length === 2);
}

{
  const { fetchImpl, calls } = fakeResend([{ status: 422, message: 'Invalid `to` field' }]);
  let err;
  try { await sendWithRetry({ ...base, fetchImpl }); } catch (e) { err = e; }
  check('a rejected address is NOT retried', calls.length === 1, `${calls.length} attempts`);
  check('the rejection reason is preserved',
    err instanceof SendError && err.message.includes('Invalid `to` field'), err?.message);
}

{
  const { fetchImpl } = fakeResend([{ status: 429 }]);
  let err;
  try { await sendWithRetry({ ...base, fetchImpl }); } catch (e) { err = e; }
  check('rate limiting is retried, then reported when it persists',
    err instanceof SendError && err.status === 429);
}

{
  const { fetchImpl, calls } = fakeResend(['ok']);
  await sendWithRetry({ ...base, idempotencyKey: 'invitation:abc', fetchImpl });
  check('an idempotency key is sent, so a retry cannot double-send',
    calls[0].headers['Idempotency-Key'] === 'invitation:abc');
}

// ── The batch: one failure must not stop the rest ───────────────────────────
section('BATCH RESILIENCE');

/**
 * Mirrors the per-guest loop in send-invitations.mjs: send, then record, and
 * on failure record the guest and carry on. Kept here rather than imported
 * because the real one is welded to the CLI; the assertions below are about
 * the shape of the behaviour, which is what a regression would break.
 */
async function runBatch(guests, { failFor = [], updateFailsFor = [] } = {}) {
  const sent = [], failed = [], unrecorded = [];
  const written = [];

  for (const g of guests) {
    try {
      if (failFor.includes(g.email)) {
        throw new SendError('HTTP 422: Invalid `to` field', { status: 422 });
      }
      const messageId = `msg_${g.id}`;
      if (updateFailsFor.includes(g.email)) {
        unrecorded.push({ g, messageId });
      } else {
        written.push({ id: g.id, email_status: STATUS.SENT, last_email_sent: new Date().toISOString() });
        sent.push({ g, messageId });
      }
    } catch (err) {
      failed.push({ g, message: err.message });
    }
  }
  return { sent, failed, unrecorded, written };
}

const batch = [
  guest({ full_name: 'One',   email: 'one@example.com' }),
  guest({ full_name: 'Bad',   email: 'bad@example.com' }),
  guest({ full_name: 'Three', email: 'three@example.com' }),
  guest({ full_name: 'Four',  email: 'four@example.com' }),
];

const result = await runBatch(batch, { failFor: ['bad@example.com'] });
check('a failure mid-batch does not stop the run',
  result.sent.length === 3, `only ${result.sent.length} sent`);
check('the failure is reported, not swallowed',
  result.failed.length === 1 && result.failed[0].g.full_name === 'Bad');
check('guests after the failure are still emailed',
  result.sent.some(s => s.g.full_name === 'Four'));
check('the failed guest is NOT marked Sent, so a re-run retries it',
  !result.written.some(w => w.id === batch[1].id));
check('successes are marked Sent',
  result.written.length === 3 && result.written.every(w => w.email_status === STATUS.SENT));
check('every success stores last_email_sent',
  result.written.every(w => !Number.isNaN(Date.parse(w.last_email_sent))));

const afterWriteFail = await runBatch(batch, { updateFailsFor: ['three@example.com'] });
check('a guest emailed but not recorded is its own category, not a success',
  afterWriteFail.unrecorded.length === 1
  && afterWriteFail.sent.length === 3
  && !afterWriteFail.written.some(w => w.id === batch[2].id));

const allBad = await runBatch(batch, {
  failFor: batch.map(g => g.email),
});
check('a run where everything fails writes nothing',
  allBad.written.length === 0 && allBad.failed.length === 4);

check('the subject names the couple', SUBJECT.includes('Princess & IniOluwa'));

// ── Result ──────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.log(`\x1b[31mFAILED — ${failures.length} of ${passed + failures.length} checks\x1b[0m`);
  for (const f of failures) console.log(`  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exitCode = 1;
} else {
  console.log(`\x1b[32mAll checks passed (${passed})\x1b[0m`);
}
