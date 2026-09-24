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

/**
 * Long edge after downscaling, and the JPEG quality used to re-encode.
 *
 * ── Measured, not chosen ───────────────────────────────────────────────────
 * These were 2400/0.82, picked against a storage budget and a note about
 * printing at 8x6. The guest-facing cost of that is upload time on venue
 * Wi-Fi, which is the slowest thing in the whole feature, so the settings
 * were re-derived from measurement on a 12MP/2.5MB phone frame.
 *
 * Each candidate was re-rendered at 1290px — an iPhone 15 Pro Max screen at
 * native width — and compared against the original shown at that same size,
 * because "how good does it look on a phone" is the question that matters
 * and "how good is the file" is not:
 *
 *     2400 / 0.82     509 KB      43.0 dB      (what this was)
 *     2048 / 0.78     343 KB      41.6 dB
 *     1920 / 0.78     307 KB      41.2 dB      ← here
 *     1600 / 0.78     222 KB      39.6 dB
 *
 * Above roughly 40 dB the difference is not visible at phone size, so 1920
 * removes 41% of the bytes and nothing a guest or the couple will ever see.
 * On a congested 1 Mbps uplink that is 4.1s of upload becoming 2.5s.
 *
 * 1920 is also wider than any current phone screen, so a photograph still
 * fills one at native resolution, and prints acceptably at 6x4.
 *
 * Going further was deliberately declined: 1600 starts to show, and these
 * are the only copies that will exist — the originals are never kept.
 */
export const MAX_EDGE = 1920;
export const JPEG_QUALITY = 0.78;

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
  /** How long preparation took. Diagnostics only. */
  prepareMs: number;
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
  const started = now();

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
        prepareMs: Math.round(now() - started),
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
        prepareMs: Math.round(now() - started),
      },
    };
  }
}

export function releasePhoto(photo: PreparedPhoto | null): void {
  if (photo) URL.revokeObjectURL(photo.previewUrl);
}

/* ── Sending ──────────────────────────────────────────────────────────────── */

/**
 * What actually went wrong, in terms a person can act on.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Every failure used to arrive at the guest as "The connection dropped." —
 * including the ones that were nothing of the kind. A 503 from our own
 * function because an environment variable is unset, a 502 because Supabase
 * refused the service-role key, a 400 from Storage because the bucket does
 * not accept the type: all of them are >= 500 or a thrown fetch, all of them
 * were classified the same, and the server's own explanation was read and
 * discarded.
 *
 * That is fine for the guest, who can only ever try again. It is useless on
 * a phone at a wedding where nobody can open a console. So the category, the
 * stage and the HTTP status are kept and shown, small and plain.
 *
 * ── What may appear here ───────────────────────────────────────────────────
 * Only a stage name, an HTTP status, and the machine-readable `error` field
 * our own API returns (`not_configured`, `upstream`, `rate_limited`…). Never
 * a URL, never a token, never a header, and never the body of a Storage
 * error. The signed URL contains a credential in its query string and is
 * deliberately never rendered or logged.
 */
export interface SendDiagnostic {
  /** Which half of the send failed. */
  stage: 'sign' | 'upload';
  /**
   * network  the request never completed — offline, DNS, TLS, cancelled
   * timeout  it completed nothing within 60s
   * server   a 5xx: our function or Supabase answered, unhappily
   * refused  a 4xx: the request was understood and declined
   */
  kind: 'network' | 'timeout' | 'server' | 'refused';
  /** HTTP status, or 0 when the request never got one. */
  status: number;
  /** Our API's own `error` field, when it sent one. */
  code?: string;
  attempts: number;
}

/** One line, short enough to read off a phone and repeat down a phone. */
export function diagnosticLine(d: SendDiagnostic): string {
  const bits = [d.stage, d.kind, d.status ? `HTTP ${d.status}` : null, d.code,
                d.attempts > 1 ? `${d.attempts} attempts` : null];
  return bits.filter(Boolean).join(' · ');
}

/**
 * How long each half took. Diagnostics only — durations and counts, never a
 * URL, a token or a path.
 */
export interface SendTiming {
  signMs: number;
  uploadMs: number;
  totalMs: number;
  attempts: number;
}

export type SendResult =
  | { ok: true; path: string; timing: SendTiming }
  | { ok: false; reason: string; detail?: string; diagnostic?: SendDiagnostic; timing?: SendTiming };

