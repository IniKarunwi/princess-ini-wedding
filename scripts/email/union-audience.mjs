#!/usr/bin/env node
/**
 * The UNION audience for the final-details email — dry run only.
 *
 *   npm run email:final-details:union
 *
 * Read-only. Two GETs, nothing written, no email sent, the published seating
 * plan untouched. It does not import from or alter the production sending
 * path: prepare-final-details.mjs and final-details-recipients.mjs still
 * decide who is actually emailed, and they are unchanged.
 *
 * ── Why a union, and not either list on its own ────────────────────────────
 * Two earlier proposals were both wrong at the edges:
 *
 *   the RSVP rule alone   correct about everyone it includes, but silent about
 *                         guests who hold a seat in the published plan and
 *                         never completed a form. They are coming. They would
 *                         have received nothing.
 *
 *   seating alone         correct about the room, but it REMOVED people — 128
 *                         became 115 — on the strength of a name not matching
 *                         a string. A guest who RSVP'd yes, was approved and
 *                         has an inbox does not stop being a guest because the
 *                         seating plan spells them differently or seats them
 *                         under a household name. That is a matching failure
 *                         being paid for by the guest.
 *
 * So: keep everyone the RSVP rule already qualifies, and ADD the seated who it
 * misses. Nobody is removed for failing to match. The only way the count goes
 * down is de-duplication of a shared inbox.
 *
 *     audience = A ∪ B
 *       A = rows passing classifyForFinalDetails   (unchanged, authoritative)
 *       B = confidently seated + reachable + not already in A
 *
 * On a collision, A wins. A Set A recipient's classification is never
 * rewritten by a seating match, so adding this file cannot change how any
 * existing recipient's letter is built.
 *
 * ── JOINING is never inferred from a seat ──────────────────────────────────
 * The ceremony and phones section is gated on the JOINING tier in the RSVP
 * row's `approved_for`, and on nothing else. A reception seat says a guest is
 * in the room after the service; it says nothing about whether they were
 * invited to the service. A Set B addition with no JOINING tier receives the
 * reception-only letter. There is no path in this file from a seat to a tier.
 *
 * ── One name is held back by hand ──────────────────────────────────────────
 * Tunde Adeleke explicitly RSVP'd no. A seat in the plan may be a leftover
 * rather than a change of mind, and the letter tells its reader their seat is
 * confirmed. He is withheld from the automatic addition and reported on his
 * own line for a human decision. See WITHHELD below.
 *
 * ── Matching ───────────────────────────────────────────────────────────────
 * The tiers live in name-match.mjs. A tier is only used when exactly one RSVP
 * row qualifies at it; two candidates is ambiguity, reported and never
 * resolved. Ambiguity here costs an addition, not a recipient — a refused
 * match can only fail to ADD someone, because Set A is preserved regardless.
 */

import { TABLE } from './config.mjs';
import { parseTiers } from './events.mjs';
import { isSendableEmail } from './recipients.mjs';
import { classifyForFinalDetails } from './final-details-recipients.mjs';
import { seatedFrom, reconcile } from './reconcile-seating.mjs';
import { normalise } from './name-match.mjs';

/**
 * Names withheld from the automatic seating-derived addition, and why.
 *
 * Compared on the normalised name, so a title or a "+2" in the seating plan
 * does not slip past. Matched against the RSVP row's name, not the seated
 * string, so the person is identified by their invitation.
 */
export const WITHHELD = [
  { name: 'Tunde Adeleke', reason: "explicitly RSVP'd no — held for a decision" },
];

const withheldFor = (row) => {
  const n = normalise(row.full_name);
  return WITHHELD.find(w => normalise(w.name) === n) ?? null;
};

const key = (email) => String(email ?? '').trim().toLowerCase();

/* ── The rule ────────────────────────────────────────────────────────────── */

/**
 * Builds the union audience from RSVP rows and the seated entries.
 *
 * Pure: no I/O, no clock, no environment. Everything the report prints comes
 * out of here, so the whole rule can be exercised against fixtures offline.
 *
 * Returns:
 *   original      Set A, in row order, de-duplicated by inbox
 *   additions     Set B, each with the seat and tier that justified it
 *   withheld      seated, reachable, would have been added, held by name
 *   audience      A ∪ B, the final list
 *   duplicates    rows dropped because their inbox was already taken
 *   refused       why a seated guest could not be added: no email, ambiguous,
 *                 no RSVP row at all
 */
