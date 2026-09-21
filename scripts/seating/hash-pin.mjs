/**
 * Produces the two secrets the planner API needs.
 *
 *   node scripts/seating/hash-pin.mjs 2530
 *
 * Prints PLANNER_PIN_HASH and a fresh PLANNER_SESSION_SECRET. Paste both into
 * Vercel → Settings → Environment Variables. Neither belongs in this repo,
 * in a chat, or anywhere a browser can reach — the PIN itself is never stored
 * anywhere, only its scrypt hash.
 *
 * Re-running changes the salt, so the hash differs every time. That is normal
 * and both hashes verify the same PIN.
 */

import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

const pin = process.argv[2];
if (!pin) {
  console.error('usage: node scripts/seating/hash-pin.mjs <pin>');
  process.exit(1);
}

const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const key = await scrypt(pin, salt, 32, { N, r, p });

console.log(`PLANNER_PIN_HASH=${['scrypt', N, r, p,
  salt.toString('base64url'), key.toString('base64url')].join('$')}`);
console.log(`PLANNER_SESSION_SECRET=${randomBytes(32).toString('base64url')}`);
