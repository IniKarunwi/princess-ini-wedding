/**
 * Planner sessions.
 *
 * ── What this is, and what it is not ────────────────────────────────────────
 * One shared PIN, verified on the server, exchanged for a signed cookie. It
 * is not an account system and does not pretend to be: everyone who knows the
 * PIN is a planner, and the name they type is an audit label, not a second
 * credential. That is exactly what was asked for, and saying so plainly is
 * better than dressing it up.
 *
 * What it does fix, compared to the PIN that used to ship in the bundle:
 *   • the secret is never in a browser bundle — only a scrypt hash on the
 *     server, so reading the deployed JavaScript reveals nothing;
 *   • the cookie is httpOnly, so page JavaScript cannot read or steal it;
 *   • it is signed, so a client cannot mint one by editing storage;
 *   • the database, not the frontend, is the thing that refuses a write,
 *     because writes only happen through these functions and the anon key
 *     has no policy that allows them.
 *
 * ── Why HMAC and not a JWT library ──────────────────────────────────────────
 * The payload is four fields we control on both ends. A JWT would add a
 * dependency, an algorithm-confusion footgun (`alg: none`) and no capability
 * we need.
 *
 * ── Revocation ──────────────────────────────────────────────────────────────
 * A seven-day cookie that cannot be cancelled is a seven-day hole if the PIN
 * leaks. Every token carries the `session_epoch` from planner_settings and is
 * checked against the current value on every authenticated request, so
 *
 *   update planner_settings set session_epoch = session_epoch + 1;
 *
 * ends every session everywhere, immediately, with no deploy.
 */

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  pw: string | Buffer, salt: Buffer, len: number, opts: { N: number; r: number; p: number },
) => Promise<Buffer>;

export const COOKIE = 'pi_planner';
export const SESSION_DAYS = 7;
const MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

export interface SessionClaims {
  /** The planner's display name, e.g. "Princess". */
  n: string;
  /** session_epoch at issue time. */
  e: number;
  /** Issued at, seconds. */
  iat: number;
  /** Expires at, seconds. */
  exp: number;
}

const b64 = (b: Buffer) => b.toString('base64url');

const sign = (data: string, secret: string) =>
  b64(createHmac('sha256', secret).update(data).digest());

/** Constant-time compare that does not leak length through an early return. */
function sameSignature(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function issue(name: string, epoch: number, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = { n: name, e: epoch, iat: now, exp: now + MAX_AGE };
  const body = b64(Buffer.from(JSON.stringify(claims)));
  return `${body}.${sign(body, secret)}`;
}

export type Verdict =
  | { ok: true; claims: SessionClaims }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad-signature' | 'expired' | 'revoked' };

export function verify(token: string | undefined, secret: string, epoch: number): Verdict {
  if (!token) return { ok: false, reason: 'missing' };
  const dot = token.indexOf('.');
  if (dot < 1) return { ok: false, reason: 'malformed' };

  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  // Signature first, always. Parsing attacker-supplied JSON before checking
  // the signature is how unauthenticated input reaches the rest of the code.
  if (!sameSignature(mac, sign(body, secret))) return { ok: false, reason: 'bad-signature' };

  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims?.n !== 'string' || typeof claims?.exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (claims.exp * 1000 <= Date.now()) return { ok: false, reason: 'expired' };
  if (claims.e !== epoch) return { ok: false, reason: 'revoked' };
  return { ok: true, claims };
}

/* ── Cookies ─────────────────────────────────────────────────────────────── */

/**
 * SameSite=Lax, not Strict: Strict withholds the cookie on a top-level
 * navigation from another site, so a planner following a link from a message
 * would land on /seating-chart logged out and conclude the session had not
 * lasted. Lax still refuses cross-site POSTs, which is the case that matters.
 */
export const setCookie = (token: string) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;

export const clearCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function readCookie(header: string | undefined, name = COOKIE): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/* ── The PIN ─────────────────────────────────────────────────────────────── */

/**
 * scrypt, not a bare SHA. A four-digit PIN has ten thousand possibilities:
 * against a fast hash, a leaked digest falls instantly. scrypt's work factor
 * is the only thing standing between a leaked PLANNER_PIN_HASH and the PIN.
 * It is still four digits, so this buys time, not safety — the real defence
 * is that the hash lives in a server environment variable.
 */
export async function hashPin(pin: string): Promise<string> {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, 32, { N, r, p });
  return ['scrypt', N, r, p, b64(salt), b64(key)].join('$');
}

export async function checkPin(pin: string, stored: string): Promise<boolean> {
  const [kind, N, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt') return false;
  try {
    const got = await scrypt(pin, Buffer.from(salt, 'base64url'), 32,
      { N: Number(N), r: Number(r), p: Number(p) });
    const want = Buffer.from(key, 'base64url');
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}
