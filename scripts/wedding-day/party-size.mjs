#!/usr/bin/env node
/**
 * party_size — propose, review, then set. npm run party:report
 *
 *   npm run party:report                  the full review table
 *   npm run party:report -- --review-only just the rows needing a human
 *   npm run party:report -- --csv         same data, for a spreadsheet
 *   npm run party:report -- --apply       write ONLY the unambiguous proposals
 *   npm run party:set -- --guest "Olori" --size 9 --reason "confirmed by phone"
 *
 * ── A proposal is not a fact ───────────────────────────────────────────────
 * "+5" in a name is a note somebody typed into a spreadsheet. It is the best
 * signal available, and it is still a guess: it may be stale, it may already
 * be counted in the plus-one columns, it may mean "and five children" or "and
 * five staff who will not eat". So this tool proposes, explains its reasoning
 * per row, and flags anything it is not sure about.
 *
 * party_size stays an ordinary editable column for exactly this reason. The
 * couple's judgement beats the parser, and `party:set` exists so overriding
 * one row never means re-running a bulk job.
 *
 * ── Nothing is written without --apply, and --apply skips flagged rows ─────
 * A row marked `review` is never written automatically, even with --apply.
 * The whole point of flagging is that a human decides.
 */

import { TABLE } from '../email/config.mjs';
import { permittedEvents, EVENT_LABEL, isApproved } from './permissions.mjs';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

const text = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const approvedPlusOne = (row) =>
  ['APPROVED', 'ACCEPTED'].includes(String(row?.plus_one_status ?? '').trim().toUpperCase());

/**
 * The "+N" suffix, if the name carries one.
 *
 * Only a TRAILING +N counts. A "+" in the middle of a name is not a seat
 * count, and treating it as one would silently inflate a party.
 *
 * Returns { n, matched } — `matched` is the literal text found, so the report
 * can show exactly what it keyed off rather than asking you to trust it.
 */
export function parsePlusN(fullName) {
  const name = text(fullName);
  if (name === null) return { n: null, matched: null };

  const m = name.match(/\+\s*(\d{1,2})\s*$/);
  if (!m) return { n: null, matched: null };

  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1) return { n: null, matched: m[0].trim() };
  return { n, matched: m[0].trim() };
}

/** Does the name imply a second person without saying +1? */
function impliesCouple(fullName) {
  const name = String(fullName ?? '');
  return /\b(mr\.?\s*(&|and)\s*mrs\.?|mr\s*&\s*mrs|and\s+(his|her)\s+(wife|husband)|\+\s*(wife|husband|spouse))\b/i
    .test(name);
}

/**
 * Propose a party size for one row, with the reasoning attached.
 *
 * Pure — no database, no I/O — so the report, the --apply path and the tests
 * all reach the same verdict. Returns:
 *
 *   { proposed, reason, review, flags[] }
 *
 * `review` true means a human must decide; --apply will skip it.
 */
export function proposePartySize(row) {
  const flags = [];
  const gc = Number.isInteger(row?.guest_count) ? row.guest_count : null;
  const { n, matched } = parsePlusN(row?.full_name);
  const plusOne = approvedPlusOne(row);
  const current = Number.isInteger(row?.party_size) ? row.party_size : null;

  // Not approved for anything: nobody is admitted, so the size is 0.
  if (!isApproved(row)) {
    return { proposed: 0, reason: 'not approved for any event', review: false, flags, parsed: n, matched };
  }

  // ── The unambiguous majority ─────────────────────────────────────────────
  if (n === null) {
    if (impliesCouple(row?.full_name)) {
      // "Mr & Mrs" with no +N and no approved plus one. Two people are named
      // but only one seat is recorded — worth a human glance either way.
      flags.push('name implies a couple but no +N and no approved plus one');
      return {
        proposed: plusOne ? 2 : 1,
        reason: 'name suggests two people; no +N to confirm it',
        review: true, flags, parsed: n, matched,
      };
    }
    return {
      proposed: plusOne ? 2 : 1,
      reason: plusOne ? 'guest + approved plus one' : 'single guest, no +N, no plus one',
      review: false, flags, parsed: n, matched,
    };
  }

  // ── A +N was found ───────────────────────────────────────────────────────
  // The reading: "Olakunle +5" is Olakunle AND five others = 6.
  let proposed = n + 1;
  let reason = `"${matched}" in the name: guest + ${n}`;
  let review = false;

  // The ambiguity that matters most. If a plus one is ALSO approved, is the
  // plus one one of the N, or an extra person on top? The spreadsheet cannot
  // say, and guessing either way is wrong for somebody.
  if (plusOne) {
    flags.push(`+${n} AND an approved plus one — is the plus one inside the ${n} or extra?`);
    reason = `"${matched}" plus an approved plus one — ambiguous`;
    review = true;
  }

  // A large party is not wrong, but it is worth a human confirming before it
  // becomes catering.
  if (n >= 8) {
    flags.push(`large party (+${n}) — confirm before it becomes a catering number`);
    review = true;
  }

  // The name carries more than one +N, e.g. "A +2 and B +3". The regex takes
  // the last; that may not be the intent.
  if ((String(row?.full_name ?? '').match(/\+\s*\d/g) || []).length > 1) {
    flags.push('more than one "+N" in the name — only the last was read');
    review = true;
  }

  // Shrinking a party that has already been set by hand is never automatic.
  if (current !== null && current > proposed) {
    flags.push(`party_size is already ${current}, higher than the proposed ${proposed}`);
    review = true;
  }

  // The trigger caps guest_count at 2, so gc=2 alongside +5 is expected and
  // NOT a conflict. Worth saying so explicitly: it is the single most likely
  // thing to be misread as a problem.
  if (gc !== null && gc === 2 && n >= 2) {
    reason += ` (guest_count is 2 because its trigger caps there, not a conflict)`;
  }

  return { proposed, reason, review, flags, parsed: n, matched };
}