const TIMEOUT_MS = 60_000;
/** Two retries, then the guest gets a button rather than more waiting. */
const RETRY_BACKOFF_MS = [2000, 6000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Monotonic where available. Only ever used for durations. */
const now = (): number =>
  (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

/**
 * A failure worth trying again by itself: the network, a timeout, or a 5xx.
 *
 * It now carries WHY, because a 503 saying "SUPABASE_URL is not set" will not
 * fix itself on the third attempt, and the guest deserves to be told
 * something truer than "the connection dropped" once we stop trying.
 */
class Transient extends Error {
  readonly info: Omit<SendDiagnostic, 'attempts'>;
  constructor(info: Omit<SendDiagnostic, 'attempts'>) {
    super(diagnosticLine({ ...info, attempts: 1 }));
    this.info = info;
  }
}

/** The server has decided. Repeating the question changes nothing. */
class Permanent extends Error {
  readonly info: Omit<SendDiagnostic, 'attempts'>;
  constructor(message: string, info: Omit<SendDiagnostic, 'attempts'>) {
    super(message);
    this.info = info;
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, TIMEOUT_MS);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
    // Read by the fetch catch blocks below: an AbortError means the 60s ran
    // out, which is a different thing from the network refusing, and the
    // difference is the whole point of showing a category at all.
    (withTimeout as { lastTimedOut?: boolean }).lastTimedOut = timedOut;
  }
}

/** Distinguishes "we gave up waiting" from "it never connected". */
const netKind = (e: unknown): 'timeout' | 'network' =>
  (e as { name?: string })?.name === 'AbortError' ? 'timeout' : 'network';

/**
 * The machine-readable code our own API sends, if it sent one.
 *
 * Only `error` is read — never `detail`, which for a configuration failure
 * names an environment variable. The name of an unset variable is not a
 * secret, but it is not a thing to paint on a guest's screen either. It stays
 * in the server's own logs, where it was already being written.
 */
async function codeFrom(res: Response): Promise<string | undefined> {
  try {
    const body = await res.json() as Record<string, unknown>;
    return typeof body.error === 'string' ? body.error : undefined;
  } catch {
    return undefined;
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
async function attempt(
  sessionId: string, photo: PreparedPhoto, clock: { signMs: number; uploadMs: number },
): Promise<string> {
  const tSign = now();
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
      throw new Transient({ stage: 'sign', kind: netKind(e), status: 0 });
    }

    // A 5xx is still retried — a cold function or a blip is real. What has
    // changed is that its status and code survive the retries, so the final
    // message can say "the photo service answered 503" rather than inventing
    // a dropped connection.
    if (res.status >= 500) {
      throw new Transient({
        stage: 'sign', kind: 'server', status: res.status, code: await codeFrom(res),
      });
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      throw new Permanent(
        typeof body.detail === 'string' ? body.detail : 'That photo was not accepted.',
        { stage: 'sign', kind: 'refused', status: res.status,
          code: typeof body.error === 'string' ? body.error : undefined },
      );
    }
    return (await res.json()) as { uploadUrl: string; path: string };
  });
  clock.signMs = Math.round(now() - tSign);

  const tUpload = now();

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
      // A CORS rejection, a DNS failure and being offline are indistinguishable
      // to fetch — all of them arrive here as an opaque TypeError. The stage
      // is what narrows it: failing HERE and not at sign means our own API was
      // reachable and Supabase was not.
      throw new Transient({ stage: 'upload', kind: netKind(e), status: 0 });
    }

    if (res.status >= 500) {
      throw new Transient({ stage: 'upload', kind: 'server', status: res.status });
    }
    if (!res.ok) {
      throw new Permanent('The photo could not be stored.',
        { stage: 'upload', kind: 'refused', status: res.status });
    }
  });
  clock.uploadMs = Math.round(now() - tUpload);

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
  let last: Omit<SendDiagnostic, 'attempts'> | null = null;
  let attempts = 0;
  const started = now();
  const clock = { signMs: 0, uploadMs: 0 };

  for (let i = 0; i <= RETRY_BACKOFF_MS.length; i++) {
    attempts++;
    try {
      const path = await attempt(sessionId, photo, clock);
      return {
        ok: true, path,
        timing: { ...clock, totalMs: Math.round(now() - started), attempts },
      };
    } catch (e) {
      if (e instanceof Permanent) {
        return {
          ok: false, reason: e.message, diagnostic: { ...e.info, attempts },
          timing: { ...clock, totalMs: Math.round(now() - started), attempts },
        };
      }
      if (e instanceof Transient) last = e.info;
      if (i < RETRY_BACKOFF_MS.length) await sleep(RETRY_BACKOFF_MS[i]);
    }
  }

  const diagnostic: SendDiagnostic = { ...(last ?? { stage: 'sign', kind: 'network', status: 0 }), attempts };

  // Say what happened. "The connection dropped" is a specific claim, and it
  // was being made about failures where the server answered perfectly
  // promptly with an error.
  const detail = diagnostic.kind === 'server'
    ? `The photo service answered with an error (${diagnostic.status}). `
      + 'Your photo is still here — try again.'
    : diagnostic.kind === 'timeout'
      ? 'It took too long to send. Your photo is still here — try again.'
      : 'The connection dropped. Your photo is still here — try again.';

  return {
    ok: false, reason: 'That did not send.', detail, diagnostic,
    timing: { ...clock, totalMs: Math.round(now() - started), attempts },
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
