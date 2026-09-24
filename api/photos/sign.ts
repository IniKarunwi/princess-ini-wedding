/**
 * POST /api/photos/sign
 *
 * "May I upload this one photograph, and where do I put it?"
 *
 * The only server route the guest camera has. It authorises a single object
 * write and returns a URL good for that object alone. There is deliberately
 * no companion route to list, read, or delete: a guest cannot see their own
 * photograph after sending it, let alone anyone else's, and the absence of
 * those endpoints is the mechanism rather than an omission.
 *
 * The photograph itself does not come through here — see api/_lib/photos.ts.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readStorageEnv } from '../_lib/env.js';
import { clientIp, fail, json, methodIs, rateLimit } from '../_lib/http.js';
import {
  MAX_BYTES, SIGNED_URL_TTL_SECONDS,
  objectPath, recordPhoto, signUpload, validateSignRequest,
} from '../_lib/photos.js';

/**
 * Forty authorisations per address per ten minutes.
 *
 * Sized for the room, not for a lock. A whole table sharing one hotspot might
 * legitimately send a couple of dozen photographs in an evening; a script
 * hammering the endpoint will not get far. It is the same in-memory limiter
 * the planner login uses, with the same honest caveat: Vercel may run several
 * instances, so the real ceiling is (instances × 40). That is a fine trade
 * for a private wedding and a bad one for a public service.
 */
const PHOTO_LIMIT = 40;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodIs(req, res, 'POST')) return;

  const gate = rateLimit(`photos:${clientIp(req)}`, PHOTO_LIMIT);
  if (!gate.allowed) {
    res.setHeader('retry-after', String(gate.retryAfter));
    return json(res, 429, {
      error: 'rate_limited',
      detail: 'That is a lot of photos at once — give it a minute and try again.',
      retryAfter: gate.retryAfter,
    });
  }

  // Vercel parses a JSON body for us; the local harness and a malformed
  // content-type both leave a string behind, so accept either.
  let raw: unknown = req.body;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }

  const check = validateSignRequest(raw);
  if (!check.ok) {
    return json(res, check.status, { error: check.error, detail: check.detail });
  }
  const { sessionId, contentType, bytes, width, height } = check.value;

  try {
    const env = readStorageEnv();
    const path = objectPath(sessionId, contentType);

    /*
     * Both at once.
     *
     * These were sequential, and the guest paid for it: the browser could not
     * begin uploading until a metadata row had been written that nothing reads
     * during the wedding. Measured against a 90ms round trip, that put 215ms
     * in front of every photograph where 90ms would do.
     *
     * They are genuinely independent — `path` is generated here, locally, and
     * neither call needs the other's answer — so the only thing sequencing
     * bought was the order they failed in.
     *
     * ── The failure behaviour is deliberately unchanged ───────────────────
     * Promise.all rejects on the first failure, so if EITHER call fails this
     * still throws and the guest still gets an error, exactly as before.
     * Nothing has been uploaded at that point either way: the browser has no
     * URL, and without a URL there is no way to write to the bucket.
     *
     * What differs is only which side effect may already have happened when
     * the other fails — a signed URL nobody will use, or a row with no object
     * behind it. Both were already possible before this change (a row with no
     * object is the documented consequence of recording at sign time), both
     * are inert, and neither is visible to a guest.
     */
    const [signed] = await Promise.all([
      signUpload(env, path),
      recordPhoto(env, { sessionId, path, bytes, width, height }),
    ]);

    return json(res, 200, {
      uploadUrl: signed.uploadUrl,
      path: signed.path,
      contentType,
      maxBytes: MAX_BYTES,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  } catch (e) {
    // fail() reports the upstream status and PostgREST/Storage error code,
    // neither of which contains the service-role key — it travels in a
    // request header and is never echoed in an error body.
    return fail(res, e, 'photos');
  }
}
