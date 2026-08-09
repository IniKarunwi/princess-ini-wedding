/**
 * Sync engine.
 *
 * Plans first, writes second. The plan is a pure function of (source rows,
 * database rows), which is what makes --dry-run a truthful preview of what
 * --apply would do.
 */

import { TABLE } from './config.mjs';
import { transformRow } from './transform.mjs';
import { buildIndex, findMatch, indexNew, diffRecord } from './matcher.mjs';

/** Pulls every existing row, paging past PostgREST's response cap. */
export async function fetchExisting(supabase) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read ${TABLE}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

/**
 * Builds the change plan. Performs no writes.
 *
 * @returns {{ inserts: [], updates: [], unchanged: [], skipped: [], warnings: [], normalizations: [] }}
 */
export function planSync(source, existingRows) {
  const index = buildIndex(existingRows);
  const seen = new Map();          // identity → first sheet row that claimed it

  const plan = { inserts: [], updates: [], unchanged: [], skipped: [], warnings: [], normalizations: [] };

  for (const sourceRow of source.rows) {
    const { rowNumber, record, identifiers, sheetId, warnings, normalizations } =
      transformRow(sourceRow, source.headers);

    const label = record.full_name || `row ${rowNumber}`;
    for (const message of warnings) {
      plan.warnings.push({ rowNumber, label, message });
    }
    for (const message of normalizations) {
      plan.normalizations.push({ rowNumber, label, message });
    }

    // No usable identity at all — cannot be matched or de-duplicated.
    if (!identifiers.email && !identifiers.phone && !identifiers.sheetKey) {
      plan.skipped.push({ rowNumber, label, reason: 'missing-identifier' });
      continue;
    }

    // Same person twice inside one sheet — first occurrence wins.
    const identity = identifiers.email || identifiers.phone || identifiers.sheetKey;
    if (seen.has(identity)) {
      plan.skipped.push({
        rowNumber, label,
        reason: 'duplicate-in-sheet',
        detail: `identity "${identity}" already used by row ${seen.get(identity)}`,
      });
      continue;
    }
    seen.set(identity, rowNumber);

    const { row: match, via } = findMatch(index, identifiers);

    if (!match) {
      plan.inserts.push({ rowNumber, label, record, identifiers });
      // Let subsequent rows in this run match the row we're about to create.
      indexNew(index, identifiers, { ...record, __pending: true });
      continue;
    }

    // The sheet carries the database id; a mismatch means the identity columns
    // disagree with it. Worth surfacing — the row is still matched on identity.
    if (sheetId && match.id && sheetId !== match.id) {
      plan.warnings.push({
        rowNumber, label,
        message: `sheet id ${sheetId} but matched existing row ${match.id} via ${via}`,
      });
    }

    const changes = diffRecord(match, record);
    if (Object.keys(changes).length === 0) {
      plan.unchanged.push({ rowNumber, label, id: match.id });
    } else {
      plan.updates.push({ rowNumber, label, id: match.id, via, changes, before: match });
    }
  }

  return plan;
}

/** Executes the plan. Returns per-operation outcomes, including failures. */
export async function applyPlan(supabase, plan) {
  const results = { inserted: 0, updated: 0, errors: [] };

  for (const item of plan.inserts) {
    const { error, data } = await supabase
      .from(TABLE).insert(item.record).select('id').single();

    if (error) {
      results.errors.push({ op: 'insert', rowNumber: item.rowNumber, label: item.label, message: error.message });
    } else {
      results.inserted++;
      item.id = data?.id;
    }
  }

  for (const item of plan.updates) {
    const { error } = await supabase
      .from(TABLE).update(item.changes).eq('id', item.id);

    if (error) {
      results.errors.push({ op: 'update', rowNumber: item.rowNumber, label: item.label, message: error.message });
    } else {
      results.updated++;
    }
  }

  return results;
}
