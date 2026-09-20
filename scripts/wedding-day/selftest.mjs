#!/usr/bin/env node
/**
 * Offline tests for the wedding-day helpers — npm run test:weddingday
 *
 * No network, no database. The SQL half of the system is tested separately in
 * supabase/tests/wedding_day.sql, which needs a real Postgres because that is
 * where the locking and the ledger live.
 *
 * What this file is really guarding: THREE copies of the access rule now exist
 * — events.mjs (what emails and PDFs show), permissions.mjs (what the admin
 * screens read) and guest_has_access() in SQL (what the door enforces). Three
 * copies is two too many, but each exists for a reason that cannot be designed
 * away. So the mitigation is that a disagreement between them fails a test
 * rather than a guest.
 */

import { getGuestPermissions, permittedEvents, isApproved, shouldHavePass, partySize, EVENT_LABEL } from './permissions.mjs';
import { planPasses, newToken, hashToken, passUrl } from './passes.mjs';
import { proposePartySize, parsePlusN } from './party-size.mjs';
import { eventsForGuest } from '../email/events.mjs';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${name}`); }
  else { failures.push({ name, detail }); console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const G = (o = {}) => ({
  id: `id-${Math.random().toString(36).slice(2, 8)}`,
  full_name: 'Ada Obi', email: 'ada@example.com',
  main_invite_status: 'APPROVED', approved_for: 'JOINING',
  attending: true, party_size: 1, ...o,
});

/* ── Does every file even parse? ──────────────────────────────────────────── */
//
// This section exists because a shipped file did not.
//
// verify-production.mjs had a syntax error — an over-escaped quote and a
// backtick inside a template literal — and nothing caught it. The suite
// imports permissions.mjs, passes.mjs and party-size.mjs, so those are parsed
// as a side effect of being imported. verify-production.mjs is a credential
// gated CLI that no test imports, so it was never parsed by anything until
// someone ran it against a real database and it died before its first request.
//
// `node --check` parses without executing, so it works on files that would
// otherwise refuse to run without secrets. Cheap, and it makes "it is only a
// CLI" stop being a hole in the coverage.
section('EVERY SCRIPT PARSES');

{
  const here = dirname(fileURLToPath(import.meta.url));
  const dirs = [here, join(here, '..', 'email'), join(here, '..', 'sync')];
  let files = [];
  for (const d of dirs) {
    try { files.push(...readdirSync(d).filter(f => f.endsWith('.mjs')).map(f => join(d, f))); }
    catch { /* a directory that is not there is not a failure */ }
  }
  let broken = 0;
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) {
      broken++;
      check(`parses: ${f.split('/').slice(-2).join('/')}`, false,
        String(e.stderr || e.message).split('\n').slice(0, 3).join(' ').slice(0, 160));
    }
  }
  check(`all ${files.length} scripts parse`, broken === 0, `${broken} broken`);
}

/* ── The brief's cases A–E ─────────────────────────────────────────────────── */
section('ACCESS HIERARCHY  (cases A–E)');

const A = getGuestPermissions(G({ approved_for: 'JOINING', party_size: 1 }));
check('A  JOINING is the WHOLE day, not just the service',
  A.joining && A.reception && A.afterParty, JSON.stringify(A));

const B = getGuestPermissions(G({ approved_for: 'RECEPTION', party_size: 2 }));
check('B  RECEPTION is reception only',
  !B.joining && B.reception && !B.afterParty, JSON.stringify(B));

const C = getGuestPermissions(G({ approved_for: 'AFTER PARTY' }));
check('C  AFTER PARTY is after party only',
  !C.joining && !C.reception && C.afterParty, JSON.stringify(C));

const D = getGuestPermissions(G({ approved_for: 'AFTERPARTY' }));
check('D  AFTERPARTY is identical to AFTER PARTY', JSON.stringify(D) === JSON.stringify(C));
check('D  so is AFTER-PARTY',
  JSON.stringify(getGuestPermissions(G({ approved_for: 'AFTER-PARTY' }))) === JSON.stringify(C));
check('D  and so is lower case / padded whitespace',
  JSON.stringify(getGuestPermissions(G({ approved_for: '  after party  ' }))) === JSON.stringify(C));

const E = getGuestPermissions(G({ main_invite_status: 'REJECTED', approved_for: 'REJECTED' }));
check('E  REJECTED gets nothing', !E.joining && !E.reception && !E.afterParty, JSON.stringify(E));
check('E  and no pass', !shouldHavePass(G({ main_invite_status: 'REJECTED', approved_for: 'REJECTED' })));

// A tier on an undecided row is a proposal, not an admission. This is the one
// most likely to be got wrong, because approved_for looks authoritative alone.
check('E  a tier WITHOUT approval admits nobody',
  !isApproved(G({ main_invite_status: null, approved_for: 'JOINING' })));
check('E  PENDING admits nobody',
  !isApproved(G({ main_invite_status: 'PENDING', approved_for: 'JOINING' })));

/* ── The three copies must agree ───────────────────────────────────────────── */
section('ONE RULE, THREE IMPLEMENTATIONS');

for (const tier of ['JOINING', 'RECEPTION', 'AFTERPARTY', 'AFTER PARTY', 'AFTER-PARTY']) {
  const row = G({ approved_for: tier });
  const viaEmail = new Set(eventsForGuest(row).map(e => e.key));
  const viaPerms = new Set(permittedEvents(row));
  check(`permissions.mjs agrees with events.mjs for "${tier}"`,
    viaEmail.size === viaPerms.size && [...viaEmail].every(k => viaPerms.has(k)),
    `${[...viaEmail]} vs ${[...viaPerms]}`);
}
console.log('  \x1b[2m(the SQL copy is asserted in supabase/tests/wedding_day.sql)\x1b[0m');

/* ── Party size ────────────────────────────────────────────────────────────── */
section('PARTY SIZE');

check('party_size is used when present', partySize(G({ party_size: 6 })) === 6);
check('a party of 9 is representable', partySize(G({ party_size: 9 })) === 9);
// guest_count is capped at 2 by its trigger, which is why party_size exists.
check('falls back to guest_count before 0007 is applied',
  partySize({ guest_count: 2 }) === 2);
check('an absent size is 0, never 1 — guessing seats invents attendees',
  partySize({}) === 0);

/* ── Pass eligibility and idempotency ──────────────────────────────────────── */
section('PASSES');

const rows = [
  G({ id: 'ok-1', approved_for: 'JOINING' }),
  G({ id: 'ok-2', approved_for: 'RECEPTION' }),
  G({ id: 'ok-3', approved_for: 'AFTER PARTY' }),
  G({ id: 'no-1', main_invite_status: 'REJECTED' }),
  G({ id: 'no-2', main_invite_status: null }),
  G({ id: 'no-3', approved_for: null }),
  G({ id: 'no-4', approved_for: 'VIP LOUNGE' }),
];

const first = planPasses(rows, new Map());
check('every approved tier gets a pass', first.issue.length === 3, `issue=${first.issue.length}`);
check('rejected, pending, no-tier and junk-tier get none', first.skipped.length === 4);
check('each exclusion carries a readable reason',
  first.skipped.every(s => typeof s.reason === 'string' && s.reason.length > 8));

// The second run is the one that matters: it must issue NOTHING.
const existing = new Map(first.issue.map(({ row }) => [row.id, { id: 'p', rsvp_id: row.id }]));
const second = planPasses(rows, existing);
check('re-running issues nothing — generation is idempotent',
  second.issue.length === 0 && second.already.length === 3);

check('every row is accounted for',
  first.issue.length + first.already.length + first.skipped.length === rows.length);

// Approval, not RSVP, decides. Someone approved who never replied still needs
// to get through the door.
check('a guest who never RSVP\'d still gets a pass',
  shouldHavePass(G({ attending: null })));
check('a guest who declined still gets a pass if approved',
  shouldHavePass(G({ attending: false })));

/* ── Tokens ────────────────────────────────────────────────────────────────── */
section('TOKENS');

const tokens = Array.from({ length: 20000 }, () => newToken());
check('20,000 tokens, no collision', new Set(tokens).size === 20000);
check('256 bits, URL-safe base64', /^[A-Za-z0-9_-]{43}$/.test(tokens[0]), tokens[0]);
check('hashing is stable', hashToken('abc') === hashToken('abc'));
check('the hash is not the token', hashToken(tokens[0]) !== tokens[0]);
check('sha256 hex, 64 chars', /^[0-9a-f]{64}$/.test(hashToken(tokens[0])));
check('different tokens hash differently', hashToken(tokens[0]) !== hashToken(tokens[1]));
check('the pass URL carries the raw token and nothing else',
  passUrl('https://princessandini.com', tokens[0]) === `https://princessandini.com/pass/${tokens[0]}`);
