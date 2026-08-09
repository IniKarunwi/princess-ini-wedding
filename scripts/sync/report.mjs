/**
 * Phase 2 — sync report.
 *
 * Printed after every run, dry or applied. Also written to
 * scripts/sync/logs/ as JSON so successive runs can be compared.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'logs');

const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', grey: '\x1b[90m',
};

const line = () => console.log(c.grey + '─'.repeat(64) + c.reset);

function bullets(items, render, limit = 15) {
  items.slice(0, limit).forEach(i => console.log('    ' + render(i)));
  if (items.length > limit) {
    console.log(c.grey + `    … and ${items.length - limit} more (see JSON log)` + c.reset);
  }
}

function describeChanges(changes) {
  return Object.entries(changes)
    .map(([k, v]) => `${k}=${v === null ? 'NULL' : JSON.stringify(v)}`)
    .join(', ');
}

export function printReport({ source, plan, results, applied, existingCount }) {
  const skippedMissing = plan.skipped.filter(s => s.reason === 'missing-identifier');
  const skippedDupes   = plan.skipped.filter(s => s.reason === 'duplicate-in-sheet');

  line();
  console.log(`${c.bold}RSVP SYNC${c.reset}  ${c.dim}${applied ? 'APPLIED' : 'DRY RUN — no writes'}${c.reset}`);
  console.log(`${c.grey}source     ${c.reset}${source.name}`);
  console.log(`${c.grey}sheet rows ${c.reset}${source.rows.length}`);
  console.log(`${c.grey}db rows    ${c.reset}${existingCount}`);
  line();

  console.log(`${c.green}  inserted        ${String(plan.inserts.length).padStart(4)}${c.reset}${applied ? '' : c.dim + '  (would insert)' + c.reset}`);
  console.log(`${c.cyan}  updated         ${String(plan.updates.length).padStart(4)}${c.reset}${applied ? '' : c.dim + '  (would update)' + c.reset}`);
  console.log(`${c.grey}  unchanged       ${String(plan.unchanged.length).padStart(4)}${c.reset}`);
  console.log(`${c.yellow}  skipped (dupe)  ${String(skippedDupes.length).padStart(4)}${c.reset}`);
  console.log(`${c.yellow}  missing ident.  ${String(skippedMissing.length).padStart(4)}${c.reset}`);
  console.log(`${c.red}  errors          ${String(results?.errors.length ?? 0).padStart(4)}${c.reset}`);

  if (plan.inserts.length) {
    console.log(`\n${c.green}${c.bold}NEW GUESTS${c.reset}`);
    bullets(plan.inserts, i =>
      `${c.grey}row ${String(i.rowNumber).padEnd(4)}${c.reset}${i.label}` +
      c.grey + (i.identifiers.email ? `  <${i.identifiers.email}>`
              : i.identifiers.phone ? `  ${i.identifiers.phone}`
              : `  key=${i.identifiers.sheetKey}`) + c.reset);
  }

  if (plan.updates.length) {
    console.log(`\n${c.cyan}${c.bold}UPDATED${c.reset}`);
    bullets(plan.updates, i =>
      `${c.grey}row ${String(i.rowNumber).padEnd(4)}${c.reset}${i.label}\n` +
      `${c.grey}         via ${i.via} · ${describeChanges(i.changes)}${c.reset}`);
  }

  if (skippedDupes.length) {
    console.log(`\n${c.yellow}${c.bold}DUPLICATE ROWS SKIPPED${c.reset}`);
    bullets(skippedDupes, i => `${c.grey}row ${String(i.rowNumber).padEnd(4)}${c.reset}${i.label} ${c.grey}${i.detail}${c.reset}`);
  }

  if (skippedMissing.length) {
    console.log(`\n${c.yellow}${c.bold}MISSING IDENTIFIERS${c.reset} ${c.grey}(no email, phone or name)${c.reset}`);
    bullets(skippedMissing, i => `${c.grey}row ${String(i.rowNumber).padEnd(4)}${c.reset}${i.label}`);
  }

  if (plan.warnings.length) {
    console.log(`\n${c.yellow}${c.bold}WARNINGS${c.reset}`);
    bullets(plan.warnings, w => `${c.grey}row ${String(w.rowNumber).padEnd(4)}${c.reset}${w.label} ${c.grey}— ${w.message}${c.reset}`);
  }

  if (results?.errors.length) {
    console.log(`\n${c.red}${c.bold}ERRORS${c.reset}`);
    bullets(results.errors, e => `${c.grey}row ${String(e.rowNumber).padEnd(4)}${c.reset}${e.label} ${c.red}${e.op}: ${e.message}${c.reset}`, 50);
  }

  line();
  if (!applied) {
    console.log(`${c.dim}Nothing was written. Re-run with ${c.reset}${c.bold}--apply${c.reset}${c.dim} to commit these changes.${c.reset}`);
    line();
  }
}

/** Persists the full report as JSON — untruncated, for auditing. */
export function writeLog({ source, plan, results, applied }) {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(LOG_DIR, `sync-${stamp}${applied ? '' : '-dryrun'}.json`);

  const payload = {
    timestamp: new Date().toISOString(),
    applied,
    source: source.name,
    counts: {
      sheetRows:         source.rows.length,
      inserted:          plan.inserts.length,
      updated:           plan.updates.length,
      unchanged:         plan.unchanged.length,
      skippedDuplicate:  plan.skipped.filter(s => s.reason === 'duplicate-in-sheet').length,
      skippedNoIdentity: plan.skipped.filter(s => s.reason === 'missing-identifier').length,
      errors:            results?.errors.length ?? 0,
    },
    inserts:  plan.inserts.map(i => ({ rowNumber: i.rowNumber, label: i.label, id: i.id ?? null, record: i.record })),
    updates:  plan.updates.map(i => ({ rowNumber: i.rowNumber, label: i.label, id: i.id, via: i.via, changes: i.changes })),
    skipped:  plan.skipped,
    warnings: plan.warnings,
    errors:   results?.errors ?? [],
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}
