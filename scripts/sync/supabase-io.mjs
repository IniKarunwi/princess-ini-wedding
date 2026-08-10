/**
 * Supabase I/O for the Node runner.
 *
 * Split out from engine.mjs so that engine/transform/matcher/normalize/config
 * remain a PURE core — no Node APIs, no supabase-js — and can therefore be
 * bundled verbatim into Google Apps Script. Apps Script supplies its own
 * implementations of these two functions using UrlFetchApp.
 */

import { TABLE } from './config.mjs';

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