export function unionAudience(rsvpRows, seated) {
  /* Set A — today's rule, untouched. */
  const original = [];
  const duplicates = [];
  const byEmail = new Map();

  // Every row already accounted for — as a recipient or as a reported
  // duplicate. A row can be reached twice (it qualifies AND it is seated, or
  // it is seated at two tables), and being seen twice is not two facts.
  const accounted = new Set();

  for (const row of rsvpRows) {
    if (!classifyForFinalDetails(row).send) continue;
    const k = key(row.email);
    if (byEmail.has(k)) {
      duplicates.push({ row, firstSeen: byEmail.get(k).row, from: 'original-rule' });
      accounted.add(row);
      continue;
    }
    const entry = { row, source: 'rsvp-rule', joining: isJoining(row), seated: null, tier: null };
    byEmail.set(k, entry);
    accounted.add(row);
    original.push(entry);
  }

  /* Set B — the seated that Set A misses. */
  const r = reconcile(seated, rsvpRows);

  const additions = [];
  const withheld = [];
  const noEmail = [];

  for (const m of r.matched) {
    if (!isSendableEmail(m.row.email)) {
      noEmail.push(m);
      continue;
    }
    const k = key(m.row.email);

    // Somebody already holds this inbox. Set A wins, and so does the first
    // addition — a seat can never displace an existing recipient.
    const existing = byEmail.get(k);
    if (existing) {
      // The same person, reached a second way. Record the seat on their entry
      // so the report can show it; it changes nothing about their letter.
      if (existing.row === m.row) {
        if (!existing.seated) { existing.seated = m.seated; existing.tier = m.tier; }
        continue;
      }
      // A different person sharing the inbox. They would have been an
      // addition; the shared inbox is why they are not. Reported once.
      if (!accounted.has(m.row)) {
        duplicates.push({ row: m.row, firstSeen: existing.row, from: 'seating' });
        accounted.add(m.row);
      }
      continue;
    }

    const hold = withheldFor(m.row);
    if (hold) {
      if (!accounted.has(m.row)) {
        withheld.push({ ...m, reason: hold.reason, joining: isJoining(m.row) });
        accounted.add(m.row);
      }
      continue;
    }

    const entry = {
      row: m.row,
      source: 'seating',
      joining: isJoining(m.row),   // from approved_for ONLY — never from the seat
      seated: m.seated,
      tier: m.tier,
    };
    byEmail.set(k, entry);
    accounted.add(m.row);
    additions.push(entry);
  }

  const audience = [...original, ...additions];

  return {
    original,
    additions,
    withheld,
    audience,
    duplicates,
    refused: { noEmail, ambiguous: r.ambiguous, unmatched: r.unmatched },
    reconciliation: r,
    joining: audience.filter(e => e.joining).length,
    receptionOnly: audience.filter(e => !e.joining).length,
  };
}

/** The ceremony/phones gate. The RSVP tier, and nothing else. */
function isJoining(row) {
  return parseTiers(row.approved_for).includes('JOINING');
}

/* ── Report ──────────────────────────────────────────────────────────────── */

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

const line = (label, n, colour = (s) => s) =>
  console.log(`  ${label.padEnd(54, '.')} ${colour(String(n).padStart(5))}`);

function creds() {
  const url = process.env.SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !k) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.\n' +
      'Run with --env-file=.env.');
  }
  return { url: url.replace(/\/+$/, ''), key: k };
}

