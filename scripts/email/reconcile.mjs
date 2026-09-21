#!/usr/bin/env node
/**
 * Who should have been emailed, and was not — npm run email:reconcile
 *
 * STRICTLY READ-ONLY. This file contains no insert, update, upsert or delete,
 * against Supabase or anything else. It is an audit and nothing more.
 *
 * ── Why this cannot be answered from rsvps alone ───────────────────────────
 * There is no delivery log. `email_status` and `last_email_sent` are columns
 * ON THE GUEST ROW, written by the sender after a send returns. So the table
 * records what the sender BELIEVES it did, which is not the same as what
 * actually reached an inbox. Three ways they diverge, all of them real:
 *
 *   1. The send succeeded and the write failed. send-confirmations.mjs calls
 *      this "sent, NOT recorded" and prints the ids to fix by hand. If nobody
 *      ran that SQL, the guest looks unsent for ever and a re-run emails them
 *      twice.
 *   2. The send failed. Status is deliberately left untouched so a re-run
 *      retries — which makes a failure indistinguishable from a guest who was
 *      never attempted.
 *   3. The custom send writes NOTHING, by design. Those seven people were
 *      emailed and their rows say otherwise. Reconciling against Supabase
 *      alone would report all seven as missed.
 *
 * So the actual delivery history is Resend's, and this cross-references the
 * two. Without a Resend key it still runs, and says plainly which column of
 * the answer it could not fill in rather than guessing.
 *
 * ── Eligibility ────────────────────────────────────────────────────────────
 * Reuses classify() from recipients.mjs — the very function the sender uses —
 * rather than restating the rules, so this cannot report a guest eligible that
 * the sender would skip. classify() folds "already sent" into its answer, so
 * each row is classified as-if-unsent to separate ELIGIBILITY from SEND STATE.
 * They are different questions and the whole audit turns on not conflating
 * them.
 */

import { TABLE, STATUS } from './config.mjs';
import { classify, isSendableEmail, isUnsent } from './recipients.mjs';
import { eventsForGuest, eventsForPlusOne } from './events.mjs';
import { CUSTOM_RECIPIENTS } from './custom-recipients.mjs';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

const asCsv = process.argv.includes('--csv');
const out = (...a) => { if (!asCsv) console.log(...a); };

/* ── Supabase, read-only ───────────────────────────────────────────────────── */

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Imported by the self test, which exercises audit() against fixtures. Only a
// direct run touches the network.
const RUN = process.argv[1] && process.argv[1].endsWith('reconcile.mjs');

if (RUN && (!url || !key)) {
  console.error(`\n${c.red('Cannot audit without database access.')}\n
This needs, in .env or the environment:

  SUPABASE_URL                 your project URL
  SUPABASE_SERVICE_ROLE_KEY    service role key — read-only use here, but the
                               anon key cannot see the rows under RLS

Optional, and worth setting — without it the "actually delivered" column
cannot be filled in and the audit falls back to what the table claims:

  RESEND_API_KEY               to cross-check against real delivery
`);
  process.exitCode = 1;
}

/** Every row, paged. PostgREST caps a response at 1000. */
async function fetchAll(supabase) {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from(TABLE).select('*').order('id', { ascending: true })
      .range(from, from + size - 1);
    if (error) throw new Error(`Supabase: ${error.message}`);
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

/* ── Resend: what actually went out ────────────────────────────────────────── */

/**
 * Addresses Resend has a record of sending to.
 *
 * Returns null — not an empty set — when this cannot be determined, so a
 * missing key can never be mistaken for "nothing was ever delivered". The
 * difference matters: one is unknown, the other would flag every guest as
 * missed.
 */
async function deliveredAddresses(apiKey) {
  if (!apiKey) return null;
  const seen = new Set();
  try {
    let after = null;
    for (let page = 0; page < 50; page++) {
      const u = new URL('https://api.resend.com/emails');
      u.searchParams.set('limit', '100');
      if (after) u.searchParams.set('after', after);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) {
        out(c.amber(`\n  Resend returned HTTP ${r.status} for the email list.`));
        out(c.dim('  Newer Resend accounts expose GET /emails; older ones do not.'));
        return null;
      }
      const body = await r.json();
      const items = body?.data ?? [];
      for (const e of items) {
        for (const to of [].concat(e.to ?? [])) seen.add(String(to).trim().toLowerCase());
      }
      if (items.length < 100) break;
      after = items.at(-1)?.id;
      if (!after) break;
    }
    return seen;
  } catch (e) {
    out(c.amber(`\n  Could not reach Resend: ${e.message}`));
    return null;
  }
}

/* ── Classification ────────────────────────────────────────────────────────── */