check('a trailing slash on the site URL does not double up',
  passUrl('https://princessandini.com/', 'T') === 'https://princessandini.com/pass/T');

// Nothing about the guest may be derivable from the token.
const sameGuest = G({ id: 'fixed', full_name: 'Ada Obi' });
check('two tokens for the same guest differ — the token encodes nothing',
  newToken() !== newToken() && sameGuest.id === 'fixed');

section('PARTY SIZE PROPOSALS');

// Only a TRAILING +N is a seat count. A "+" inside a name is not.
check('reads a trailing +N', parsePlusN('Olakunle +5').n === 5);
check('tolerates spacing', parsePlusN('Olori  +  8').n === 8);
check('ignores a + inside a name', parsePlusN('Jean+Luc Picard').n === null);
check('ignores a bare +', parsePlusN('Ada +').n === null);
check('reports what it matched', parsePlusN('Olakunle +5').matched === '+5');

const P = (o) => proposePartySize(G({ guest_count: 1, ...o }));

check('a plain guest is 1', P({ full_name: 'Ada Obi' }).proposed === 1);
check('an approved plus one is 2',
  P({ full_name: 'Ada Obi', plus_one_status: 'APPROVED', guest_count: 2 }).proposed === 2);
check('"Olakunle +5" proposes 6', P({ full_name: 'Olakunle +5' }).proposed === 6);
check('"Olori +8" proposes 9', P({ full_name: 'Olori +8' }).proposed === 9);
check('a rejected guest is 0',
  P({ full_name: 'Nope +3', main_invite_status: 'REJECTED' }).proposed === 0);

