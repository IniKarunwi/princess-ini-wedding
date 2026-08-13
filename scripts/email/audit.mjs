#!/usr/bin/env node
/**
 * Audits recipient selection and rendering against REAL guest data.
 *
 *   npm run email:audit                       # from the sheet export
 *   npm run email:audit -- --live             # from Supabase (needs .env)
 *   npm run email:audit -- --write-samples    # also dump one pack per scenario
 *
 * Sends nothing. Writes nothing to the database. Ever.
 *
 * ── What it is for ─────────────────────────────────────────────────────────
 * The unit tests use fixtures, which prove the logic is self-consistent. They
 * cannot tell you whether the eight scenarios that matter actually EXIST in
 * the data, which real guests are in each, or whether a combination nobody
 * anticipated is sitting in row 143. That is what this does.
 *
 * For every guest it renders the real pack and asserts the invariants against
 * the rendered output — not against the model that produced it, which would
 * only restate the code.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assetUrls, REGISTRY_URL, ASSET_FILES } from './config.mjs';
import { EVENTS, EVENT_ORDER, eventsForGuest, eventsForPlusOne, plusOneState, plusOneBeyondMain } from './events.mjs';
import { classify, selectRecipients, firstName } from './recipients.mjs';
import { renderConfirmationPack } from './template.mjs';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

const live         = process.argv.includes('--live');
const writeSamples = process.argv.includes('--write-samples');

/* ── Source ──────────────────────────────────────────────────────────────────
 * Either the live table, or the sheet run through the sync's own transform so
 * the rows have exactly the shape the sync would write. Using the transform
 * rather than reading the sheet directly matters: approved_for and
 * plus_one_approved_for are DERIVED from the sheet's `main` and `plus`
 * columns, and auditing the raw sheet would audit the wrong thing.
 */
