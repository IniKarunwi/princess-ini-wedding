/**
 * Preparing and sending one photograph.
 *
 * ── The browser never holds a Storage credential ───────────────────────────
 * It asks our own /api/photos/sign for permission to write one object and
 * gets back a URL good for that object alone. There is no Supabase key in
 * this file, anon or otherwise, and no way from here to read, list or delete
 * anything. The service-role key lives only in the Vercel function.
 *
 * ── Why the bytes go straight to Supabase ──────────────────────────────────
 * A Vercel serverless request body is capped at roughly 4.5MB. Proxying the
 * photograph through our function would therefore fail on exactly the large
 * photographs most worth keeping, so the browser PUTs to Supabase itself.
 *
 * ── Nothing persists ───────────────────────────────────────────────────────
 * The photograph lives as a Blob in memory for as long as the guest is on
 * the page. No localStorage, no IndexedDB, no offline queue. Close the tab
 * and it is gone, which is the honest behaviour for something whose only
 * destination is Princess and IniOluwa.
 */

/** Matches ACCEPTED_TYPES in api/_lib/photos.ts. */
export const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
] as const;

/**
 * Same ceiling the API and the bucket enforce. Checked here first so an
 * oversized file is refused before anything is signed or uploaded.
 */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** Long edge after downscaling. Prints past 10x8 inches; lands near 1-2MB. */
export const MAX_EDGE = 3000;
export const JPEG_QUALITY = 0.85;

export interface PreparedPhoto {
  /** Client-side id. Also the retry key — a retry re-sends the same photo. */
  id: string;
  blob: Blob;
  contentType: string;
  /** Object URL for the preview. Revoked when the photo is released. */
  previewUrl: string;
  width?: number;
  height?: number;
  /** False when the browser could not decode the file and it goes as-is. */
  processed: boolean;
}

export type PrepareResult =
  | { ok: true; photo: PreparedPhoto }
  | { ok: false; reason: string; detail?: string };

/* ── Choosing a type ──────────────────────────────────────────────────────── */

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
};

/**
 * Some browsers hand back a File with an empty `type` for a HEIC, so the
 * extension is the only evidence left. Guessing from the name is a last
 * resort and never overrides a type the browser did supply.
 */
function resolveType(file: File): string | null {
  const declared = file.type?.split(';')[0].trim().toLowerCase();
  if (declared && (ACCEPTED_TYPES as readonly string[]).includes(declared)) return declared;
  if (declared) return null;                       // declared something we refuse

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? null;
}

/* ── Preparation ──────────────────────────────────────────────────────────── */

/**
 * Downscales and re-encodes a captured file.
 *
 * ── What happens to an iPhone HEIC ─────────────────────────────────────────
 * Almost always: nothing special. Safari decodes HEIC natively, so the canvas
 * re-encode below turns it into a JPEG like anything else, and what reaches
 * the bucket is a JPEG. Android phones produce JPEG to begin with.
 *
 * On a browser that can neither decode HEIC nor was handed a JPEG — an
 * unusual combination — `createImageBitmap` throws. The photograph is then
 * uploaded EXACTLY as the phone made it, unprocessed, which is why the bucket
 * accepts heic/heif. It is never silently discarded, and no HEIC conversion
 * library is shipped to rescue it.
 *
 * The cost of that fallback is size: an undecoded original can be several MB
 * where a processed one is near one. That is the right trade against losing
 * the photograph.
 */
