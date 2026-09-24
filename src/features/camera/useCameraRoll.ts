/**
 * The photo roll: capture several, review, then send the batch.
 *
 * ── What changed, and why ──────────────────────────────────────────────────
 * This replaces useCameraSession, which held exactly one photograph and
 * uploaded it before the guest could take another. Even at two seconds that
 * is the wrong shape for the thing being photographed: a wedding does not
 * pause while a JPEG goes up a congested uplink, and the moment after the
 * one you just took is often the better one.
 *
 * So capture never touches the network. Photographs accumulate in a roll,
 * and Send remains a single deliberate act on the whole batch.
 *
 * ── Nothing uploads before Send ────────────────────────────────────────────
 * Explicitly not a background queue. There is no code path from `accept` to
 * the network — the only caller of sendPhoto is `send`, which only runs from
 * the guest pressing the button. That was asked for, and it is also the
 * honest behaviour: a guest who never presses Send has sent nothing.
 *
 * ── The reliability below this file is untouched ───────────────────────────
 * sendPhoto, its three attempts, its backoff, its timeouts and its
 * diagnostics are exactly as they were. This is a loop above it. Every
 * property that held for one photograph still holds for each photograph in
 * the batch, one at a time.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  newId, preparePhoto, releasePhoto, sendPhoto, diagnosticLine,
  type PreparedPhoto, type SendDiagnostic, type SendTiming,
} from './photoService';
import * as store from './photoStore';

/**
 * Ten to a batch.
 *
 * Not an arbitrary cap: the final-details email tells every guest "we're
 * challenging you to take 10 photos for us", so the roll matches the promise
 * that has already been made to them rather than inventing a different one.
 *
 * PER BATCH, not per sitting. Sending ten empties the roll and the next ten
 * are welcome — there is no session total anywhere in this file.
 */
export const MAX_ROLL = 10;

export type PhotoStatus = 'preparing' | 'ready' | 'sending' | 'sent' | 'failed';

export interface RollPhoto {
  id: string;
  status: PhotoStatus;
  /** Present once preparation finishes. */
  photo: PreparedPhoto | null;
  /** Shown immediately, from the raw file, so the roll fills as you shoot. */
  previewUrl: string;
  takenAt: number;
  error?: string;
  diagnostic?: SendDiagnostic;
  timing?: SendTiming;
}

export type Stage = 'intro' | 'roll' | 'sending' | 'done';

export interface CameraRoll {
  stage: Stage;
  photos: RollPhoto[];
  /** Of the batch just sent. Reset when a new batch starts. */
  sentCount: number;
  /** Index within the batch currently being uploaded, 1-based. */
  progress: { done: number; total: number } | null;
  error: string | null;
  detail: string | null;
  /** True when the roll is at MAX_ROLL and the shutter should be closed. */
  full: boolean;
  /** False when IndexedDB is unavailable — the roll then lives only in memory. */
  persistent: boolean;
  /** prepare/sign/upload timings, shown on Preview only. */
  timings: string[];

  accept(file: File | null | undefined): Promise<void>;
  /**
   * A frame from the live viewfinder, already prepared.
   *
   * The same roll, the same store, the same send. The only difference from
   * `accept` is that there is nothing left to downscale, so it skips the
   * preparation queue entirely and is in the roll before the shutter
   * animation has finished.
   */
  addPrepared(photo: PreparedPhoto): Promise<void>;
  send(): Promise<void>;
  remove(id: string): void;
  discard(): void;
  /** After a batch: clear the result and go back to shooting. */
  takeMore(): void;
}