async function loadRows() {
  if (live) {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('--live needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('rsvps').select('*').range(from, from + 999);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return { rows, origin: `Supabase — ${rows.length} rows` };
  }

  const { loadSource } = await import('../sync/sources/index.mjs');
  const { planSync }   = await import('../sync/engine.mjs');
  const source = await loadSource({ file: './data/rsvps.xlsx' });
  const plan   = planSync(source, []);

  // planSync against an empty table yields one insert per sheet row, each
  // already in database shape.
  const rows = plan.inserts.map(i => ({
    id: `sheet-${i.rowNumber}`,
    _row: i.rowNumber,
    ...i.record,
  }));
  return { rows, origin: `${source.name} via the sync transform — ${rows.length} rows` };
}

/* ── The eight scenarios ─────────────────────────────────────────────────── */

const tierKey = (row) => eventsForGuest(row).map(e => e.key).join('+') || 'NONE';

const SCENARIOS = [
  { n: 1, name: 'Main: Service + Reception + After Party',
    match: r => tierKey(r) === 'JOINING+RECEPTION+AFTERPARTY' },
  { n: 2, name: 'Main: Service + Reception only',
    match: r => tierKey(r) === 'JOINING+RECEPTION' },
  { n: 3, name: 'Main: Reception only',
    match: r => tierKey(r) === 'RECEPTION' },
  { n: 4, name: 'Main: After Party only',
    match: r => tierKey(r) === 'AFTERPARTY' },
  { n: 5, name: '+1 approved',
    match: r => plusOneState(r) === 'approved' },
  { n: 6, name: '+1 rejected / not approved',
    match: r => plusOneState(r) === 'declined' },
  { n: 7, name: 'Main and +1 on DIFFERENT tiers',
    match: r => plusOneState(r) === 'approved'
      && eventsForPlusOne(r).map(e => e.key).join('+') !== tierKey(r) },
  { n: 8, name: 'No +1',
    match: r => plusOneState(r) === 'none' },
];

/* ── An INDEPENDENT reading of the data ──────────────────────────────────────
 * Deliberately does not use events.mjs. An audit that asks the production
 * parser what a guest is invited to, then checks the email against that
 * answer, cannot disagree with itself — it restates the code and passes
 * whatever the code does. Verified: replacing eventsForPlusOne with the main
 * guest's tier slipped through the first version of this file unnoticed.
 *
 * So the expectation is re-derived here from the raw column text, by a second
 * implementation. If the two ever disagree, one of them is wrong and the
 * audit says so.
 */
const EXPECTED_TIER_EVENTS = {
  JOINING:    ['JOINING', 'RECEPTION', 'AFTERPARTY'],
  RECEPTION:  ['RECEPTION'],
  AFTERPARTY: ['AFTERPARTY'],
};

function expectedEvents(raw) {
  if (raw === null || raw === undefined) return [];
  const keys = new Set();
  for (const part of String(raw).split(/[,+&/]|\band\b/i)) {
    const t = part.trim().toUpperCase().replace(/[\s_-]+/g, '');
    if (t === '') continue;
    const key = t === 'AFTERPARTY' ? 'AFTERPARTY'
              : t === 'CEREMONY' || t === 'SERVICE' || t === 'WEDDINGSERVICE' ? 'JOINING'
              : t === 'WEDDINGRECEPTION' ? 'RECEPTION'
              : ['JOINING', 'RECEPTION'].includes(t) ? t : null;
    if (key) for (const k of EXPECTED_TIER_EVENTS[key]) keys.add(k);
  }
  return EVENT_ORDER.filter(k => keys.has(k));
}

/* ── Invariants, checked against the RENDERED email ──────────────────────── */

/**
 * Strips the hidden preheader and HTML comments before searching, so a match
 * means a guest could actually read the word.
 */
function visibleText(html) {
  return html
    .replace(/<div style="display:none[\s\S]*?<\/div>/, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * The plus one's own event list, isolated from the rest of the email.
 *
 * Returns null when no list is rendered. Bounded by the "is invited to" label
 * and the sentence that closes the card, so the main guest's badges above it
 * cannot be mistaken for the plus one's.
 */
function plusOneBlock(html) {
  const start = html.indexOf('is invited to');
  if (start === -1) return null;
  const end = html.indexOf('Do share the timeline', start);
  return html.slice(start, end === -1 ? start + 2000 : end);
}

function auditGuest(row, assets, siteUrl) {
  const pack     = renderConfirmationPack(row, { assets, rsvpUrl: siteUrl });
  const visible  = visibleText(pack.html);
  const haystack = `${visible}\n${pack.text}`;
  const state    = plusOneState(row);
  const problems = [];

  // Expectations from the raw columns, independent of events.mjs.
  const wantMain = expectedEvents(row.approved_for);
  const wantP1   = state === 'approved' ? expectedEvents(row.plus_one_approved_for) : [];
  const invited  = new Set(wantMain);
  const p1Keys   = new Set(wantP1);
  const p1       = wantP1.map(k => EVENTS[k]);

  // 0. The production model and this independent reading must agree.
  const gotMain = pack.events.map(e => e.key);
  if (gotMain.join('+') !== wantMain.join('+')) {
    problems.push(`approved_for="${row.approved_for}" reads as [${wantMain.join(', ')}] ` +
                  `but the email was built from [${gotMain.join(', ') || 'nothing'}]`);
  }
  if (state === 'approved') {
    const gotP1 = (pack.plusOneEvents ?? []).map(e => e.key);
    if (gotP1.join('+') !== wantP1.join('+')) {
      problems.push(`plus_one_approved_for="${row.plus_one_approved_for}" reads as ` +
                    `[${wantP1.join(', ')}] but the email used [${gotP1.join(', ') || 'nothing'}]`);
    }
  }

  // 1. Every invited event is present.
  for (const key of wantMain) {
    if (!haystack.includes(EVENTS[key].name)) {
      problems.push(`invited to ${EVENTS[key].name} but it is not in the email`);
    }
  }

  // 2. No uninvited event appears — for the guest OR their plus one. An event
  //    the plus one is invited to is legitimately present, so it is excluded
  //    from this check and reported separately below.
  for (const key of EVENT_ORDER) {
    if (invited.has(key) || p1Keys.has(key)) continue;
    const e = EVENTS[key];
    if (haystack.includes(e.name)) problems.push(`NOT invited to ${e.name} but it appears`);
    if (haystack.includes(e.time) && !pack.events.some(x => x.time === e.time)
        && !p1.some(x => x.time === e.time)) {
      problems.push(`NOT invited to ${e.name} but its time ${e.time} appears`);
    }
  }

  // 3. Nothing is shown as an exclusion.
  for (const phrase of ['not invited', 'unable to attend', 'you are not', 'excluded']) {
    if (new RegExp(phrase, 'i').test(visible)) problems.push(`exclusion wording present: "${phrase}"`);
  }

  // 4. The plus-one message reflects the PLUS ONE's tier, not the guest's.
  //    Checked as an EXACT set, not "contains": a bug that made the plus one
  //    inherit the main guest's tier would list too many events, and a
  //    contains-check would pass it happily.
  if (state === 'approved') {
    if (!wantP1.length) problems.push('plus one approved but has no tier — should have been held');
    if (!/reserved a seat/i.test(visible.replace(/\s+/g, ' '))) {
      problems.push('plus one approved but the confirmation wording is missing');
    }

    const block = plusOneBlock(pack.html);
    if (block === null) {
      if (wantP1.length) problems.push('plus one has events but no list is rendered');
    } else {
      const shown = EVENT_ORDER.filter(k => block.includes(EVENTS[k].name));
      const want  = wantP1;
      if (shown.join('+') !== want.join('+')) {
        problems.push(`plus one list is [${shown.join(', ') || 'empty'}] but should be ` +
                      `[${want.join(', ')}] — inherited from the main guest?`);
      }
    }
  }
  if (state === 'declined') {
    if (/Great news/i.test(visible)) problems.push('plus one declined but shown the approved wording');
    if (!/only able to reserve a seat for you/i.test(visible.replace(/\s+/g, ' '))) {
      problems.push('plus one declined but the capacity wording is missing');
    }
  }
  if (state === 'none' && /plus one/i.test(visible)) {
    problems.push('no plus one requested, but plus ones are mentioned');
  }

  // 5. The registry is in every pack.
  if (!pack.html.includes(REGISTRY_URL)) problems.push('registry link missing');
  if (!/Wedding Registry/i.test(visible))  problems.push('registry section missing');
  if (!pack.text.includes(REGISTRY_URL))   problems.push('registry missing from the plain text');

  return { pack, problems };
}

/* ── Run ─────────────────────────────────────────────────────────────────── */

const { rows, origin } = await loadRows();
const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
const assets  = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });

console.log(`\n${c.bold('Recipient & rendering audit')}`);
console.log(c.dim(`  source: ${origin}`));
console.log(c.dim(`  ${live ? 'READ ONLY — nothing is written or sent.' : 'Offline. Nothing is written or sent.'}\n`));

const { send: eligible, skipped } = selectRecipients(rows);
console.log(`  eligible to receive a pack : ${c.bold(String(eligible.length))}`);
console.log(`  skipped                    : ${skipped.length}\n`);

// Why the skips, grouped — this is where data-model gaps surface.
const bySkip = new Map();
for (const s of skipped) {
  const key = s.reason.replace(/\(.*\)/, '(…)').replace(/:.*/, '');
  bySkip.set(key, (bySkip.get(key) ?? []).concat(s));
}
console.log(c.bold('  Why guests are skipped'));
for (const [reason, list] of [...bySkip].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${String(list.length).padStart(3)}  ${reason}`);
}

// ── Scenario coverage ───────────────────────────────────────────────────────
console.log(`\n${c.bold('Scenario coverage')}  ${c.dim('(among guests who would receive a pack)')}\n`);

const samples = [];
for (const s of SCENARIOS) {
  const hits = eligible.filter(s.match);
  const label = `${String(s.n).padStart(2)}. ${s.name}`.padEnd(46);

  if (!hits.length) {
    console.log(`  ${label} ${c.amber('NO REAL GUEST')}`);
    continue;
  }
  console.log(`  ${label} ${c.green(String(hits.length).padStart(3))} guest(s)`);
  for (const r of hits.slice(0, 3)) {
    const where = r._row ? `sheet row ${r._row}` : r.id;
    const p1 = plusOneState(r) === 'approved'
      ? `  +1: ${eventsForPlusOne(r).map(e => e.name).join(', ') || '(none)'}` : '';
    console.log(c.dim(`        ${(r.full_name || '(no name)').padEnd(28)} ${where.padEnd(14)} ` +
                      `${eventsForGuest(r).map(e => e.name).join(', ')}${p1}`));
  }
  if (hits.length > 3) console.log(c.dim(`        …and ${hits.length - 3} more`));
  samples.push({ scenario: s, row: hits[0] });
}

// ── Render every eligible guest and check the invariants ────────────────────
console.log(`\n${c.bold('Rendering every eligible guest')}\n`);

let clean = 0;
const failures = [];
for (const row of eligible) {
  const { problems } = auditGuest(row, assets, siteUrl);
  if (problems.length) failures.push({ row, problems });
  else clean++;
}

console.log(`  ${c.green(String(clean))} rendered clean`);
if (failures.length) {
  console.log(`  ${c.red(String(failures.length))} with problems:\n`);
  for (const f of failures.slice(0, 20)) {
    console.log(`    ${c.red(f.row.full_name || '(no name)')} ${c.dim(f.row._row ? `row ${f.row._row}` : f.row.id)}`);
    for (const p of f.problems) console.log(`      · ${p}`);
  }
  if (failures.length > 20) console.log(c.dim(`    …and ${failures.length - 20} more`));
}

// ── Data-model observations ─────────────────────────────────────────────────
console.log(`\n${c.bold('Data-model observations')}\n`);

const note = (label, list, detail) => {
  if (!list.length) return;
  console.log(`  ${c.amber(String(list.length).padStart(3))}  ${label}`);
  if (detail) for (const x of list.slice(0, 5)) console.log(c.dim(`        ${detail(x)}`));
  if (list.length > 5) console.log(c.dim(`        …and ${list.length - 5} more`));
};

const named = r => `${(r.full_name || '(no name)').padEnd(28)} ${r._row ? `row ${r._row}` : r.id}`;

note('plus one approved but no tier set — held back',
  rows.filter(r => plusOneState(r) === 'approved' && eventsForPlusOne(r).length === 0), named);
note('plus one invited to MORE than the guest',
  rows.filter(r => plusOneState(r) === 'approved' && plusOneBeyondMain(r).length),
  r => `${named(r)}  guest: ${eventsForGuest(r).map(e => e.name).join(', ') || 'none'} | ` +
       `+1 also: ${plusOneBeyondMain(r).map(e => e.name).join(', ')}`);
note('plus one requested, decision still pending',
  rows.filter(r => plusOneState(r) === 'pending'), named);
note('approved for the day but no tier recorded',
  rows.filter(r => String(r.main_invite_status).toUpperCase() === 'APPROVED'
    && eventsForGuest(r).length === 0), named);
note('RSVP\'d yes but the invitation is not approved',
  rows.filter(r => r.attending === true
    && String(r.main_invite_status || '').toUpperCase() !== 'APPROVED'), named);

// Which tier combinations actually occur, so an unanticipated one is visible.
const combos = new Map();
for (const r of rows) {
  const k = `${tierKey(r)}  +1:${plusOneState(r) === 'approved'
    ? (eventsForPlusOne(r).map(e => e.key).join('+') || 'NO-TIER') : plusOneState(r)}`;
  combos.set(k, (combos.get(k) ?? 0) + 1);
}
console.log(`\n  ${c.bold('Tier combinations present in the data')}`);
for (const [k, n] of [...combos].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${k}`);
}

// ── Samples ─────────────────────────────────────────────────────────────────
if (writeSamples && samples.length) {
  const dir = join(process.cwd(), 'scratch', 'email-audit');
  mkdirSync(dir, { recursive: true });
  for (const { scenario, row } of samples) {
    const { pack } = auditGuest(row, assets, siteUrl);
    const slug = `${String(scenario.n).padStart(2, '0')}-${scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    writeFileSync(join(dir, `${slug}.html`), pack.html);
    writeFileSync(join(dir, `${slug}.txt`),  pack.text);
  }
  console.log(`\n  ${c.cyan('Samples')} → ${dir}  ${c.dim('(one real guest per scenario)')}`);
}

console.log('');
if (failures.length) {
  console.log(c.red(`${failures.length} guest(s) render incorrectly.\n`));
  process.exitCode = 1;
} else {
  console.log(c.green(`All ${clean} eligible guests render correctly.\n`));
}
