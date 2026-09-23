#!/usr/bin/env node
/**
 * Reconciles the PUBLISHED seating plan against the RSVP table.
 *
 *   npm run email:final-details:reconcile
 *
 * Read-only. It issues two GETs and writes nothing — not to the seating
 * layout, not to the rsvps table, not to a file. It sends no email.
 *
 * ── A deliberate reversal, recorded here so it is not mistaken for drift ───
 * Every other file in this campaign says the seating chart must never decide
 * who is emailed. That rule was right for the question it answered: the chart
 * decides WHERE somebody sits, and letting it decide who gets post would have
 * meant a seating bug quietly becoming a mailing bug.
 *
 * The couple have since decided the other way, and their reasoning is better
 * than the rule: the published plan IS the reception guest list. It is the
 * thing the ushers will work from on the day. A guest who has a seat in it is
 * coming to the reception whether or not they ever completed an RSVP form,
 * and the letter's promise — "your seat is confirmed" — is true for them and
 * false for nobody else.
 *
 * So, for reception eligibility:
 *
 *   authority   the published seating payload
 *   RSVP is     a lookup table, for two things only: an email address, and
 *               whether that person is also approved for JOINING (which
 *               decides whether they see the phones note)
 *
 *   NOT used    attending, main_invite_status, email_status, plus-one state.
 *               A seat outranks all of them.
 *
 * ── Matching is exact, never fuzzy ────────────────────────────────────────
 * A seated name matches an RSVP row only when the two normalise identically.
 * Normalisation is conservative and is listed in `normalise` below — case,
 * whitespace, a trailing "+N" seat count, and surrounding punctuation. It does
 * NOT strip titles, reorder names, or measure edit distance.
 *
 * Where no exact match exists, the row is reported as unmatched and CANDIDATES
 * are printed for a human to judge. Nothing is auto-applied. Emailing the
 * wrong person because two guests share a surname is not recoverable, and a
 * name is not evidence of an inbox.
 */

import { TABLE } from './config.mjs';
import { parseTiers } from './events.mjs';
import { isSendableEmail } from './recipients.mjs';
import { classifyForFinalDetails } from './final-details-recipients.mjs';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

/* ── Reading ─────────────────────────────────────────────────────────────── */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.\n' +
      'Run with --env-file=.env.');
  }
  return { url: url.replace(/\/+$/, ''), key };
}

