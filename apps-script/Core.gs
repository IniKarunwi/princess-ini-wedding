/**
 * Core.gs — GENERATED FILE, DO NOT EDIT
 *
 * Built from scripts/sync/{config.mjs, normalize.mjs, transform.mjs, matcher.mjs, engine.mjs}
 * by scripts/sync/build-appsscript.mjs.
 *
 * Edit the source modules and re-run:  npm run build:appsscript
 *
 * This is the same normalisation, mapping, tier derivation, matching and
 * planning logic the Node runner uses — not a reimplementation. Anything
 * changed here is lost on the next build.
 *
 * Generated: 2026-08-11T17:05:42.302Z
 */


// ==========================================================================
// config.mjs
// ==========================================================================

/**
 * Sync configuration — the single place to edit when the spreadsheet changes.
 *
 * Nothing else in the pipeline hard-codes a sheet column name. If the planning
 * sheet gains a column, add it here and the engine picks it up.
 */

var TABLE = 'rsvps';

/**
 * Direct sheet-column → database-column mappings.
 * Key   = header text in the spreadsheet (case-insensitive, trimmed)
 * Value = { column, transform }  — transform is applied to the raw cell value.
 */
var FIELD_MAP = {
  full_name:             { column: 'full_name',             transform: 'text' },
  email:                 { column: 'email',                 transform: 'email' },
  phone:                 { column: 'phone',                 transform: 'phone' },
  attending:             { column: 'attending',             transform: 'boolean' },
  plus_one_requested:    { column: 'plus_one_requested',    transform: 'boolean' },
  plus_one_name:         { column: 'plus_one_name',         transform: 'text' },
  plus_one_relationship: { column: 'plus_one_relationship', transform: 'text' },
  plus_one_status:       { column: 'plus_one_status',       transform: 'upper' },
};

/**
 * Tier columns. Each expands into TWO database columns:
 *   <tierColumn>   — which part of the event the guest is approved for
 *   <statusColumn> — derived APPROVED / REJECTED / PENDING
 *
 * See transform.mjs → deriveTier().
 */
var TIER_MAP = {
  main: { tierColumn: 'approved_for',          statusColumn: 'main_invite_status' },
  plus: { tierColumn: 'plus_one_approved_for', statusColumn: 'plus_one_status'    },
};

/** Recognised tiers. Anything else is reported as an unknown value. */
var TIERS = ['JOINING', 'RECEPTION', 'AFTERPARTY'];

/**
 * Status vocabularies that mean the same thing.
 *
 * The sheet writes "ACCEPTED" in plus_one_status while the tier column derives
 * "APPROVED"; those agree. Only genuine contradictions — say plus_one_status
 * REJECTED against a plus tier of JOINING — should be reported.
 */
var STATUS_EQUIVALENTS = {
  ACCEPTED: 'APPROVED',
  APPROVED: 'APPROVED',
  CONFIRMED: 'APPROVED',
  YES: 'APPROVED',
  REJECTED: 'REJECTED',
  DECLINED: 'REJECTED',
  NO: 'REJECTED',
  PENDING: 'PENDING',
};

/** Tier-column values that mean "not approved" rather than naming a tier. */
var REJECTION_VALUES = ['REJECTED', 'DECLINED', 'NO'];

/**
 * Canonicalises messy tier spellings seen in the sheet.
 * Keys are already uppercased and whitespace-collapsed before lookup.
 */
var TIER_ALIASES = {
  'AFTER PARTY': 'AFTERPARTY',
  'AFTER-PARTY': 'AFTERPARTY',
  'CEREMONY': 'JOINING',
};

/**
 * PHASE 3 — messaging-automation columns.
 *
 * These belong to the future email/WhatsApp automation, NOT to the spreadsheet.
 * The engine refuses to write them unless the column is physically present in
 * the source sheet, so a sync can never clobber delivery state.
 */
var PROTECTED_COLUMNS = [
  'email_status',
  'whatsapp_status',
  'last_email_sent',
  'last_whatsapp_sent',
];

/**
 * Never written by the sync under any circumstance.
 *   id         — preserved; the database owns row identity
 *   created_at — preserved; original submission time is historical fact
 */
var IMMUTABLE_COLUMNS = [
  'id',              // row identity belongs to the database
  'created_at',      // original submission time is historical fact
  'guest_count',     // computed by Supabase from the approval columns; see
                     // supabase/migrations/0002_guest_count.sql. The spreadsheet
                     // decides invitations, not seat counts.
  'seat_allocation', // GENERATED column derived from guest_count (0003).
                     // Postgres rejects writes to it outright; listing it here
                     // means a stray sheet column can never trigger that error.
];

/** Default country calling code used to normalise local phone numbers. */
var DEFAULT_COUNTRY_CODE = '234'; // Nigeria


// ==========================================================================
// normalize.mjs
// ==========================================================================

/**
 * Value normalisation.
 *
 * Every comparison the engine makes runs on normalised values, so cosmetic
 * differences between the sheet and the database ("  Joy  " vs "Joy",
 * "after party" vs "AFTERPARTY", "0803…" vs "+234803…") never register as a
 * change. That is what keeps repeat runs idempotent.
 */


var isBlank = v => v === null || v === undefined || String(v).trim() === '';

