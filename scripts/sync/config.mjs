/**
 * Sync configuration — the single place to edit when the spreadsheet changes.
 *
 * Nothing else in the pipeline hard-codes a sheet column name. If the planning
 * sheet gains a column, add it here and the engine picks it up.
 */

export const TABLE = 'rsvps';

/**
 * Direct sheet-column → database-column mappings.
 * Key   = header text in the spreadsheet (case-insensitive, trimmed)
 * Value = { column, transform }  — transform is applied to the raw cell value.
 */
export const FIELD_MAP = {
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
export const TIER_MAP = {
  main: { tierColumn: 'approved_for',          statusColumn: 'main_invite_status' },
  plus: { tierColumn: 'plus_one_approved_for', statusColumn: 'plus_one_status'    },
};

/** Recognised tiers. Anything else is reported as an unknown value. */
export const TIERS = ['JOINING', 'RECEPTION', 'AFTERPARTY'];

/**
 * Status vocabularies that mean the same thing.
 *
 * The sheet writes "ACCEPTED" in plus_one_status while the tier column derives
 * "APPROVED"; those agree. Only genuine contradictions — say plus_one_status
 * REJECTED against a plus tier of JOINING — should be reported.
 */
export const STATUS_EQUIVALENTS = {
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
export const REJECTION_VALUES = ['REJECTED', 'DECLINED', 'NO'];

/**
 * Canonicalises messy tier spellings seen in the sheet.
 * Keys are already uppercased and whitespace-collapsed before lookup.
 */
export const TIER_ALIASES = {
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
export const PROTECTED_COLUMNS = [
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
export const IMMUTABLE_COLUMNS = [
  'id',          // row identity belongs to the database
  'created_at',  // original submission time is historical fact
  'guest_count', // computed by Supabase from the approval columns; see
                 // supabase/migrations/0002_guest_count.sql. The spreadsheet
                 // decides invitations, not seat counts.
];

/** Default country calling code used to normalise local phone numbers. */
export const DEFAULT_COUNTRY_CODE = '234'; // Nigeria
