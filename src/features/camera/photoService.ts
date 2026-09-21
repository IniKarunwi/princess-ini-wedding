/**
 * Submitting guest photographs.
 *
 * ══ WHAT IS AND IS NOT REAL TODAY ═════════════════════════════════════════
 *
 * The client here is complete and talks to Supabase properly. What does NOT
 * exist yet is the server side: supabase/migrations/0008_guest_photos.sql is
 * written but NOT APPLIED. Until someone runs it:
 *
 *   • there is no `guest-photos` bucket and no `guest_photos` table;
 *   • every submission fails, visibly, with a message a guest can act on;
 *   • no photograph is stored anywhere — not on a server, not in the browser.
 *
 * So the camera is not finished. It is wired, and one migration away.
 *
 * ── Why the anon key is safe to ship here ─────────────────────────────────
 * The anon key is public by design; it is already in the bundle for the RSVP
 * form. It is not a secret and must never be treated as one. What keeps guest
 * photographs private is the DATABASE, not the key: 0008 gives anon INSERT
 * and nothing else, on a bucket with public = false. With no SELECT policy,
 * RLS denies by default — a guest holding the key still cannot read back even
 * the photograph they just sent, let alone anyone else's.
 *
 * The service-role key appears nowhere in this application and must not.
 */

import { supabase } from '@/lib/supabase';

/** The bucket and table created by 0008_guest_photos.sql. */
const BUCKET = 'guest-photos';
const TABLE = 'guest_photos';

export interface CapturedPhoto {
  id: string;
  blob: Blob;
  /** Object URL for the preview. Revoked when the session ends. */
  previewUrl: string;
  width: number;
  height: number;
}

export type SubmitResult =
  | { ok: true; count: number }
  | { ok: false; reason: string; detail?: string };

/**
 * Downscales a capture before upload.
 *
 * A modern phone camera produces 8-12MP JPEGs of several megabytes. Sending
 * ten of those over Nigerian mobile data in a marquee would be slow enough
 * that guests give up half way — which loses the photographs entirely.
 *
 * 2400px on the long edge at quality 0.86 lands around 600KB-1MB and still
 * prints at roughly 8x6 inches. That is the point: these have to be worth
 * keeping, so this is deliberately not thumbnail-sized.
 */
export async function downscale(source: Blob, maxEdge = 2400, quality = 0.86): Promise<CapturedPhoto> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode the photo'))),
      'image/jpeg',
      quality,
    );
  });

  return {
    id: crypto.randomUUID(),
    blob,
    previewUrl: URL.createObjectURL(blob),
    width: w,
    height: h,
  };
}

/**
 * Sends a session's photographs.
 *
 * All-or-nothing is deliberately NOT the contract: if seven of ten upload and
 * the connection drops, the seven are kept and the guest is told. Throwing
 * them away to keep a transaction tidy would be the wrong trade at a wedding.
 */
export async function submitPhotos(
  sessionId: string,
  photos: CapturedPhoto[],
  onProgress?: (done: number, total: number) => void,
): Promise<SubmitResult> {
  if (!supabase) {
    return {
      ok: false,
      reason: 'Photo storage is not configured yet.',
      detail: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing from this build.',
    };
  }
  if (photos.length === 0) return { ok: false, reason: 'No photos to send.' };

  let stored = 0;

  for (const [i, photo] of photos.entries()) {
    // Path carries no guest identity — a session id and a random object id.
    const path = `${sessionId}/${photo.id}.jpg`;

    const up = await supabase.storage.from(BUCKET).upload(path, photo.blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });

    if (up.error) {
      // The overwhelmingly likely cause before 0008 is applied: no bucket.
      if (i === 0) {
        return {
          ok: false,
          reason: 'We could not reach the photo album.',
          detail: `Storage rejected the upload: ${up.error.message}. `
                + 'If this persists, migration 0008_guest_photos.sql has not been applied yet.',
        };
      }
      break;   // partial success — keep what landed
    }

    const row = await supabase.from(TABLE).insert({
      session_id: sessionId,
      storage_path: path,
      width: photo.width,
      height: photo.height,
      bytes: photo.blob.size,
      // status is deliberately not sent. The column defaults to 'submitted'
      // and the insert policy refuses anything else, so a photograph cannot
      // arrive pre-approved.
    });

    if (row.error && i === 0) {
      return {
        ok: false,
        reason: 'We could not save your photos.',
        detail: `${row.error.message}. Migration 0008_guest_photos.sql may not be applied.`,
      };
    }

    stored += 1;
    onProgress?.(stored, photos.length);
  }

  if (stored === 0) return { ok: false, reason: 'None of the photos could be sent.' };
  return { ok: true, count: stored };
}

/** True when the app has Supabase credentials at all. */
export const storageConfigured = (): boolean => supabase !== null;