/** Trimmed text, or null when empty. */
function text(v) {
  if (isBlank(v)) return null;
  return String(v).trim().replace(/\s+/g, ' ');
}

/** Lower-cased, trimmed email. */
function email(v) {
  const t = text(v);
  return t ? t.toLowerCase() : null;
}

/** Upper-cased, whitespace-collapsed token. */
function upper(v) {
  const t = text(v);
  return t ? t.toUpperCase() : null;
}

/**
 * Phone → E.164.
 *
 * The sheet holds a mix of "+2348…", "08…", "234…" and bare "80…" locals.
 * Without this, the same person written two ways would look like two people.
 * Numbers already carrying a non-default country code are left intact.
 */
function phone(v) {
  if (isBlank(v)) return null;

  const raw = String(v).trim();
  const hadPlus = raw.startsWith('+');
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;

  // Explicit international number that isn't ours — keep as-is.
  if (hadPlus && !digits.startsWith(DEFAULT_COUNTRY_CODE)) return `+${digits}`;

  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    digits = digits.slice(DEFAULT_COUNTRY_CODE.length);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (!digits) return null;
  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}

/** Tolerant boolean: accepts true/false, "TRUE"/"yes"/"y"/"1". */
function boolean(v) {
  if (isBlank(v)) return null;
  if (typeof v === 'boolean') return v;
  const t = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(t)) return true;
  if (['false', 'no', 'n', '0'].includes(t)) return false;
  return null;
}

/** Integer, or null when absent/unparseable. */
function integer(v) {
  if (isBlank(v)) return null;
  const n = Number.parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stable synthetic identifier for guests with no email and no phone.
 *
 * Derived from the name alone, so the same sheet row resolves to the same key
 * on every run. Once such a guest is given an email or phone in the sheet, the
 * matcher still finds the existing record via this key and updates it in place
 * rather than inserting a duplicate.
 */
function sheetKey(fullName) {
  const t = text(fullName);
  if (!t) return null;
  const slug = t
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z0-9]+/g, '-')                      // punctuation → hyphen
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

var TRANSFORMS = { text, email, upper, phone, boolean, integer };

/** Applies a named transform from the field map. */
function applyTransform(name, value) {
  const fn = TRANSFORMS[name];
  if (!fn) throw new Error(`Unknown transform: ${name}`);
  return fn(value);
}


// ==========================================================================
// transform.mjs
// ==========================================================================

/**
 * Sheet row → database record.
 *
 * Two jobs: apply the declared field map, and expand the tier columns
 * (`main`, `plus`) into a tier + a derived status.
 */


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
function deriveTier(rawValue) {
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
 *   normalizations: string[],
 * }}
 */
function transformRow(sourceRow, presentHeaders) {
  const { rowNumber, values } = sourceRow;
  const record = {};
  const warnings = [];
  const normalizations = [];

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

    // Reconcile the derived status against a status column the sheet owns
    // (plus_one_status exists both ways). Meanings are compared, not
    // spellings — ACCEPTED and APPROVED agree.
    const explicit = record[statusColumn];
    const explicitMeaning = explicit ? (STATUS_EQUIVALENTS[explicit] || explicit) : null;

    if (explicit === undefined || explicit === null) {
      record[statusColumn] = status;
    } else if (tier && explicitMeaning === 'PENDING') {
      // An assigned tier IS the approval. A tier alongside a pending status
      // means the decision was made but the status cell was never updated,
      // so promote it. Reported as a normalisation, not a problem.
      record[statusColumn] = 'APPROVED';
      normalizations.push(
        `${statusColumn}: ${explicit} → APPROVED (tier "${header}"=${tier} is an approval)`
      );
    } else if (status !== 'PENDING' && explicitMeaning !== status) {
      // Genuine disagreement — e.g. REJECTED against an assigned tier.
      warnings.push(`"${header}"→${status} contradicts ${statusColumn}=${explicit} — kept ${explicit}`);
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
    normalizations,
  };
}


// ==========================================================================
// matcher.mjs
// ==========================================================================

// Import aliases from matcher.mjs, preserved so bundled code resolves them.
var normEmail = email;
var normPhone = phone;

/**
 * Match resolution.
 *
 * Resolution order — email, then phone, then sheet_key — is what makes the
 * sync idempotent and what lets a name-only guest later gain an email without
 * splitting into two records: the sheet_key still points at the existing row.
 */


/** Builds lookup indexes over the rows currently in the database. */
function buildIndex(existingRows) {
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
function findMatch(index, identifiers) {
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
function indexNew(index, identifiers, row) {
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
function diffRecord(existing, incoming) {
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


// ==========================================================================
// engine.mjs
// ==========================================================================

/**
 * Sync engine — the planner.
 *
 * Plans first, writes second. The plan is a pure function of (source rows,
 * database rows), which is what makes --dry-run a truthful preview of what
 * --apply would do.
 *
 * PURE: no Node APIs, no supabase-js. Database I/O lives in supabase-io.mjs
 * so this file can be bundled verbatim into Google Apps Script.
 */


/**
 * Builds the change plan. Performs no writes.
 *
 * @returns {{ inserts: [], updates: [], unchanged: [], skipped: [], warnings: [], normalizations: [] }}
 */
function planSync(source, existingRows) {
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
