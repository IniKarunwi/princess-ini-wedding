#!/usr/bin/env node
/**
 * Apps Script harness — executes the .gs files in a simulated Google runtime.
 *
 *   node scripts/sync/appsscript-harness.mjs --file ./data/rsvps.xlsx
 *
 * Apps Script cannot be run locally, so this stubs the four services the sync
 * touches — SpreadsheetApp, UrlFetchApp, PropertiesService, HtmlService — and
 * loads every .gs file into one shared global scope, exactly as Apps Script
 * does. The Supabase REST API is emulated in memory.
 *
 * It catches what the eye misses: syntax that V8 rejects, name collisions in
 * the shared scope, malformed REST calls, and divergence from the Node planner.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadSource } from './sources/index.mjs';
import { planSync } from './engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GS_DIR = path.join(HERE, '..', '..', 'apps-script');

let failures = 0;
const ok = (cond, label, detail = '') => {
  console.log(`  ${cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${label}${detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''}`);
  if (!cond) failures++;
};

const fileArg = process.argv.indexOf('--file');
const file = fileArg > -1 ? process.argv[fileArg + 1] : './data/rsvps.xlsx';

// ── Build the fake sheet from the real spreadsheet ─────────────────────────
const source = await loadSource({ file });
const sheetValues = [
  source.headers,
  ...source.rows.map(r => source.headers.map(h => {
    const v = r.values[h];
    return v === null || v === undefined ? '' : v;
  })),
];

// ── In-memory Supabase ─────────────────────────────────────────────────────
const db = { rows: [], nextId: 1 };
const requestLog = [];

function handleRequest(url, opts = {}) {
  const method = (opts.method || 'get').toLowerCase();
  requestLog.push({ method, url });

  const headers = opts.headers || {};
  if (!headers.apikey || !headers.Authorization) {
    return { code: 401, body: JSON.stringify({ message: 'missing credentials' }) };
  }
  if (!/\/rest\/v1\/rsvps/.test(url)) {
    return { code: 404, body: JSON.stringify({ message: 'no such table' }) };
  }

  if (method === 'get') {
    const range = headers.Range;
    if (range) {
      const [from, to] = range.split('-').map(Number);
      return { code: 200, body: JSON.stringify(db.rows.slice(from, to + 1)) };
    }
    const limit = /limit=(\d+)/.exec(url);
    return { code: 200, body: JSON.stringify(limit ? db.rows.slice(0, +limit[1]) : db.rows) };
  }

  if (method === 'post') {
    const payload = JSON.parse(opts.payload);

    // Real PostgREST rejects a bulk insert whose objects do not all carry the
    // same keys: PGRST102, "All object keys must match". The emulator enforces
    // it too — without this, a payload that production refuses looks fine here.
    if (Array.isArray(payload) && payload.length > 1) {
      const signature = JSON.stringify(Object.keys(payload[0]).sort());
      const offender = payload.findIndex(
        r => JSON.stringify(Object.keys(r).sort()) !== signature);
      if (offender > 0) {
        return {
          code: 400,
          body: JSON.stringify({
            code: 'PGRST102',
            message: 'All object keys must match',
            details: `object 0 has [${Object.keys(payload[0]).sort()}], ` +
                     `object ${offender} has [${Object.keys(payload[offender]).sort()}]`,
          }),
        };
      }
    }
    const created = payload.map(rec => {
      // Reject writes to generated / immutable columns, as Postgres would.
      for (const col of ['id', 'created_at', 'guest_count', 'seat_allocation']) {
        if (col in rec) throw new Error(`REST accepted a write to ${col}`);
      }
      const row = { id: `db-${db.nextId++}`, created_at: new Date().toISOString(), ...rec };
      db.rows.push(row);
      return row;
    });
    return { code: 201, body: JSON.stringify(created) };
  }

  if (method === 'patch') {
    const m = /id=eq\.([^&]+)/.exec(url);
    if (!m) return { code: 400, body: JSON.stringify({ message: 'no id filter' }) };
    const row = db.rows.find(r => r.id === decodeURIComponent(m[1]));
    if (!row) return { code: 404, body: JSON.stringify({ message: 'not found' }) };
    const changes = JSON.parse(opts.payload);
    for (const col of ['id', 'created_at', 'guest_count', 'seat_allocation']) {
      if (col in changes) throw new Error(`REST accepted a write to ${col}`);
    }
    Object.assign(row, changes);
    return { code: 200, body: JSON.stringify([row]) };
  }

  return { code: 405, body: JSON.stringify({ message: 'method not allowed' }) };
}

const mkResponse = r => ({
  getResponseCode: () => r.code,
  getContentText: () => r.body,
});

// ── Google service stubs ───────────────────────────────────────────────────
const dialogs = [];
const alerts = [];
let alertAnswer = 'YES';

const sandbox = {
  console,
  Object, Array, String, Number, Boolean, Math, JSON, Date, RegExp, Map, Set, Error,
  encodeURIComponent, decodeURIComponent, isNaN, parseInt, parseFloat, Infinity, undefined,

  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: k => ({
        SUPABASE_URL: 'https://fake.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key',
      }[k] || null),
    }),
  },

  UrlFetchApp: {
    fetch: (url, opts) => mkResponse(handleRequest(url, opts)),
    fetchAll: reqs => reqs.map(r => mkResponse(handleRequest(r.url, r))),
  },

  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getName: () => 'Wedding Planning',
      getSheets: () => [fakeSheet],
      getSheetByName: n => (n === 'Sync Log' ? (logSheetCreated ? logSheet : null)
                           : n === fakeSheet.getName() ? fakeSheet : null),
      insertSheet: n => { logSheetCreated = true; logSheet.__name = n; return logSheet; },
    }),
    getUi: () => ({
      alert: (...a) => { alerts.push(a); return alertAnswer; },
      showModalDialog: (html, title) => dialogs.push({ title, body: html.__body }),
      ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' },
      Button: { YES: 'YES', NO: 'NO' },
      createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => {} }; return m; },
    }),
  },

  HtmlService: {
    createHtmlOutput: body => {
      const o = { __body: body, setWidth: () => o, setHeight: () => o };
      return o;
    },
  },
};

const logRows = [];
let logSheetCreated = false;
const logSheet = {
  __name: 'Sync Log',
  getName: () => logSheet.__name,
  appendRow: r => logRows.push(r),
  setFrozenRows: () => {},
  getRange: () => ({ setFontWeight: () => {} }),
};

const fakeSheet = {
  getName: () => 'Guests',
  getDataRange: () => ({ getValues: () => sheetValues }),
};

// ── Load every .gs file into one shared scope, as Apps Script does ─────────
const context = vm.createContext(sandbox);
const gsFiles = fs.readdirSync(GS_DIR).filter(f => f.endsWith('.gs')).sort();

console.log('\n\x1b[1mLOAD — .gs files into a shared global scope\x1b[0m');
for (const f of gsFiles) {
  const src = fs.readFileSync(path.join(GS_DIR, f), 'utf8');
  try {
    new vm.Script(src, { filename: f }).runInContext(context);
    ok(true, `loaded ${f}`);
  } catch (err) {
    ok(false, `loaded ${f}`, err.message);
  }
}

if (failures) {
  console.log(`\n\x1b[31m${failures} file(s) failed to load\x1b[0m\n`);
  process.exit(1);
}

// ── Name-collision check ───────────────────────────────────────────────────
console.log('\n\x1b[1mSCOPE\x1b[0m');
const declared = {};
let collision = null;
for (const f of gsFiles) {
  const src = fs.readFileSync(path.join(GS_DIR, f), 'utf8');
  for (const m of src.matchAll(/^(?:function|var|const|let)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (declared[m[1]] && declared[m[1]] !== f) collision = `${m[1]} in ${declared[m[1]]} and ${f}`;
    declared[m[1]] = f;
  }
}
ok(!collision, 'no duplicate top-level names across files', collision || '');
const evalIn = expr => vm.runInContext(expr, context);
ok(evalIn('typeof planSync') === 'function', 'Core.gs planSync reachable from other files');
// const/let are lexical bindings rather than properties of the global object, so
// they must be evaluated inside the context — this mirrors how Apps Script shares
// top-level declarations between .gs files.
ok(evalIn('typeof TABLE') === 'string', 'Core.gs constants reachable from other files',
   `TABLE=${evalIn('TABLE')}`);
ok(evalIn('typeof FIELD_MAP') === 'object', 'Core.gs FIELD_MAP reachable');

// ── Connection test ────────────────────────────────────────────────────────
console.log('\n\x1b[1mCONNECTION\x1b[0m');
try { ok(context.sbTestConnection_() === true, 'sbTestConnection_ reaches the API'); }
catch (e) { ok(false, 'sbTestConnection_', e.message); }

// ── Sheet reader honours the source contract ───────────────────────────────
console.log('\n\x1b[1mSHEET SOURCE\x1b[0m');
const gsSource = context.readSheetSource_();
ok(gsSource.rows.length === source.rows.length,
   'row count matches the Node file reader', `${gsSource.rows.length} vs ${source.rows.length}`);
ok(JSON.stringify(gsSource.headers) === JSON.stringify(source.headers), 'headers match');
ok(gsSource.rows[0].rowNumber === source.rows[0].rowNumber, 'row numbering matches');

// ── Planner parity ─────────────────────────────────────────────────────────
console.log('\n\x1b[1mPLANNER PARITY (Apps Script vs Node)\x1b[0m');
const gsPlan = context.planSync(gsSource, []);
const nodePlan = planSync(source, []);
ok(gsPlan.inserts.length === nodePlan.inserts.length, 'insert count identical', `${gsPlan.inserts.length}`);
ok(gsPlan.normalizations.length === nodePlan.normalizations.length, 'normalisation count identical', `${gsPlan.normalizations.length}`);
ok(JSON.stringify(gsPlan.inserts.map(i => i.record)) === JSON.stringify(nodePlan.inserts.map(i => i.record)),
   'every generated record is byte-identical');

// ── Full sync against the emulated database ────────────────────────────────
console.log('\n\x1b[1mFIRST SYNC\x1b[0m');
context.runSync();
ok(db.rows.length === nodePlan.inserts.length, 'all guests written to the API', `${db.rows.length} rows`);
ok(!/errors:\s*[1-9]/i.test(dialogs[dialogs.length - 1].body), 'no errors reported');
ok(logRows.length === 2, 'Sync Log header + one run row written');
ok(logRows[1][1] === 'APPLIED', 'run logged as APPLIED');

// ── Idempotency through the Apps Script path ───────────────────────────────
console.log('\n\x1b[1mSECOND SYNC (idempotency)\x1b[0m');
const before = db.rows.length;
const plan2 = context.planSync(context.readSheetSource_(), db.rows);
ok(plan2.inserts.length === 0, 'no duplicate inserts');
ok(plan2.updates.length === 0, 'no redundant updates',
   plan2.updates.length ? JSON.stringify(plan2.updates[0].changes) : '');
ok(plan2.unchanged.length === before, 'every row recognised as unchanged');

context.runSync();
ok(db.rows.length === before, 'row count unchanged after a second Sync Now');

// ── Guard rails ────────────────────────────────────────────────────────────
console.log('\n\x1b[1mGUARD RAILS\x1b[0m');
const wrote = k => db.rows.some(r => k in r && r[k] !== undefined && r[k] !== null);
ok(!wrote('email_status'),       'email_status never written');
ok(!wrote('whatsapp_status'),    'whatsapp_status never written');
ok(!wrote('last_email_sent'),    'last_email_sent never written');
ok(!wrote('last_whatsapp_sent'), 'last_whatsapp_sent never written');
ok(!db.rows.some(r => 'guest_count' in r),     'guest_count left to the trigger');
ok(!db.rows.some(r => 'seat_allocation' in r), 'seat_allocation left to the generated column');
ok(requestLog.filter(r => r.method === 'post').length === 1, 'inserts sent as ONE batched request');

// ── Preview writes nothing ─────────────────────────────────────────────────
console.log('\n\x1b[1mPREVIEW\x1b[0m');
const rowsBeforePreview = db.rows.length;
const reqBefore = requestLog.filter(r => r.method !== 'get').length;
context.previewSync();
ok(db.rows.length === rowsBeforePreview, 'preview writes no rows');
ok(requestLog.filter(r => r.method !== 'get').length === reqBefore, 'preview issues no write requests');
ok(logRows[logRows.length - 1][1] === 'DRY RUN', 'preview logged as DRY RUN');

// ── Failure handling ───────────────────────────────────────────────────────
console.log('\n\x1b[1mFAILURE HANDLING\x1b[0m');
sandbox.PropertiesService.getScriptProperties = () => ({ getProperty: () => null });
context.previewSync();
const last = dialogs[dialogs.length - 1];
ok(/credentials are not set/i.test(last.body), 'missing credentials produce a clear message');
ok(/Failed/.test(last.title), 'failure surfaces as a Failed dialog');

console.log(failures
  ? `\n\x1b[31m${failures} check(s) failed\x1b[0m\n`
  : '\n\x1b[32mAll checks passed\x1b[0m\n');
process.exitCode = failures ? 1 : 0;