async function get(path) {
  const { url, key: k } = creds();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: k, authorization: `Bearer ${k}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const layouts = await get('seating_layouts?status=eq.published&select=version,payload,updated_at');
  if (!layouts.length) throw new Error('No PUBLISHED seating layout exists yet.');
  const published = layouts[0];
  const rsvpRows = await get(`${TABLE}?select=*`);
  const seated = seatedFrom(published.payload);

  const u = unionAudience(rsvpRows, seated);

  console.log(`\n${c.bold('═══ FINAL-DETAILS AUDIENCE — UNION RULE — DRY RUN ═══')}`);
  console.log(`  ${c.dim(`published layout v${published.version}, updated ${published.updated_at}`)}`);
  console.log(`  ${c.dim(`${seated.length} seated entries · ${rsvpRows.length} RSVP rows`)}`);
  console.log(`  ${c.dim('read-only: nothing written, nothing sent, seating not modified')}`);
  console.log(`  ${c.dim('production send logic is NOT using this rule yet')}`);

  console.log(`\n${c.bold('1 · Original-rule recipients')}  ${c.dim('(unchanged, none removed)')}`);
  line('qualify under classifyForFinalDetails', u.original.length, c.cyan);
  const seatedToo = u.original.filter(e => e.seated).length;
  line('…of those, also found in the seating plan', seatedToo);
  line('…on the list but not matched to a seat', u.original.length - seatedToo, c.dim);
  console.log(`  ${c.dim('Not matching a seat is NOT a reason for removal under this rule.')}`);

  console.log(`\n${c.bold('2 · Seating-derived additions')}  ${c.dim('(seated, reachable, missed by the rule)')}`);
  line('ADDED', u.additions.length, c.green);
  for (const e of u.additions) {
    const why = classifyForFinalDetails(e.row).reason ?? '';
    console.log(`    ${c.green('+')} ${String(e.row.full_name).padEnd(30)} ${String(e.row.email).padEnd(34)}`);
    console.log(`      ${c.dim(`seated "${e.seated.name}" · table ${e.seated.table} · matched ${e.tier} · ` +
                                `${e.joining ? 'JOINING' : 'reception-only'}`)}`);
    console.log(`      ${c.dim(`excluded by today's rule because: ${why}`)}`);
  }
  if (!u.additions.length) console.log(`    ${c.dim('(none)')}`);

  console.log(`\n${c.bold('3 · Withheld for your decision')}`);
  line('held back', u.withheld.length, c.amber);
  for (const w of u.withheld) {
    console.log(`    ${c.amber('?')} ${String(w.row.full_name).padEnd(30)} ${String(w.row.email).padEnd(34)}`);
    console.log(`      ${c.dim(`seated "${w.seated.name}" · table ${w.seated.table} · matched ${w.tier} · ` +
                                `${w.joining ? 'JOINING' : 'reception-only'}`)}`);
    console.log(`      ${c.dim(w.reason)}`);
  }
  if (!u.withheld.length) {
    console.log(`    ${c.dim('(nobody on the withhold list holds a reachable seat)')}`);
  }

  console.log(`\n${c.bold('4 · Duplicates removed')}  ${c.dim('(same inbox, de-duplicated)')}`);
  line('dropped', u.duplicates.length, c.amber);
  for (const d of u.duplicates) {
    console.log(`    ${c.dim(`${String(d.row.full_name).padEnd(28)} ${d.row.email}  ` +
                             `— inbox already held by ${d.firstSeen.full_name} (${d.from})`)}`);
  }
  if (!u.duplicates.length) console.log(`    ${c.dim('(none)')}`);

  console.log(`\n${c.bold('5 · Final audience')}`);
  line('FINAL RECIPIENT COUNT', u.audience.length, c.green);
  console.log(`  ${c.dim(`${u.original.length} original + ${u.additions.length} seating-derived = ${u.audience.length}`)}`);

  console.log(`\n${c.bold('6 · Which letter each one receives')}`);
  line('JOINING — ceremony + phones section', u.joining, c.cyan);
  line('reception-only — no ceremony section', u.receptionOnly, c.cyan);
  console.log(`  ${c.dim('Both counts come from approved_for. A seat never grants JOINING.')}`);

  console.log(`\n${c.bold('7 · Seated guests NOT added, and why')}`);
  line('matched but no usable email', u.refused.noEmail.length, c.amber);
  line('name held by more than one RSVP row (ambiguous)', u.refused.ambiguous.length, c.amber);
  line('no RSVP row of that name at all', u.refused.unmatched.length, c.amber);
  for (const m of u.refused.noEmail) {
    console.log(`    ${c.red('✗')} ${String(m.row.full_name).padEnd(30)} ${c.dim(`${m.row.email ?? '(none)'} · seated "${m.seated.name}"`)}`);
  }
  for (const a of u.refused.ambiguous) {
    console.log(`    ${c.red('!')} seated "${a.seated.name}" ${c.dim(`table ${a.seated.table} — ${a.rows.length} rows share this name`)}`);
  }
  for (const s of u.refused.unmatched) {
    console.log(`    ${c.amber('?')} seated "${s.seated.name}" ${c.dim(`table ${s.seated.table}`)}`);
  }

  console.log(`\n${c.bold('How the additions were matched')}`);
  const byTier = new Map();
  for (const e of u.additions) byTier.set(e.tier, (byTier.get(e.tier) ?? 0) + 1);
  for (const tier of ['exact', 'reordered', 'subset', 'typo']) {
    line(tier, byTier.get(tier) ?? 0, tier === 'exact' ? c.green : c.amber);
  }
  const speculative = u.additions.filter(e => e.tier !== 'exact');
  if (speculative.length) {
    console.log(`\n  ${c.amber('Every non-exact ADDITION, for your review before this is adopted:')}`);
    for (const e of speculative) {
      console.log(`    ${c.amber('~')} seated "${e.seated.name}"`);
      console.log(`      ${c.dim(`→ RSVP "${e.row.full_name}"  ${e.row.email}  [${e.tier}]`)}`);
    }
  }

  console.log(`\n${c.dim('Dry run. Nothing was written, nothing was sent, seating was not modified.')}`);
  console.log(`${c.dim('The production sending rule is still final-details-recipients.mjs, unchanged.')}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\n${c.red('✗')} ${e.message}`);
    process.exitCode = 1;
  });
}