export async function preparePhoto(file: File): Promise<PrepareResult> {
  const contentType = resolveType(file);
  if (!contentType) {
    return {
      ok: false,
      reason: 'That file is not a photo we can send.',
      detail: 'Please choose a JPEG, PNG, WebP or HEIC image.',
    };
  }

  if (file.size > MAX_INPUT_BYTES) {
    return {
      ok: false,
      reason: 'That photo is too large to send.',
      detail: `The limit is ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB and that one is `
            + `${(file.size / 1024 / 1024).toFixed(1)}MB.`,
    };
  }

  const id = newId();

  try {
    const bitmap = await createImageBitmap(file);

    // Never upscale. A small photograph stays its own size.
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('encode failed');

    return {
      ok: true,
      photo: {
        id, blob, contentType: 'image/jpeg',
        previewUrl: URL.createObjectURL(blob),
        width: w, height: h, processed: true,
      },
    };
  } catch {
    // Undecodable. Send the original rather than lose it.
    return {
      ok: true,
      photo: {
        id, blob: file, contentType,
        previewUrl: URL.createObjectURL(file),
        processed: false,
      },
    };
  }
}

export function releasePhoto(photo: PreparedPhoto | null): void {
  if (photo) URL.revokeObjectURL(photo.previewUrl);
}

/* ── Sending ──────────────────────────────────────────────────────────────── */

export type SendResult =
  | { ok: true; path: string }
  | { ok: false; reason: string; detail?: string };

const TIMEOUT_MS = 60_000;
/** Two retries, then the guest gets a button rather than more waiting. */
const RETRY_BACKOFF_MS = [2000, 6000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A failure worth trying again by itself: the network, a timeout, or a 5xx. */
class Transient extends Error {}

/** The server has decided. Repeating the question changes nothing. */
class Permanent extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One attempt: authorise, then upload.
 *
 * Both halves sit inside the retry, deliberately. A signed URL authorises one
 * object, and its metadata row is already written; reusing it after a failed
 * PUT would be writing into a path that has already been accounted for. A
 * fresh signature costs one small request, so every attempt is a clean,
 * independent photograph.
 */
async function attempt(sessionId: string, photo: PreparedPhoto): Promise<string> {
  const signed = await withTimeout(async (signal) => {
    let res: Response;
    try {
      res = await fetch('/api/photos/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          contentType: photo.contentType,
          bytes: photo.blob.size,
          width: photo.width,
          height: photo.height,
        }),
        signal,
      });
    } catch (e) {
      throw new Transient(String(e));
    }

    if (res.status >= 500) throw new Transient(`sign ${res.status}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      throw new Permanent(
        typeof body.detail === 'string' ? body.detail : 'That photo was not accepted.',
        res.status,
      );
    }
    return (await res.json()) as { uploadUrl: string; path: string };
  });

  await withTimeout(async (signal) => {
    let res: Response;
    try {
      res = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': photo.contentType },
        body: photo.blob,
        signal,
      });
    } catch (e) {
      throw new Transient(String(e));
    }

    if (res.status >= 500) throw new Transient(`upload ${res.status}`);
    if (!res.ok) throw new Permanent('The photo could not be stored.', res.status);
  });

  return signed.path;
}

/**
 * Sends one photograph, retrying only what is worth retrying.
 *
 * The photograph is never released here. Whatever the outcome, the caller
 * still holds it — so a retry never means taking the picture again.
 */
export async function sendPhoto(
  sessionId: string, photo: PreparedPhoto,
): Promise<SendResult> {
  for (let i = 0; i <= RETRY_BACKOFF_MS.length; i++) {
    try {
      return { ok: true, path: await attempt(sessionId, photo) };
    } catch (e) {
      if (e instanceof Permanent) return { ok: false, reason: e.message };
      if (i < RETRY_BACKOFF_MS.length) await sleep(RETRY_BACKOFF_MS[i]);
    }
  }

  return {
    ok: false,
    reason: 'That did not send.',
    detail: 'The connection dropped. Your photo is still here — try again.',
  };
}

/* ── Ids ──────────────────────────────────────────────────────────────────── */

/**
 * crypto.randomUUID needs a secure context. The site is HTTPS everywhere, but
 * a guest on an older in-app webview should get a working camera rather than
 * a thrown exception, so there is a plain fallback.
 */
export function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = (n: number) => Array.from(
    { length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
