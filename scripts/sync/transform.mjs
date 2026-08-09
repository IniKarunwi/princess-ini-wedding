/**
 * Sheet row → database record.
 *
 * Two jobs: apply the declared field map, and expand the tier columns
 * (`main`, `plus`) into a tier + a derived status.
 */

import {
  FIELD_MAP, TIER_MAP, TIERS, REJECTION_VALUES, TIER_ALIASES,
  STATUS_EQUIVALENTS, PROTECTED_COLUMNS, IMMUTABLE_COLUMNS,
} from './config.mjs';
import { applyTransform, text, email, phone, upper, sheetKey } from './normalize.mjs';

/** Case-insensitive header lookup, so "Email" and "email" both resolve. */
function pick(values, header) {
  if (header in values) return values[header];
  const hit = Object.keys(values).find(k => k.toLowerCase().trim() === header.toLowerCase());
  return hit ? values[hit] : undefined;
}

/**
 * Expands one tier cell into { tier, status }.
 *
 *   blank                    → { tier: null, status: 'PENDING'  }
 *   REJECTED / DECLINED / NO → { tier: null, status: 'REJECTED' }
 *   JOINING / RECEPTION / …  → { tier: <TIER>, status: 'APPROVED' }
 *   anything else            → { tier: <as written>, status: 'APPROVED', unknown: true }
 *
 * Unknown values are preserved rather than discarded, and surfaced in the
 * report so a typo in the sheet is visible instead of silently dropped.
 */
export function deriveTier(rawValue) {
  const value = upper(rawValue);
  if (!value) return { tier: null, status: 'PENDING', unknown: false };

  const canonical = TIER_ALIASES[value] || value;

  if (REJECTION_VALUES.includes(canonical)) {
    return { tier: null, status: 'REJECTED', unknown: false };
  }
  if (TIERS.includes(canonical)) {
    return { tier: canonical, status: 'APPROVED', unknown: false };
  }
  return { tier: canonical, status: 'APPROVED', unknown: true };
}

/**
 * @returns {{
 *   rowNumber: number,
 *   record: Record<string, any>,
 *   identifiers: { email: string|null, phone: string|null, sheetKey: string|null },
 *   sheetId: string|null,
 *   warnings: string[],
 * }}
 */
export function transformRow(sourceRow, presentHeaders) {
  const { rowNumber, values } = sourceRow;
  const record = {};
  const warnings = [];

  // Columns whose null is a computed fact ("not approved") rather than absence
  // of information. These survive the blank-stripping pass below; without that
  // distinction a guest moving JOINING → REJECTED would keep a stale tier.
  const explicitNulls = new Set();

  // 1. Declared field mappings.
  for (const [header, { column, transform }] of Object.entries(FIELD_MAP)) {
    const raw = pick(values, header);
    if (raw === undefined) continue;               // column absent from sheet
    record[column] = applyTransform(transform, raw);
  }

  // 2. Tier columns → tier + derived status.
  for (const [header, { tierColumn, statusColumn }] of Object.entries(TIER_MAP)) {
    const raw = pick(values, header);
    if (raw === undefined) continue;

    const { tier, status, unknown } = deriveTier(raw);
    if (unknown) {
      warnings.push(`unrecognised "${header}" value ${JSON.stringify(String(raw).trim())} — imported as-is`);
    }
    record[tierColumn] = tier;
    explicitNulls.add(tierColumn);
    explicitNulls.add(statusColumn);

    // An explicitly-mapped status column in the sheet is authoritative; the
    // derived value only fills the gap when the sheet leaves it blank. This
    // matters for plus_one_status, which exists both as its own column and as
    // a derivation of `plus`.
    const explicit = record[statusColumn];
    if (explicit === undefined || explicit === null) {
      record[statusColumn] = status;
    } else if (status !== 'PENDING') {
      // Compare meanings, not spellings: ACCEPTED and APPROVED agree.
      const a = STATUS_EQUIVALENTS[explicit] || explicit;
      const b = STATUS_EQUIVALENTS[status] || status;
      if (a !== b) {
        warnings.push(`"${header}"→${status} contradicts ${statusColumn}=${explicit} — kept ${explicit}`);
      }
    }
  }

  // 3. Identity.
  const identifiers = {
    email:    email(pick(values, 'email')),
    phone:    phone(pick(values, 'phone')),
    sheetKey: sheetKey(pick(values, 'full_name')),
  };
  record.sheet_key = identifiers.sheetKey;

  // 4. Guard rails.
  //    Protected columns are writable only when the sheet genuinely carries
  //    them, so a sync can never wipe messaging state it knows nothing about.
  for (const column of PROTECTED_COLUMNS) {
    const inSheet = presentHeaders.some(h => h.toLowerCase().trim() === column);
    if (!inSheet) delete record[column];
  }
  for (const column of IMMUTABLE_COLUMNS) delete record[column];

  // Drop keys the sheet left blank so a partially-filled row never nulls out
  // data already in the database — except the computed tier/status columns,
  // where null is the answer rather than the absence of one.
  for (const [k, v] of Object.entries(record)) {
    if ((v === null || v === undefined) && !explicitNulls.has(k)) delete record[k];
  }

  return {
    rowNumber,
    record,
    identifiers,
    sheetId: text(pick(values, 'id')),
    warnings,
  };
}