async function get(path) {
  const { url, key } = creds();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

/** The published layout. Never the draft — the draft is not what guests see. */
async function fetchPublished() {
  const rows = await get('seating_layouts?status=eq.published&select=version,payload,updated_at');
  if (!rows.length) throw new Error('No PUBLISHED seating layout exists yet.');
  return rows[0];
}

/* ── Names ───────────────────────────────────────────────────────────────── */

/**
 * The only transformation applied before comparing two names.
 *
 * Every step here is something that is unambiguously the same person:
 * casing, doubled spaces, a "+3" seat count typed into a name field, and
 * stray punctuation from a paste. Titles are deliberately NOT stripped —
 * "Pastor Chingtok" and "Chingtok" may or may not be the same person, and
 * that is a judgement for a human.
 */
export function normalise(name) {
  return String(name ?? '')
    .replace(/\s*\+\s*\d+\s*$/, '')       // "Ada Obi +2" → "Ada Obi"
    .replace(/[.,;:'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Surname-ish tokens, used ONLY to suggest candidates to a human. */
const tokens = (name) => new Set(normalise(name).split(' ').filter(t => t.length > 2));

function candidatesFor(seatedName, rsvpRows) {
  const want = tokens(seatedName);
  if (!want.size) return [];
  return rsvpRows
    .map(r => {
      const have = tokens(r.full_name);
      let shared = 0;
      for (const t of want) if (have.has(t)) shared++;
      return { row: r, shared };
    })
    .filter(x => x.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 3);
}

/* ── Extracting the seated ───────────────────────────────────────────────── */

export function seatedFrom(payload) {
  const out = [];
  for (const t of payload?.tables ?? []) {
    for (const e of t.entries ?? []) {
      out.push({
        name: String(e.name).trim(),
        seats: e.seats ?? 1,
        entryId: e.id,
        table: t.number,
        kind: t.kind,
        side: t.side,
      });
    }
  }
  return out;
}

/* ── Reconciling ─────────────────────────────────────────────────────────── */

export function reconcile(seated, rsvpRows) {
  // An RSVP index by normalised name. A name held by two rows is ambiguous
  // BEFORE anything is matched against it.
  const byName = new Map();
  for (const r of rsvpRows) {
    const k = normalise(r.full_name);
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(r);
  }

  const matched = [];      // seated + exactly one RSVP row
  const ambiguous = [];    // seated + more than one RSVP row of that name
  const unmatched = [];    // seated + no RSVP row of that name

  for (const s of seated) {
    const rows = byName.get(normalise(s.name)) ?? [];
    if (rows.length === 1) matched.push({ seated: s, row: rows[0] });
    else if (rows.length > 1) ambiguous.push({ seated: s, rows });
    else unmatched.push({ seated: s, candidates: candidatesFor(s.name, rsvpRows) });
  }

  // Proposed recipients: seated, matched, reachable, de-duplicated by inbox.
  const proposed = [];
  const seatedNoEmail = [];
  const seen = new Map();
  const duplicates = [];

  for (const m of matched) {
    if (!isSendableEmail(m.row.email)) { seatedNoEmail.push(m); continue; }
    const key = String(m.row.email).trim().toLowerCase();
    if (seen.has(key)) { duplicates.push({ ...m, firstSeen: seen.get(key) }); continue; }
    seen.set(key, m);
    proposed.push({
      ...m,
      joining: parseTiers(m.row.approved_for).includes('JOINING'),
    });
  }

  return { matched, ambiguous, unmatched, proposed, seatedNoEmail, duplicates, seen };
}

/* ── Report ──────────────────────────────────────────────────────────────── */

function line(label, n, colour = (s) => s) {
  console.log(`  ${label.padEnd(52, '.')} ${colour(String(n).padStart(5))}`);
}

async function main() {
  const published = await fetchPublished();
  const rsvpRows = await get(`${TABLE}?select=*`);
  const seated = seatedFrom(published.payload);

  const r = reconcile(seated, rsvpRows);

  // The rule as it stands today, so the two can be compared.
  const current = [];
  const currentSeen = new Set();
  for (const row of rsvpRows) {
    if (!classifyForFinalDetails(row).send) continue;
    const k = String(row.email).trim().toLowerCase();
    if (currentSeen.has(k)) continue;
    currentSeen.add(k);
    current.push(row);
  }
  const currentEmails = new Set(current.map(r0 => String(r0.email).trim().toLowerCase()));
  const proposedEmails = new Set(r.proposed.map(p => String(p.row.email).trim().toLowerCase()));

  const seatCount = seated.reduce((n, s) => n + (s.seats ?? 1), 0);

  console.log(`\n${c.bold('═══ SEATING ↔ RSVP RECONCILIATION ═══')}`);
  console.log(`  ${c.dim(`published layout v${published.version}, updated ${published.updated_at}`)}`);
  console.log(`  ${c.dim('read-only: nothing was written, nothing was sent')}`);

  console.log(`\n${c.bold('The published plan')}`);
  line('seated entries', seated.length);
  line('seats they occupy', seatCount);
  line('rows in the RSVP table', rsvpRows.length);

  console.log(`\n${c.bold('1 · Current email recipients (today\'s rule)')}`);
  line('current recipients', current.length, c.cyan);

  console.log(`\n${c.bold('2 · Seated guests currently EXCLUDED')}`);
  const excludedSeated = r.matched.filter(m =>
    !currentEmails.has(String(m.row.email ?? '').trim().toLowerCase()));
  line('seated, matched, but not on today\'s list', excludedSeated.length, c.amber);
  for (const m of excludedSeated) {
    const why = classifyForFinalDetails(m.row);
    console.log(`     ${c.dim(`${m.seated.name.padEnd(30)} table ${String(m.seated.table).padEnd(4)} ${why.reason ?? ''}`)}`);
  }

  console.log(`\n${c.bold('3 · …of those, which have a usable email')}`);
  const excludedWithEmail = excludedSeated.filter(m => isSendableEmail(m.row.email));
  line('usable address', excludedWithEmail.length, c.green);
  line('no usable address', excludedSeated.length - excludedWithEmail.length, c.amber);
  for (const m of excludedSeated) {
    const ok = isSendableEmail(m.row.email);
    console.log(`     ${ok ? c.green('✓') : c.red('✗')} ${m.seated.name.padEnd(30)} ${c.dim(m.row.email ?? '(none)')}`);
  }

  console.log(`\n${c.bold('4 · Seated guests that CANNOT be matched confidently')}`);
  line('no RSVP row of that name', r.unmatched.length, c.amber);
  line('name held by more than one RSVP row', r.ambiguous.length, c.amber);
  console.log(`  ${c.dim('Nothing below is auto-matched. Candidates are for your judgement only.')}`);
  for (const u of r.unmatched) {
    console.log(`\n     ${c.amber('?')} ${c.bold(u.seated.name)}  ${c.dim(`table ${u.seated.table}, ${u.seated.seats} seat(s)`)}`);
    if (!u.candidates.length) console.log(`         ${c.dim('no similar name in the RSVP table')}`);
    for (const cand of u.candidates) {
      console.log(`         ${c.dim(`maybe: ${String(cand.row.full_name).padEnd(28)} ${cand.row.email ?? '(no email)'}  [${cand.shared} shared word(s)]`)}`);
    }
  }
  for (const a of r.ambiguous) {
    console.log(`\n     ${c.red('!')} ${c.bold(a.seated.name)}  ${c.dim(`table ${a.seated.table}`)} — ${a.rows.length} RSVP rows share this name`);
    for (const row of a.rows) {
      console.log(`         ${c.dim(`${row.id}  ${row.email ?? '(no email)'}  ${row.approved_for ?? '(no tier)'}`)}`);
    }
  }

  console.log(`\n${c.bold('5 · Current recipients NOT in the published plan')}`);
  const notSeated = current.filter(row =>
    !proposedEmails.has(String(row.email).trim().toLowerCase()));
  line('on today\'s list but holding no seat', notSeated.length, c.amber);
  for (const row of notSeated) {
    console.log(`     ${c.dim(`${String(row.full_name).padEnd(30)} ${row.email}  ${row.approved_for ?? ''}`)}`);
  }

  console.log(`\n${c.bold('6 · Proposed recipients (seating as authority)')}`);
  line('PROPOSED RECIPIENTS', r.proposed.length, c.green);
  line('of which also approved for JOINING', r.proposed.filter(p => p.joining).length);
  line('reception-only (no phones note)', r.proposed.filter(p => !p.joining).length);
  line('seated but no usable email — CANNOT be emailed', r.seatedNoEmail.length, c.amber);
  line('seated entries sharing an inbox (de-duplicated)', r.duplicates.length);
  line('seated but unmatched — resolve before sending', r.unmatched.length, c.amber);
  line('seated but ambiguous — resolve before sending', r.ambiguous.length, c.amber);

  console.log(`\n${c.bold('Change from today\'s list')}`);
  const added = [...proposedEmails].filter(e => !currentEmails.has(e));
  const removed = [...currentEmails].filter(e => !proposedEmails.has(e));
  line('would be ADDED', added.length, c.green);
  line('would be REMOVED', removed.length, c.red);
  line('net', `${current.length} → ${r.proposed.length}`, c.bold);

  for (const m of r.seatedNoEmail) {
    console.log(`     ${c.red('✗')} ${c.dim(`${m.seated.name.padEnd(30)} seated at table ${m.seated.table}, no usable address`)}`);
  }
  for (const d of r.duplicates) {
    console.log(`     ${c.dim(`${d.seated.name} shares ${d.row.email} with ${d.firstSeen.seated.name}`)}`);
  }

  console.log(`\n${c.dim('Nothing was written. Nothing was sent. The published plan was not modified.')}\n`);
}

// Importable for tests; only runs the report when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\n${c.red('✗')} ${e.message}`);
    process.exitCode = 1;
  });
}
