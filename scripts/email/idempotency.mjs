/**
 * Idempotency keys for the final-details campaign.
 *
 * ── What the key is for ────────────────────────────────────────────────────
 * Resend remembers a key for 24 hours. Send the same key twice and the second
 * request returns the first message instead of delivering another copy. That
 * is what makes a retry safe: if an attempt actually reached Resend but the
 * response was lost to a timeout, the retry cannot double-email a guest.
 *
 * ── Why a real send and a test send need different keys ────────────────────
 * The two are protecting against opposite things.
 *
 * For a GUEST, the key must be stable. Re-running the campaign a second time
 * by mistake — a fat-fingered command, a resumed shell, a second person at a
 * second laptop — must not put the letter in their inbox twice. So a guest's
 * key is the campaign and their address, and nothing else. It stays what it
 * has always been.
 *
 * For a TEST to your own address, stability is the bug. You send one, look at
 * it, change something, send another — that is the entire point of a test
 * send. Reusing the key means Resend sees the same key with a different body
 * and refuses:
 *
 *     HTTP 409: This idempotency key has been used with this HTTP method and
 *     endpoint within the last 24 hours, but the request body was modified
 *     and doesn't match the original request.
 *
 * Which is Resend working correctly and the key being wrong for the job. The
 * second test is not an accidental duplicate; it is a new, deliberate act.
 *
 * ── So: one key per run, for tests only ────────────────────────────────────
 * A test key carries a run id, generated once per invocation of the sender.
 * Every attempt within that one run — including sendWithRetry's retries —
 * shares it, so a lost response still cannot deliver two copies. The next
 * invocation is a new run with a new id, and sends.
 *
 * The trade is exact and worth stating: a test send is protected against a
 * dropped connection, and not against you running the command twice. Running
 * it twice is what you meant to do, and it goes to your own inbox.
 *
 * Production keys are not touched by any of this.
 */

import { randomUUID } from 'node:crypto';

/** Bump if this campaign is ever legitimately re-sent to the same people. */
export const CAMPAIGN = 'final-details-2026-09';

/**
 * A fresh run id. Called ONCE per invocation of the sender, never per message
 * — one id per message would defeat the retry protection entirely.
 */
export const newRunId = () => randomUUID().slice(0, 8);

const address = (email) => String(email ?? '').trim().toLowerCase();

/**
 * The key for one message.
 *
 *   test: false   `final-details-2026-09:someone@example.com`
 *                 stable for 24h — a re-run cannot email a guest twice
 *
 *   test: true    `final-details-2026-09:test:3f2a91bc:you@example.com`
 *                 stable within this run, new on the next one
 *
 * `runId` is required for a test key. Falling back to a generated one here
 * would quietly make every retry a new key, which is the failure this whole
 * file exists to prevent, so it is an error instead.
 */
export function idempotencyKey({ email, test = false, runId = null }) {
  if (!test) return `${CAMPAIGN}:${address(email)}`;
  if (!runId) {
    throw new Error('a test idempotency key needs a runId — see newRunId(); ' +
                    'without one, every retry would look like a new message');
  }
  return `${CAMPAIGN}:test:${runId}:${address(email)}`;
}
