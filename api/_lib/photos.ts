/**
 * The guest-photos bucket, over Supabase Storage's REST API.
 *
 * ── The shape of this, and why ─────────────────────────────────────────────
 * The browser never holds a Storage credential. It asks this server for
 * permission to write ONE object, and gets back a URL that is good for that
 * one object and nothing else. It cannot choose where the object lands, it
 * cannot read anything back, and it cannot discover that any other object
 * exists.
 *
 * The photograph itself never passes through the function. Vercel caps a
 * serverless request body at roughly 4.5MB and a phone photograph can exceed
 * that, so proxying the bytes would fail on exactly the large photographs we
 * most want. The browser PUTs straight to Supabase instead.
 *
 * ── Why not the anon key ───────────────────────────────────────────────────
 * The earlier draft of 0008 gave `anon` INSERT on this bucket. That is a
 * public write endpoint: the anon key is in the JavaScript bundle by design,
 * so anyone who reads it could write objects into the couple's bucket for as
 * long as the project exists. Signed upload URLs remove the need for any
 * anonymous Storage policy at all, which is why 0008 no longer creates one.
 *
 * The service-role key is read here, server-side, and appears in no response
 * body — only in an Authorization header travelling to Supabase.
 */

import { randomUUID } from 'node:crypto';
import type { StorageEnv } from './env.js';
import { StoreError } from './store.js';

/** Created by supabase/migrations/0008_guest_photos.sql. */
export const BUCKET = 'guest-photos';
const TABLE = 'guest_photos';

/**
 * 20MB.
 *
 * The client downscales to roughly 1-2MB before it ever gets here, so this is
 * not the working size — it is the ceiling for the fallback path, where a
 * photograph the browser could not decode (an iPhone HEIC on a browser
 * without HEIC support) is sent as-is rather than being thrown away.
 *
 * Supabase enforces the same number at the bucket, so a client that lies
 * about `bytes` is refused by Storage rather than by us.
 */
export const MAX_BYTES = 20 * 1024 * 1024;

/**
 * What a guest may send.
 *
 * jpeg/png/webp are what the client's canvas re-encode produces or passes
 * through. heic/heif are here only for the fallback above; nothing in this
 * project converts them, and they are stored exactly as the phone made them.
 */
export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type AcceptedType = (typeof ACCEPTED_TYPES)[number];

const EXTENSION: Record<AcceptedType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** Rejects anything that is not the canonical form of a v4-ish UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SignRequest {
  sessionId: string;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
}

export type Validated =
  | { ok: true; value: SignRequest & { contentType: AcceptedType } }
  | { ok: false; status: number; error: string; detail: string };

/**
 * Everything the client claims, checked before anything is signed.
 *
 * `bytes` is what the client SAYS it is about to upload. It is checked here
 * so an oversized upload is refused before a URL exists, and checked again by
 * Supabase at the bucket so a client that understates it gains nothing.
 */
export function validateSignRequest(raw: unknown): Validated {
  const bad = (status: number, error: string, detail: string): Validated =>
    ({ ok: false, status, error, detail });

  if (typeof raw !== 'object' || raw === null) {
    return bad(400, 'bad_request', 'Expected a JSON object.');
  }
  const body = raw as Record<string, unknown>;

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!UUID.test(sessionId)) {
    return bad(400, 'bad_session', 'sessionId must be a UUID.');
  }

  const contentType = typeof body.contentType === 'string'
    ? body.contentType.split(';')[0].trim().toLowerCase()
    : '';
  if (!(ACCEPTED_TYPES as readonly string[]).includes(contentType)) {
    return bad(415, 'unsupported_type',
      `Only ${ACCEPTED_TYPES.join(', ')} may be uploaded.`);
  }

  const bytes = typeof body.bytes === 'number' ? body.bytes : NaN;
  if (!Number.isInteger(bytes) || bytes <= 0) {
    return bad(400, 'bad_size', 'bytes must be a positive integer.');
  }
  if (bytes > MAX_BYTES) {
    return bad(413, 'too_large',
      `That photo is larger than ${Math.round(MAX_BYTES / 1024 / 1024)}MB.`);
  }

  // Dimensions are diagnostics. A client that omits or mangles them is not
  // worth refusing an upload over.
  const dim = (v: unknown) =>
    (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 100000) ? v : undefined;

  return {
    ok: true,
    value: {
      sessionId,
      contentType: contentType as AcceptedType,
      bytes,
      width: dim(body.width),
      height: dim(body.height),
    },
  };
}