export function useCameraRoll(): CameraRoll {
  const sessionId = useRef<string>(newId());
  const [photos, setPhotos] = useState<RollPhoto[]>([]);
  const [stage, setStage] = useState<Stage>('intro');
  const [sentCount, setSentCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [timings, setTimings] = useState<string[]>([]);

  const live = useRef<RollPhoto[]>([]);
  live.current = photos;
  const sending = useRef(false);

  /* ── Preparation runs one at a time ─────────────────────────────────────
     createImageBitmap and the canvas re-encode are main-thread work. Three
     at once would stutter exactly the taps this design exists to protect, so
     captures queue and the shutter stays live throughout. At 1920/0.78 each
     takes about 140ms, so the queue is almost never more than one deep. */
  const queue = useRef<Array<{ id: string; file: File }>>([]);
  const preparing = useRef(false);

  /* ── Recover anything left from a previous visit ───────────────────────── */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = await store.isAvailable();
      if (cancelled) return;
      setPersistent(available);
      if (!available) return;

      const saved = await store.all();
      if (cancelled || !saved.length) return;

      // Photographs that outlived a reload — a failed fifth of five, or a
      // roll interrupted by Safari reclaiming the tab. They come back ready
      // to send, because that is the only thing left to do with them.
      setPhotos(saved.map((row) => ({
        id: row.id,
        status: 'ready',
        photo: {
          id: row.id, blob: row.blob, contentType: row.contentType,
          previewUrl: URL.createObjectURL(row.blob),
          width: row.width, height: row.height, processed: true, prepareMs: 0,
        },
        previewUrl: URL.createObjectURL(row.blob),
        takenAt: row.takenAt,
      })));
      setStage('roll');
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Capture ────────────────────────────────────────────────────────────── */

  const drain = useCallback(async () => {
    if (preparing.current) return;
    preparing.current = true;
    try {
      while (queue.current.length) {
        const next = queue.current.shift()!;
        const result = await preparePhoto(next.file);

        if (!result.ok) {
          // Refused before it ever joined the roll — too large, or not an
          // image. Take it back out, and if that empties the roll go back to
          // the intro rather than leaving the guest on an empty grid
          // wondering what happened to their photograph.
          setPhotos((list) => {
            const rest = list.filter((p) => p.id !== next.id);
            if (!rest.length) setStage('intro');
            return rest;
          });
          setError(result.reason);
          setDetail(result.detail ?? null);
          continue;
        }

        // Persist the moment it is prepared, not when the batch is sent. The
        // window this closes is the next camera launch, which backgrounds
        // this page.
        await store.put({
          id: next.id, blob: result.photo.blob, contentType: result.photo.contentType,
          width: result.photo.width, height: result.photo.height,
          takenAt: Date.now(), status: 'ready',
        });

        // Swap the thumbnail from the raw file to the prepared image, and
        // let go of the original. Ten un-revoked 2.5MB originals held open
        // behind their object URLs is exactly the memory pressure that makes
        // Safari reclaim the tab — which is the thing this whole design is
        // trying to survive.
        setPhotos((list) => list.map((p) => {
          if (p.id !== next.id) return p;
          URL.revokeObjectURL(p.previewUrl);
          return {
            ...p, status: 'ready',
            photo: { ...result.photo, id: next.id },
            previewUrl: result.photo.previewUrl,
          };
        }));
        setTimings((t) => [...t, `prepare ${result.photo.prepareMs}ms`]);
      }
    } finally {
      preparing.current = false;
    }
  }, []);

  const addPrepared = useCallback(async (prepared: PreparedPhoto) => {
    if (live.current.length >= MAX_ROLL) {
      releasePhoto(prepared);
      return;
    }
    setError(null);
    setDetail(null);

    setPhotos((list) => [...list, {
      id: prepared.id, status: 'ready', photo: prepared,
      previewUrl: prepared.previewUrl, takenAt: Date.now(),
    }]);
    setStage('roll');
    setTimings((t) => [...t, `prepare ${prepared.prepareMs}ms`]);

    // Persisted immediately, for the same reason as a captured file: the page
    // can be reclaimed at any moment and the roll has to outlive that.
    await store.put({
      id: prepared.id, blob: prepared.blob, contentType: prepared.contentType,
      width: prepared.width, height: prepared.height,
      takenAt: Date.now(), status: 'ready',
    });
  }, []);

  const accept = useCallback(async (file: File | null | undefined) => {
    // Cancelling the camera is not an error and must not look like one.
    if (!file) return;
    if (live.current.length >= MAX_ROLL) return;

    setError(null);
    setDetail(null);

    // Into the roll IMMEDIATELY, with a preview from the raw file. The
    // shutter is live again before any decoding has happened.
    const id = newId();
    const previewUrl = URL.createObjectURL(file);
    setPhotos((list) => [...list, {
      id, status: 'preparing', photo: null, previewUrl, takenAt: Date.now(),
    }]);
    setStage('roll');

    queue.current.push({ id, file });
    void drain();
  }, [drain]);

  /* ── Sending ────────────────────────────────────────────────────────────── */

  const send = useCallback(async () => {
    if (sending.current) return;
    const batch = live.current.filter((p) => p.status === 'ready' || p.status === 'failed');
    if (!batch.length) return;

    sending.current = true;
    setError(null);
    setDetail(null);
    setStage('sending');
    setSentCount(0);
    setProgress({ done: 0, total: batch.length });

    let done = 0;
    const lines: string[] = [];

    // Sequential, concurrency 1. The phone's uplink is the bottleneck, so two
    // at once is not faster — it just puts both closer to the timeout, and
    // makes "3 of 5" dishonest.
    for (const item of batch) {
      if (!item.photo) continue;

      setPhotos((list) => list.map((p) =>
        p.id === item.id ? { ...p, status: 'sending', error: undefined } : p));

      const result = await sendPhoto(sessionId.current, item.photo);

      if (result.ok) {
        done++;
        // Confirmed. This is the ONLY place a photograph is forgotten.
        await store.remove(item.id);
        releasePhoto(item.photo);
        setPhotos((list) => list.filter((p) => p.id !== item.id));
        setSentCount(done);
        lines.push(`sign ${result.timing.signMs}ms · upload ${result.timing.uploadMs}ms · `
                 + `total ${result.timing.totalMs}ms`);
      } else {
        await store.setStatus(item.id, 'failed');
        setPhotos((list) => list.map((p) => p.id === item.id
          ? { ...p, status: 'failed', error: result.reason, diagnostic: result.diagnostic,
              timing: result.timing }
          : p));
        if (result.diagnostic) {
          console.warn('[camera] send failed:', diagnosticLine(result.diagnostic));
        }
        if (result.timing) {
          lines.push(`sign ${result.timing.signMs}ms · upload ${result.timing.uploadMs}ms · `
                   + `total ${result.timing.totalMs}ms (failed)`);
        }
      }

      setProgress({ done, total: batch.length });

      // A limiter that has already said no will say no to the remaining four
      // as well. Stop and let the guest wait rather than burning the batch.
      if (!result.ok && result.diagnostic?.code === 'rate_limited') {
        setError('That is a lot of photos at once.');
        setDetail('Give it a minute, then send the rest — nothing has been lost.');
        break;
      }
    }

    sending.current = false;
    setTimings((t) => [...t, ...lines]);
    setStage('done');
  }, []);

  /* ── The guest's own decisions ──────────────────────────────────────────── */

  const remove = useCallback((id: string) => {
    const target = live.current.find((p) => p.id === id);
    if (!target || target.status === 'sending') return;
    // Explicit removal is the second and last reason to forget a photograph.
    void store.remove(id);
    // Once prepared, previewUrl IS the prepared photo's URL — revoking both
    // would be revoking the same URL twice.
    if (target.photo) releasePhoto(target.photo);
    else URL.revokeObjectURL(target.previewUrl);
    setPhotos((list) => {
      const next = list.filter((p) => p.id !== id);
      if (!next.length) setStage('intro');
      return next;
    });
  }, []);

  const discard = useCallback(() => {
    for (const p of live.current) {
      if (p.photo) releasePhoto(p.photo);
      else URL.revokeObjectURL(p.previewUrl);
    }
    void store.clear();
    setPhotos([]);
    setError(null);
    setDetail(null);
    setStage('intro');
  }, []);

  /**
   * Back to shooting after a batch.
   *
   * Clears the RESULT, never the roll. Anything still here failed to send,
   * and it stays — recoverable, retryable, and still on the phone.
   */
  const takeMore = useCallback(() => {
    setSentCount(0);
    setProgress(null);
    setError(null);
    setDetail(null);
    setStage(live.current.length ? 'roll' : 'intro');
  }, []);

  return {
    stage, photos, sentCount, progress, error, detail,
    full: photos.length >= MAX_ROLL,
    persistent, timings,
    accept, addPrepared, send, remove, discard, takeMore,
  };
}
