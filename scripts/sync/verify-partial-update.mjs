#!/usr/bin/env node
/**
 * Verifies that a sync performs a PARTIAL update.
 *
 *   node scripts/sync/verify-partial-update.mjs --file ./data/rsvps.xlsx
 *
 * The harness already proves the sync never *sets* the automation columns.
 * This asks the harder question: when those columns already hold values, and
 * the sync updates other fields on the same row, do the existing values
 * survive untouched?
 *
 * Seeds every existing row with populated automation state, captures every
 * PATCH body sent, then inspects both the wire payloads and the resulting rows.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadSource } from './sources/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GS_DIR = path.join(HERE, '..', '..', 'apps-script');

let failures = 0;
const ok = (c, label, detail = '') => {
  console.log(`  ${c ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${label}${detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''}`);
  if (!c) failures++;
};

const AUTOMATION = ['email_status', 'whatsapp_status', 'last_email_sent', 'last_whatsapp_sent'];
const SENTINEL = {
  email_status:       'SENT',
  whatsapp_status:    'DELIVERED',
  last_email_sent:    '2026-08-01T09:00:00.000Z',
  last_whatsapp_sent: '2026-08-02T17:30:00.000Z',
};

const fileArg = process.argv.indexOf('--file');
const file = fileArg > -1 ? process.argv[fileArg + 1] : './data/rsvps.xlsx';
const source = await loadSource({ file });

const sheetValues = [
  source.headers,
  ...source.rows.map(r => source.headers.map(h => {
    const v = r.values[h];
    return v === null || v === undefined ? '' : v;
  })),
];

// ── Seed the database as it will actually look: guests already synced once,
//    with the messaging automation having since stamped delivery state. ─────
const db = { rows: [] };
const patchBodies = [];

{
  const ctx = vm.createContext(baseSandbox());
  loadGs(ctx);
  const first = ctx.planSync(ctx.readSheetSource_(), []);
  let n = 0;
  for (const i of first.inserts) {
    db.rows.push({ id: `db-${++n}`, created_at: '2026-07-01T00:00:00.000Z', ...i.record, ...SENTINEL });
  }
}

console.log(`\n\x1b[1mSEEDED\x1b[0m  ${db.rows.length} rows, each carrying populated automation state`);
console.log(`\x1b[90m  ${AUTOMATION.map(k => `${k}=${SENTINEL[k]}`).join('\n  ')}\x1b[0m`);

// Mutate the sheet so there is genuine work to do: flip one guest's tier.
const target = source.rows.find(r => r.values.main);
const mutated = {
  ...source,
  rows: source.rows.map(r =>
    r.rowNumber === target.rowNumber
      ? { ...r, values: { ...r.values, main: 'AFTERPARTY', plus_one_name: 'Changed Name' } }
      : r),
};
const mutatedValues = [
  source.headers,
  ...mutated.rows.map(r => source.headers.map(h => {
    const v = r.values[h];
    return v === null || v === undefined ? '' : v;
  })),
];

// ── Run the real Apps Script path against the seeded database ─────────────
const ctx = vm.createContext(baseSandbox(mutatedValues));
loadGs(ctx);

const plan = ctx.planSync(ctx.readSheetSource_(), db.rows);
console.log(`\n\x1b[1mPLAN\x1b[0m  ${plan.inserts.length} insert(s), ${plan.updates.length} update(s), ${plan.unchanged.length} unchanged`);

const results = ctx.sbApplyPlan_(plan);
ok(results.errors.length === 0, 'apply completed without errors',
   results.errors.length ? results.errors[0].message : '');

// ── 1. What actually went over the wire ───────────────────────────────────
console.log('\n\x1b[1mWIRE PAYLOADS\x1b[0m');
ok(patchBodies.length === plan.updates.length,
   'one PATCH per updated row', `${patchBodies.length} request(s)`);

const leaked = patchBodies.flatMap(b => AUTOMATION.filter(k => k in b));
ok(leaked.length === 0, 'no PATCH body contains an automation column',
   leaked.length ? `leaked: ${[...new Set(leaked)].join(', ')}` : '');

const allKeys = [...new Set(patchBodies.flatMap(b => Object.keys(b)))];
console.log(`  \x1b[90mfields sent: ${allKeys.join(', ')}\x1b[0m`);

for (const [i, body] of patchBodies.entries()) {
  const expected = plan.updates[i].changes;
  ok(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(Object.keys(expected).sort()),
     `payload ${i + 1} carries exactly the diffed fields`,
     `${Object.keys(body).length} field(s)`);
}

// ── 2. What survived in the database ──────────────────────────────────────
console.log('\n\x1b[1mSURVIVING VALUES\x1b[0m');
for (const key of AUTOMATION) {
  const intact = db.rows.every(r => r[key] === SENTINEL[key]);
  ok(intact, `${key} unchanged on all ${db.rows.length} rows`,
     intact ? '' : `mutated on ${db.rows.filter(r => r[key] !== SENTINEL[key]).length} row(s)`);
}

const stillHasCreated = db.rows.every(r => r.created_at === '2026-07-01T00:00:00.000Z');
ok(stillHasCreated, 'created_at preserved');

// ── 3. Untouched ordinary columns also survive ────────────────────────────
const changedRow = db.rows.find(r => r.approved_for === 'AFTERPARTY');
ok(!!changedRow, 'the deliberately-changed row was updated');
if (changedRow) {
  ok(changedRow.email !== undefined && changedRow.full_name !== undefined,
     'columns not in the diff are still present on the row');
  ok(changedRow.plus_one_name === 'Changed Name', 'the intended change was applied');
}

console.log(failures ? `\n\x1b[31m${failures} check(s) failed\x1b[0m\n`
                     : '\n\x1b[32mAll checks passed\x1b[0m\n');
process.exitCode = failures ? 1 : 0;

// ─────────────────────────────────────────────────────────────────────────
function loadGs(context) {
  for (const f of fs.readdirSync(GS_DIR).filter(x => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(GS_DIR, f), 'utf8'), { filename: f }).runInContext(context);
  }
}

function baseSandbox(values = sheetValues) {
  const mk = r => ({ getResponseCode: () => r.code, getContentText: () => r.body });

  const handle = (url, opts = {}) => {
    const method = (opts.method || 'get').toLowerCase();
    if (method === 'get') {
      const range = (opts.headers || {}).Range;
      if (range) {
        const [from, to] = range.split('-').map(Number);
        return { code: 200, body: JSON.stringify(db.rows.slice(from, to + 1)) };
      }
      return { code: 200, body: JSON.stringify(db.rows.slice(0, 1)) };
    }
    if (method === 'post') {
      const created = JSON.parse(opts.payload).map((rec, i) => {
        const row = { id: `new-${i}`, created_at: new Date().toISOString(), ...rec };
        db.rows.push(row);
        return row;
      });
      return { code: 201, body: JSON.stringify(created) };
    }
    if (method === 'patch') {
      const body = JSON.parse(opts.payload);
      patchBodies.push(body);
      const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(url)[1]);
      const row = db.rows.find(r => r.id === id);
      // PostgREST semantics: only the keys present in the body are written.
      Object.assign(row, body);
      return { code: 200, body: JSON.stringify([row]) };
    }
    return { code: 405, body: '{}' };
  };

  return {
    console, Object, Array, String, Number, Boolean, Math, JSON, Date, RegExp, Map, Set, Error,
    encodeURIComponent, decodeURIComponent, isNaN, parseInt, parseFloat, Infinity, undefined,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'key' }) },
    UrlFetchApp: { fetch: (u, o) => mk(handle(u, o)), fetchAll: rs => rs.map(r => mk(handle(r.url, r))) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getName: () => 'Wedding Planning',
        getSheets: () => [{ getName: () => 'Guests', getDataRange: () => ({ getValues: () => values }) }],
        getSheetByName: () => null,
        insertSheet: () => ({ appendRow: () => {}, setFrozenRows: () => {}, getRange: () => ({ setFontWeight: () => {} }) }),
      }),
      getUi: () => ({
        alert: () => 'YES', showModalDialog: () => {},
        ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' }, Button: { YES: 'YES' },
        createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => {} }; return m; },
      }),
    },
    HtmlService: { createHtmlOutput: b => { const o = { __body: b, setWidth: () => o, setHeight: () => o }; return o; } },
  };
}