const CUSTOM = new Set(CUSTOM_RECIPIENTS.map(r => r.email.trim().toLowerCase()));
const norm = (e) => String(e ?? '').trim().toLowerCase();

export function audit(rows, delivered) {
  const missed = [], intentional = [], badEmail = [], sentOk = [], discrepancy = [];

  for (const row of rows) {
    // Eligibility, judged independently of whether anything was sent — by
    // asking the production classifier about a copy with the send state
    // cleared. Same rules as the sender, no second implementation to drift.
    const verdict = classify({ ...row, email_status: null, last_email_sent: null });

    const emailOk = isSendableEmail(row.email);
    const events  = eventsForGuest(row).map(e => e.name).join(' + ') || '—';
    const recorded = !isUnsent(row);
    const inResend = delivered ? delivered.has(norm(row.email)) : null;
    const isCustom = CUSTOM.has(norm(row.email));

    const base = {
      name: row.full_name || '(no name)',
      email: row.email ?? '',
      id: row.id,
      tier: row.approved_for ?? '—',
      events,
      status: row.email_status ?? '(null)',
      last: row.last_email_sent ?? '—',
      recorded, inResend, isCustom,
    };

    // 1. No usable address — cannot be emailed at all, regardless of anything
    //    else. Checked first so it is never miscounted as a genuine miss.
    if (!emailOk) {
      badEmail.push({ ...base, why: row.email ? `unusable address: ${row.email}` : 'no email address on file' });
      continue;
    }

    // 2. Deliberately not eligible.
    if (!verdict.send) {
      intentional.push({ ...base, why: verdict.reason });
      continue;
    }

    // 3. Eligible with a good address. Did it actually go?
    const actually = inResend === null ? recorded : inResend;

    if (actually) {
      // Sent — but does the table agree?
      if (!recorded && inResend === true) {
        discrepancy.push({ ...base, why: isCustom
          ? 'sent via the custom one-off, which writes nothing to the database by design'
          : 'DELIVERED but email_status was never written — a re-run would email them twice' });
      } else {
        sentOk.push({ ...base, why: 'sent and recorded' });
      }
      continue;
    }

    // Not delivered.
    if (recorded && inResend === false) {
      discrepancy.push({ ...base, why: `marked ${row.email_status} but Resend has no record of delivery` });
    } else {
      missed.push({ ...base, why: recorded
        ? 'marked sent, but no delivery record — verify manually'
        : 'eligible, valid address, never sent — send failed or the run never reached them' });
    }
  }

  return { missed, intentional, badEmail, sentOk, discrepancy };
}

/* ── Output ────────────────────────────────────────────────────────────────── */

const COLS = [
  ['Guest name', r => r.name, 26],
  ['Email', r => r.email, 32],
  ['RSVP ID', r => String(r.id), 38],
  ['Approved tier', r => r.tier, 14],
  ['Events', r => r.events, 42],
  ['Email status', r => r.status, 12],
  ['Last email sent', r => (r.last === '—' ? '—' : String(r.last).slice(0, 19)), 20],
  ['Actually sent', r => r.inResend === null ? 'unknown' : (r.inResend ? 'yes' : 'no'), 13],
  ['Why', r => r.why, 62],
];

function table(rows) {
  if (!rows.length) { out(c.dim('    none\n')); return; }
  out('    ' + COLS.map(([h, , w]) => c.dim(h.padEnd(w))).join(' '));
  for (const r of rows) {
    out('    ' + COLS.map(([, f, w]) => String(f(r) ?? '').slice(0, w).padEnd(w)).join(' '));
  }
  out('');
}

