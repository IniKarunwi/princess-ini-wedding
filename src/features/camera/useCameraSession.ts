/**
 * One instant-camera sitting.
 *
 * ── One photograph at a time ───────────────────────────────────────────────
 * Take → preview → retake or send → sent → take another. Each photograph is
 * committed on its own, the moment the guest sends it. The earlier design
 * held up to ten in memory and sent them as a batch, which meant a dropped
 * connection at the marquee could cost nine photographs instead of one. On
 * venue Wi-Fi that is the wrong shape.
 *
 * ── The camera is the phone's ──────────────────────────────────────────────
 * There is no getUserMedia here. Capture is an <input capture="environment">
 * that hands off to the OS camera app — see ThroughYourEyes.tsx. That is a
 * deliberate reversal of the first implementation: getUserMedia fails
 * outright inside the in-app browsers guests actually arrive in (WhatsApp,
 * Instagram), and a denied camera permission is a dead end a guest cannot
 * recover from while standing at a table. Handing off loses the custom
 * viewfinder and keeps the photographs.
 *
 * ── Nothing persists ───────────────────────────────────────────────────────
 * The photograph is a Blob in memory. No storage of any kind, so closing the
 * tab loses it — which is honest for something whose only destination is the
 * couple.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  newId, preparePhoto, releasePhoto, sendPhoto, type PreparedPhoto,
} from './photoService';

export type Stage =
  | 'intro'      // before anything has been taken
  | 'working'    // decoding and downscaling what the camera returned
  | 'preview'    // one photograph, held for retake or send
  | 'sending'    // upload in flight; Send is disabled
  | 'done';      // that photograph is safely away

export interface CameraSession {
  stage: Stage;
  photo: PreparedPhoto | null;
  /** How many have been sent in this sitting. Shown quietly on the way out. */
  sent: number;
  error: string | null;
  detail: string | null;
  /** True once a send has failed — the button becomes TRY AGAIN. */
  failed: boolean;

  /** Called with whatever the file input produced. */
  accept(file: File | null | undefined): Promise<void>;
  send(): Promise<void>;
  retake(): void;
  again(): void;
}

export function useCameraSession(): CameraSession {
  const [stage, setStage] = useState<Stage>('intro');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  /** Groups this sitting's photographs. Identifies a session, never a person. */
  const sessionId = useRef<string>(newId());

  /**
   * Guards against a second send while the first is in flight.
   *
   * The button is disabled too, but state updates are asynchronous and a
   * double tap on a slow phone can land both presses before React re-renders.
   * A ref is checked synchronously, so the second press cannot get through.
   */
  const inFlight = useRef(false);

  /**
   * Released on unmount only. Read through a ref so the effect does not
   * re-run — and revoke a live preview — every time the photograph changes.
   */
  const latest = useRef<PreparedPhoto | null>(photo);
  latest.current = photo;
  useEffect(() => () => { releasePhoto(latest.current); }, []);

  const accept = useCallback(async (file: File | null | undefined) => {
    // No file means the guest opened the camera and backed out. That is not
    // an error and must not look like one.
    if (!file) return;

    setError(null);
    setDetail(null);
    setFailed(false);
    setStage('working');

    const result = await preparePhoto(file);
    if (!result.ok) {
      setError(result.reason);
      setDetail(result.detail ?? null);
      setStage('intro');
      return;
    }

    // Replacing an un-sent photograph: release the old preview first.
    releasePhoto(latest.current);
    setPhoto(result.photo);
    setStage('preview');
  }, []);

  const send = useCallback(async () => {
    if (inFlight.current) return;
    const current = latest.current;
    if (!current) return;

    inFlight.current = true;
    setError(null);
    setDetail(null);
    setStage('sending');

    const result = await sendPhoto(sessionId.current, current);
    inFlight.current = false;

    if (result.ok) {
      // Only now is the photograph finished with.
      releasePhoto(current);
      setPhoto(null);
      setSent((n) => n + 1);
      setFailed(false);
      setStage('done');
      return;
    }

    // Keep the photograph. The guest retries the send, never the picture.
    setError(result.reason);
    setDetail(result.detail ?? null);
    setFailed(true);
    setStage('preview');
  }, []);

  const retake = useCallback(() => {
    releasePhoto(latest.current);
    setPhoto(null);
    setError(null);
    setDetail(null);
    setFailed(false);
    setStage('intro');
  }, []);

  const again = useCallback(() => {
    setError(null);
    setDetail(null);
    setFailed(false);
    setStage('intro');
  }, []);

  return { stage, photo, sent, error, detail, failed, accept, send, retake, again };
}
