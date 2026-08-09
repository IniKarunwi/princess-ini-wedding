/**
 * Match resolution.
 *
 * Resolution order — email, then phone, then sheet_key — is what makes the
 * sync idempotent and what lets a name-only guest later gain an email without
 * splitting into two records: the sheet_key still points at the existing row.
 */

import { email as normEmail, phone as normPhone } from './normalize.mjs';

/** Builds lookup indexes over the rows currently in the database. */
export function buildIndex(existingRows) {
  const byEmail = new Map();
  const byPhone = new Map();
  const bySheetKey = new Map();

  for (const row of existingRows) {
    const e = normEmail(row.email);
    const p = normPhone(row.phone);
    const k = row.sheet_key ? String(row.sheet_key).trim() : null;

    if (e && !byEmail.has(e)) byEmail.set(e, row);
    if (p && !byPhone.has(p)) byPhone.set(p, row);
    if (k && !bySheetKey.has(k)) bySheetKey.set(k, row);
  }

  return { byEmail, byPhone, bySheetKey };
}

/**
 * @returns {{ row: object|null, via: 'email'|'phone'|'sheet_key'|null }}
 */
export function findMatch(index, identifiers) {
  const { email, phone, sheetKey } = identifiers;

  if (email) {
    const hit = index.byEmail.get(email);
    if (hit) return { row: hit, via: 'email' };
  }
  if (phone) {
    const hit = index.byPhone.get(phone);
    if (hit) return { row: hit, via: 'phone' };
  }
  if (sheetKey) {
    const hit = index.bySheetKey.get(sheetKey);
    if (hit) return { row: hit, via: 'sheet_key' };
  }
  return { row: null, via: null };
}

/**
 * Registers a freshly-inserted record so later rows in the same run can match
 * against it. Without this, two sheet rows for the same person inside one run
 * would both insert.
 */
export function indexNew(index, identifiers, row) {
  if (identifiers.email && !index.byEmail.has(identifiers.email)) {
    index.byEmail.set(identifiers.email, row);
  }
  if (identifiers.phone && !index.byPhone.has(identifiers.phone)) {
    index.byPhone.set(identifiers.phone, row);
  }
  if (identifiers.sheetKey && !index.bySheetKey.has(identifiers.sheetKey)) {
    index.bySheetKey.set(identifiers.sheetKey, row);
  }
}

/**
 * Fields that actually differ between the sheet record and the database row.
 * Returning an empty object means "nothing to do" — the basis of a clean
 * no-op re-run.
 */
export function diffRecord(existing, incoming) {
  const changes = {};
  for (const [key, next] of Object.entries(incoming)) {
    const current = existing[key];

    const a = current === undefined ? null : current;
    const b = next === undefined ? null : next;

    if (a === null && b === null) continue;
    if (typeof a === 'string' && typeof b === 'string') {
      if (a.trim() === b.trim()) continue;
    } else if (a === b) {
      continue;
    } else if (a !== null && b !== null && String(a) === String(b)) {
      continue;                                   // 1 vs "1", true vs "true"
    }
    changes[key] = b;
  }
  return changes;
}
