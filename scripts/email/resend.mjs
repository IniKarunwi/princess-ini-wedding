/**
 * Minimal Resend client.
 *
 * Deliberately not the `resend` npm package: this needs one endpoint, and a
 * hand-written fetch keeps the dependency surface at zero and makes the
 * retry/idempotency behaviour explicit rather than inherited.
 */

import { RATE, RETRYABLE_STATUS } from './config.mjs';

const ENDPOINT = 'https://api.resend.com/emails';

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Thrown for a rejected send. `retryable` distinguishes "the network hiccuped"
 * from "this address is invalid", which the caller uses to decide whether a
 * second attempt could possibly help.
 */
export class SendError extends Error {
  constructor(message, { status = null, retryable = false, body = null } = {}) {
    super(message);
    this.name = 'SendError';
    this.status = status;
    this.retryable = retryable;
    this.body = body;
  }
}

/** Pulls a human-readable reason out of Resend's error shapes. */
function describe(status, body) {
  const detail =
    body?.message ||
    body?.error?.message ||
    (typeof body?.error === 'string' ? body.error : null) ||
    body?.name;
  return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
}

/**
 * Sends one email. Returns Resend's message id.
 *
 * `idempotencyKey` makes a retry safe: if the first attempt actually reached
 * Resend but the response was lost, the retry returns the original message
 * rather than sending a second copy. Without it, a network timeout on a
 * successful send would double-email a guest.
 */
export async function sendEmail({
  apiKey, from, to, subject, html, text, replyTo, idempotencyKey, fetchImpl = fetch,
}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const body = JSON.stringify({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  let response;
  try {
    response = await fetchImpl(ENDPOINT, { method: 'POST', headers, body });
  } catch (cause) {
    // DNS failure, connection reset, timeout — never the address's fault.
    throw new SendError(`network error: ${cause.message}`, { retryable: true });
  }

  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* non-JSON error page */ }

  if (!response.ok) {
    throw new SendError(describe(response.status, parsed) || raw.slice(0, 300), {
      status: response.status,
      retryable: RETRYABLE_STATUS.includes(response.status),
      body: parsed ?? raw.slice(0, 300),
    });
  }

  if (!parsed?.id) {
    throw new SendError('Resend accepted the request but returned no message id', {
      status: response.status, retryable: false, body: parsed,
    });
  }
  return parsed.id;
}

/**
 * sendEmail with bounded retries for transient failures only.
 *
 * A rejected address retried three times is still rejected; retrying it just
 * slows the batch and burns rate limit. So only RETRYABLE_STATUS and network
 * errors come back for another attempt.
 */
export async function sendWithRetry(options, { onRetry } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= RATE.maxRetries + 1; attempt++) {
    try {
      return await sendEmail(options);
    } catch (err) {
      lastError = err;
      const canRetry = err instanceof SendError && err.retryable
                    && attempt <= RATE.maxRetries;
      if (!canRetry) break;

      const wait = RATE.retryBaseMs * 2 ** (attempt - 1);
      onRetry?.({ attempt, wait, message: err.message });
      await sleep(wait);
    }
  }
  throw lastError;
}