function csv(all) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  console.log(['Category', ...COLS.map(([h]) => h)].map(esc).join(','));
  for (const [cat, rows] of all) {
    for (const r of rows) console.log([cat, ...COLS.map(([, f]) => f(r))].map(esc).join(','));
  }
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const rows = await fetchAll(supabase);
  const delivered = await deliveredAddresses(process.env.RESEND_API_KEY);

  const { missed, intentional, badEmail, sentOk, discrepancy } = audit(rows, delivered);

  if (asCsv) {
    csv([['GENUINE MISS', missed], ['DISCREPANCY', discrepancy],
         ['INTENTIONAL', intentional], ['INVALID EMAIL', badEmail], ['SENT OK', sentOk]]);
    return;
  }

  out(`\n${c.bold('Email reconciliation')}  ${c.dim(`${rows.length} rsvps rows`)}`);
  out(c.dim('  Read-only. Nothing was written.'));
  out(delivered
    ? c.dim(`  Cross-checked against ${delivered.size} addresses Resend has delivered to.`)
    : c.amber('  No Resend data — "actually sent" falls back to what the table claims.'));

  out(`\n${c.bold(c.red('1. GENUINE MISSES'))} ${c.dim('— eligible, valid address, not sent')}`);
  table(missed);

  out(`${c.bold(c.amber('2. DISCREPANCIES'))} ${c.dim('— table and delivery history disagree')}`);
  table(discrepancy);

  out(`${c.bold(c.cyan('3. INTENTIONALLY NOT SENT'))} ${c.dim('— rejected / pending / not eligible')}`);
  table(intentional);

  out(`${c.bold('4. INVALID OR MISSING EMAIL')}`);
  table(badEmail);

  // ── Who is coming to what ─────────────────────────────────────────────────
  //
  // Two different questions, and conflating them is how a caterer gets the
  // wrong number:
  //
  //   BY TIER   how many guests hold each approved_for value. Three buckets,
  //             and they sum to the cohort.
  //   BY EVENT  how many guests are actually in the room for each part of the
  //             day. A JOINING guest is in ALL THREE, so these buckets overlap
  //             and deliberately do NOT sum to the cohort.
  //
  // Plus ones are counted separately again: they are not recipients and have
  // no row, but they occupy a seat, and their tier is independent of the
  // guest's — someone approved for the whole day may be bringing a plus one
  // who is only approved for the reception.
  const cohort = [...sentOk, ...discrepancy.filter(d => d.inResend === true)];
  const rowsById = new Map(rows.map(r => [r.id, r]));

  const byTier = new Map();
  const byEvent = new Map();
  const plusByEvent = new Map();
  let withPlusOne = 0;

  for (const entry of cohort) {
    const row = rowsById.get(entry.id);
    if (!row) continue;

    const tier = String(row.approved_for ?? '—').trim().toUpperCase();
    byTier.set(tier, (byTier.get(tier) ?? 0) + 1);

    for (const ev of eventsForGuest(row)) {
      byEvent.set(ev.name, (byEvent.get(ev.name) ?? 0) + 1);
    }

    const plus = eventsForPlusOne(row);
    if (plus.length) {
      withPlusOne++;
      for (const ev of plus) plusByEvent.set(ev.name, (plusByEvent.get(ev.name) ?? 0) + 1);
    }
  }

  const ORDER = ['Wedding Service', 'Wedding Reception', 'After Party'];
  out(`\n${c.bold('Who has been emailed, by tier')}  ${c.dim(`${cohort.length} guests actually emailed`)}`);
  for (const [tier, n] of [...byTier].sort((a, b) => b[1] - a[1])) {
    out(`  ${String(n).padStart(4)}  ${tier}`);
  }
  out(c.dim('        these sum to the cohort — one tier per guest'));

  out(`\n${c.bold('Who is in the room, by event')}`);
  out(c.dim('        JOINING guests appear in all three, so these OVERLAP'));
  for (const name of ORDER) {
    const guests = byEvent.get(name) ?? 0;
    const plus = plusByEvent.get(name) ?? 0;
    out(`  ${String(guests).padStart(4)}  ${name.padEnd(18)}` +
        c.dim(` + ${plus} plus one${plus === 1 ? '' : 's'}  =  ${guests + plus} seats`));
  }
  out(c.dim(`\n        ${withPlusOne} of the ${cohort.length} emailed are bringing an approved plus one.`));
  out(c.dim('        Plus ones are not recipients — they have no row and no address —'));
  out(c.dim('        but they take a seat, and their tier is independent of the guest\'s.'));

  out(`\n${c.bold('Totals')}`);
  out(`  ${c.red('genuine misses')}          ${String(missed.length).padStart(4)}   ${c.dim('<- people with a valid address who should have been emailed and were not')}`);
  out(`  ${c.amber('discrepancies')}           ${String(discrepancy.length).padStart(4)}`);
  out(`  ${c.cyan('intentionally not sent')}  ${String(intentional.length).padStart(4)}`);
  out(`  invalid/missing email   ${String(badEmail.length).padStart(4)}`);
  out(`  ${c.green('sent and recorded')}       ${String(sentOk.length).padStart(4)}`);
  out(`  ${c.dim('total rows')}              ${String(rows.length).padStart(4)}`);

  const sum = missed.length + discrepancy.length + intentional.length + badEmail.length + sentOk.length;
  out(sum === rows.length
    ? c.dim('\n  Every row is accounted for in exactly one category.')
    : c.red(`\n  Categories sum to ${sum}, not ${rows.length} — the audit is losing rows.`));

  out(`\n  ${c.bold('Answer:')} ${c.red(String(missed.length))} people with a valid email address were eligible and never received one.`);
  if (!delivered) out(c.dim('  Set RESEND_API_KEY to confirm this against real delivery rather than the table.\n'));
  else out('');
}

if (RUN && url && key) {
  main().catch(e => { console.error(`\n${c.red('Audit failed')}\n\n${e.message}\n`); process.exitCode = 1; });
}
