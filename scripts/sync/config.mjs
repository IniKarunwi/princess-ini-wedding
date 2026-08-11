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
 * Messaging columns — retired from rsvps by migration 0006.
 *
 * Delivery state now lives in message_queue, which is the single source of
 * truth for sending, retries and history; per-guest status is read from the
 * guest_delivery_status view. These names are kept here so that a stray
 * column of the same name appearing in the planning sheet is still stripped
 * rather than being sent to a table that no longer has it.
 *
 * Nothing here is ever written, regardless of the sheet — see
 * IMMUTABLE_COLUMNS, which now includes them.
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
  'id',              // row identity belongs to the database
  'created_at',      // original submission time is historical fact
  'guest_count',     // computed by Supabase from the approval columns; see
                     // supabase/migrations/0002_guest_count.sql. The spreadsheet
                     // decides invitations, not seat counts.
  'seat_allocation', // GENERATED column derived from guest_count (0003).
                     // Postgres rejects writes to it outright; listing it here
                     // means a stray sheet column can never trigger that error.
  // Retired from rsvps by 0006. Messaging is enqueued into message_queue and
  // never written here, so these are unconditionally immutable — the sheet
  // cannot reintroduce them even by carrying a column of the same name.
  'email_status',
  'whatsapp_status',
  'last_email_sent',
  'last_whatsapp_sent',
];

/** Default country calling code used to normalise local phone numbers. */
export const DEFAULT_COUNTRY_CODE = '234'; // Nigeria