/**
 * Where the object lands.
 *
 * The object id is generated HERE, never accepted from the client, so a guest
 * cannot choose a path, cannot overwrite another guest's photograph, and
 * cannot construct a path they could later guess at. The session id groups
 * one sitting and identifies nobody — it is a random UUID minted in the
 * browser and stored nowhere else.
 */
export function objectPath(sessionId: string, contentType: AcceptedType): string {
  return `${sessionId}/${randomUUID()}.${EXTENSION[contentType]}`;
}

/**
 * Supabase's signed upload URLs currently last two hours. That is not
 * configurable on this endpoint, so it is reported rather than chosen — the
 * client uses it only to decide whether a stale URL is worth retrying.
 */
export const SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;

export interface SignedUpload {
  /** Absolute URL the browser PUTs the bytes to. */
  uploadUrl: string;
  path: string;
}

async function call(
  env: StorageEnv, where: string, url: string, init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new StoreError({
      where,
      upstreamStatus: 0,
      body: `fetch failed: ${(cause as Error)?.message ?? String(cause)}`,
      status: 502,
    });
  }
}

const auth = (env: StorageEnv) => ({
  apikey: env.serviceRoleKey,
  authorization: `Bearer ${env.serviceRoleKey}`,
  'content-type': 'application/json',
});

/**
 * Mints permission to write one object.
 *
 * The response carries a relative `url` containing a short-lived token. It is
 * returned to the browser absolute, because the browser has no other way to
 * learn the project origin — VITE_SUPABASE_URL exists, but this feature
 * deliberately does not depend on the browser knowing anything about
 * Supabase at all.
 */
export async function signUpload(
  env: StorageEnv, path: string,
): Promise<SignedUpload> {
  const where = `POST /storage/v1/object/upload/sign/${BUCKET}`;
  const res = await call(env, where,
    `${env.supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${path}`,
    { method: 'POST', headers: auth(env), body: '{}' });

  if (!res.ok) {
    throw new StoreError({
      where, upstreamStatus: res.status, body: await res.text().catch(() => ''),
    });
  }

  const body = (await res.json()) as { url?: string };
  if (!body.url) {
    throw new StoreError({
      where, upstreamStatus: 200, body: 'Storage returned no signed URL',
    });
  }

  return { uploadUrl: `${env.supabaseUrl}/storage/v1${body.url}`, path };
}

/**
 * Records that a photograph was authorised.
 *
 * Written at sign time rather than after the upload, because a confirmation
 * endpoint would be a second public route for a row nobody reads during the
 * wedding. The consequence is honest and worth stating: if a guest's upload
 * fails after signing, a row exists with no object behind it. The bucket, not
 * this table, is the list of photographs that actually arrived.
 *
 * `status` is not sent. The column defaults to 'submitted' and its CHECK
 * constraint refuses anything else a forged client might try.
 */
export async function recordPhoto(
  env: StorageEnv,
  row: { sessionId: string; path: string; bytes: number; width?: number; height?: number },
): Promise<void> {
  const where = `POST /rest/v1/${TABLE}`;
  const res = await call(env, where, `${env.supabaseUrl}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { ...auth(env), prefer: 'return=minimal' },
    body: JSON.stringify({
      session_id: row.sessionId,
      storage_path: row.path,
      bytes: row.bytes,
      width: row.width ?? null,
      height: row.height ?? null,
    }),
  });

  if (!res.ok) {
    throw new StoreError({
      where, upstreamStatus: res.status, body: await res.text().catch(() => ''),
    });
  }
}
