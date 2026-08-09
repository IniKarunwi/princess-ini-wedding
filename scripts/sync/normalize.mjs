/**
 * Value normalisation.
 *
 * Every comparison the engine makes runs on normalised values, so cosmetic
 * differences between the sheet and the database ("  Joy  " vs "Joy",
 * "after party" vs "AFTERPARTY", "0803…" vs "+234803…") never register as a
 * change. That is what keeps repeat runs idempotent.
 */

import { DEFAULT_COUNTRY_CODE } from './config.mjs';

const isBlank = v => v === null || v === undefined || String(v).trim() === '';

/** Trimmed text, or null when empty. */
export function text(v) {
  if (isBlank(v)) return null;
  return String(v).trim().replace(/\s+/g, ' ');
}

/** Lower-cased, trimmed email. */
export function email(v) {
  const t = text(v);
  return t ? t.toLowerCase() : null;
}

/** Upper-cased, whitespace-collapsed token. */
export function upper(v) {
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
export function phone(v) {
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
export function boolean(v) {
  if (isBlank(v)) return null;
  if (typeof v === 'boolean') return v;
  const t = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(t)) return true;
  if (['false', 'no', 'n', '0'].includes(t)) return false;
  return null;
}

/** Integer, or null when absent/unparseable. */
export function integer(v) {
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
export function sheetKey(fullName) {
  const t = text(fullName);
  if (!t) return null;
  const slug = t
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z0-9]+/g, '-')                      // punctuation → hyphen
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

export const TRANSFORMS = { text, email, upper, phone, boolean, integer };

/** Applies a named transform from the field map. */
export function applyTransform(name, value) {
  const fn = TRANSFORMS[name];
  if (!fn) throw new Error(`Unknown transform: ${name}`);
  return fn(value);
}