/* ── CLI ───────────────────────────────────────────────────────────────────── */

const RUN = process.argv[1] && /party-size\.mjs$/.test(process.argv[1]);

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i === -1 ? null : argv[i + 1]; };
  const apply      = argv.includes('--apply');
  const reviewOnly = argv.includes('--review-only');
  const asCsv      = argv.includes('--csv');
  const setGuest   = arg('--guest');
  const setSize    = arg('--size');
  const setReason  = arg('--reason');

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`\n${c.red('Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.')}\n` +
      'Read-only here; the service key is required because RLS denies everyone else.\n');
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(TABLE).select('*').order('full_name').range(from, from + 999);
    if (error) throw new Error(`Supabase: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const hasPartySize = rows.length > 0 && 'party_size' in rows[0];

  /* ── Set one row by hand ────────────────────────────────────────────────── */
  if (setGuest) {
    const matches = rows.filter(r =>
      String(r.full_name ?? '').toLowerCase().includes(setGuest.toLowerCase()) ||
      String(r.email ?? '').toLowerCase() === setGuest.toLowerCase());
    if (matches.length !== 1) {
      console.error(`\n${c.red(`"${setGuest}" matches ${matches.length} guests.`)}`);
      for (const m of matches.slice(0, 10)) console.error(`  ${m.full_name}  ${c.dim(m.email ?? '')}`);
      console.error('');
      process.exitCode = 1;
      return;
    }
    const row = matches[0];
    const size = Number(setSize);
    if (!Number.isInteger(size) || size < 0 || size > 50) {
      console.error(`\n${c.red('--size must be a whole number between 0 and 50.')}\n`);
      process.exitCode = 1; return;
    }
    console.log(`\n${c.bold('Set party size')}`);
    console.log(`  ${row.full_name}`);
    console.log(`  ${row.party_size ?? '(unset)'} -> ${c.bold(String(size))}`);
    if (setReason) console.log(c.dim(`  reason: ${setReason}`));
    if (!apply) {
      console.log(`\n${c.bold('DRY RUN')} — add ${c.bold('--apply')} to write.\n`);
      return;
    }
    const { error } = await db.from(TABLE).update({ party_size: size }).eq('id', row.id);
    if (error) throw new Error(error.message);
    console.log(c.green('\n  written\n'));
    return;
  }

  /* ── The report ─────────────────────────────────────────────────────────── */
  const eligible = rows.filter(isApproved);
  const report = eligible.map(row => ({ row, ...proposePartySize(row) }));
  const needsReview = report.filter(r => r.review);
  const changes = report.filter(r => (r.row.party_size ?? null) !== r.proposed);
  const autoApplicable = changes.filter(r => !r.review);

  if (asCsv) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    console.log(['full_name','guest_count','plus_one_requested','plus_one_name','plus_one_status',
                 'approved_for','parsed_plus_n','current_party_size','proposed_party_size',
                 'reason','needs_review','flags'].map(esc).join(','));
    for (const r of report) {
      console.log([r.row.full_name, r.row.guest_count, r.row.plus_one_requested, r.row.plus_one_name,
                   r.row.plus_one_status, r.row.approved_for, r.parsed ?? '', r.row.party_size ?? '',
                   r.proposed, r.reason, r.review ? 'YES' : '', r.flags.join(' | ')].map(esc).join(','));
    }
    return;
  }

  console.log(`\n${c.bold('party_size proposal')}  ${c.dim(`${rows.length} rows, ${eligible.length} approved`)}`);
  if (!hasPartySize) {
    console.log(c.amber('\n  party_size does not exist yet — 0007 has not been applied.'));
    console.log(c.dim('  The report below still works; "current" reads as unset for every row.'));
  }

  const shown = reviewOnly ? needsReview : report;
  console.log(`\n${c.bold(reviewOnly ? 'Needs review' : 'Every approved guest')}  ${c.dim(`${shown.length}`)}\n`);
  console.log(c.dim(
    '  name                          gc  p1?  p1 status   tier        +N   now  ->  new  '));
  for (const r of shown) {
    const w = r.review ? c.amber('REVIEW') : '      ';
    console.log(
      `  ${String(r.row.full_name ?? '').slice(0, 28).padEnd(29)}` +
      `${String(r.row.guest_count ?? '-').padStart(2)}  ` +
      `${(r.row.plus_one_requested ? 'y' : 'n').padEnd(4)}` +
      `${String(r.row.plus_one_status ?? '-').slice(0, 10).padEnd(12)}` +
      `${String(r.row.approved_for ?? '-').slice(0, 10).padEnd(12)}` +
      `${String(r.parsed ?? '-').padStart(2)}   ` +
      `${String(r.row.party_size ?? '-').padStart(3)}  ->  ${c.bold(String(r.proposed).padStart(3))}  ${w}`);
    console.log(c.dim(`      ${r.reason}`));
    if (r.row.plus_one_name) console.log(c.dim(`      plus one named: ${r.row.plus_one_name}`));
    for (const f of r.flags) console.log(`      ${c.amber('!')} ${c.dim(f)}`);
  }

  const dist = new Map();
  for (const r of report) dist.set(r.proposed, (dist.get(r.proposed) ?? 0) + 1);
  console.log(`\n${c.bold('Proposed sizes')}`);
  for (const [size, n] of [...dist].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${String(n).padStart(4)} guests  ->  party of ${size}`);
  }
  const headcount = report.reduce((a, r) => a + r.proposed, 0);
  console.log(`\n  ${c.bold('total admitted headcount:')} ${headcount}` +
              c.dim(`   (today, from guest_count: ${eligible.reduce((a, r) => a + (r.guest_count ?? 0), 0)})`));

  console.log(`\n${c.bold('Summary')}`);
  console.log(`  ${c.amber('need a human decision')}  ${String(needsReview.length).padStart(4)}`);
  console.log(`  would change            ${String(changes.length).padStart(4)}`);
  console.log(`  ${c.green('safe to apply')}           ${String(autoApplicable.length).padStart(4)}   ${c.dim('unflagged only')}`);

  if (!apply) {
    console.log(`\n${c.bold('DRY RUN')} — nothing written.`);
    console.log(`  ${c.bold('--apply')} writes the ${autoApplicable.length} unflagged change(s) and SKIPS every flagged row.`);
    console.log(`  Flagged rows are set individually:`);
    console.log(c.dim(`    npm run party:set -- --guest "Olori" --size 9 --reason "confirmed" --apply\n`));
    return;
  }

  if (!hasPartySize) {
    console.error(c.red('\n  Cannot apply: party_size does not exist. Run 0007 first.\n'));
    process.exitCode = 1;
    return;
  }

  let written = 0;
  for (const r of autoApplicable) {
    const { error } = await db.from(TABLE).update({ party_size: r.proposed }).eq('id', r.row.id);
    if (error) { console.error(`  ${c.red('FAIL')} ${r.row.full_name}: ${error.message}`); continue; }
    written++;
  }
  console.log(`\n  ${c.green(`wrote ${written}`)}`);
  console.log(c.dim(`  ${needsReview.length} flagged row(s) left untouched — decide those individually.\n`));
}

if (RUN) {
  main().catch(err => { console.error(`\n${c.red('Failed')}\n\n${err.message}\n`); process.exitCode = 1; });
}