// The flags are the point of the tool. A wrong number that is FLAGGED costs a
// phone call; a wrong number that is silent costs a seat on the day.
check('+N alongside an approved plus one is flagged, not guessed',
  P({ full_name: 'Olakunle +5', plus_one_status: 'APPROVED', guest_count: 2 }).review === true);
check('a large party is flagged', P({ full_name: 'Olori +8' }).review === true);
check('two +N in one name is flagged', P({ full_name: 'A +2 and B +3' }).review === true);
check('a name implying a couple with no +N is flagged',
  P({ full_name: 'Mr & Mrs Bello' }).review === true);
check('shrinking an already-set party is flagged',
  P({ full_name: 'Ada +1', party_size: 7 }).review === true);
check('an ordinary guest is NOT flagged', P({ full_name: 'Ada Obi' }).review === false);
check('an ordinary +N is NOT flagged', P({ full_name: 'Olakunle +5' }).review === false);

check('every proposal explains itself',
  ['Ada Obi', 'Olakunle +5', 'Mr & Mrs Bello', 'Olori +8']
    .every(n => typeof P({ full_name: n }).reason === 'string' && P({ full_name: n }).reason.length > 10));

// guest_count is capped at 2 by its trigger, so 2 beside a +5 is expected.
// Calling that a conflict would flag most large parties for no reason.
check('guest_count 2 beside a +5 is explained, not treated as a conflict',
  /caps there/.test(P({ full_name: 'Olakunle +5', guest_count: 2 }).reason));

section('LABELS');
check('event labels are the guest-facing names',
  EVENT_LABEL.JOINING === 'Wedding Service'
  && EVENT_LABEL.RECEPTION === 'Wedding Reception'
  && EVENT_LABEL.AFTERPARTY === 'After Party');

console.log('');
if (failures.length) {
  console.log(`\x1b[31mFAILED — ${failures.length} of ${passed + failures.length} checks\x1b[0m`);
  for (const f of failures) console.log(`  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exitCode = 1;
} else {
  console.log(`\x1b[32mAll wedding-day checks passed (${passed})\x1b[0m`);
}
