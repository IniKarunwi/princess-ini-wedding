/**
 * One disposable-camera sitting.
 *
 * ── Behavioural, not enforced ──────────────────────────────────────────────
 * The ten-photo cap is a shape for the experience, not a security boundary.
 * The brief is explicit that no device fingerprinting is wanted, so a guest
 * who deliberately reopens the page gets a fresh session and that is fine.
 * What matters is that the DEFAULT path is short and finite: take a few,
 * send them, put the phone down.
 *
 * ── Nothing persists ───────────────────────────────────────────────────────
 * Captures live in memory as Blobs for the length of the sitting. Nothing is
 * written to localStorage or IndexedDB. Close the tab and the photographs are
 * gone — which is the honest behaviour for something whose only destination
 * is Princess and IniOluwa.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { downscale, submitPhotos, type CapturedPhoto } from './photoService';

export const MAX_PHOTOS = 10;

export type Stage =
  | 'intro'        // the explanation, before any permission is asked for
  | 'live'         // camera running, ready to shoot
  | 'review'       // one capture held for keep/retake
  | 'sending'
  | 'done'
  | 'denied'       // permission refused
  | 'unavailable'; // no camera, or the browser cannot do this

export interface CameraSession {
  stage: Stage;
  photos: CapturedPhoto[];
  pending: CapturedPhoto | null;
  remaining: number;
  atLimit: boolean;
  error: string | null;
  detail: string | null;
  sent: number;
  progress: { done: number; total: number } | null;
  videoRef: React.RefObject<HTMLVideoElement>;

  open(): Promise<void>;
  capture(): Promise<void>;
  keep(): void;
  retake(): void;
  submit(): Promise<void>;
  reset(): void;
}

export function useCameraSession(): CameraSession {
  const [stage, setStage] = useState<Stage>('intro');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [pending, setPending] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionId = useRef<string>(crypto.randomUUID());

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /**
   * Release the camera and every object URL when the guest leaves. A phone
   * that keeps its camera light on after someone has walked away from the
   * page is alarming, and at a no-phone wedding doubly so.
   *
   * ── Why the live values are read through a ref ────────────────────────
   * This MUST run only on unmount. Written with `photos` and `pending` in
   * the dependency array it also ran on every change to them — so React
   * fired the cleanup the moment the first photo was kept, stopping the
   * camera track and revoking the previews mid-session. The track went to
   * "ended" after photo one and every later shot was a frozen frame from a
   * dead stream, with the phone's camera light going out. Empty deps plus
   * a ref keeps the teardown correct without resurrecting that.
   */
  const latest = useRef({ photos, pending });
  latest.current = { photos, pending };

  useEffect(() => () => {
    stopStream();
    latest.current.photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    if (latest.current.pending) URL.revokeObjectURL(latest.current.pending.previewUrl);
  }, [stopStream]);

  const open = useCallback(async () => {
    setError(null);
    setDetail(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setStage('unavailable');
      setError('This browser cannot open the camera.');
      setDetail('You may be in a private window, or on an older browser. Safari and Chrome on a phone both work.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The rear camera, where there is a choice. "environment" is a
        // preference, not a guarantee — a laptop simply ignores it.
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      // The <video> does not exist yet — it is rendered by the 'live' stage.
      // Attaching the stream is done by the effect below, once React has
      // actually committed that element. queueMicrotask was not enough: it
      // runs before the render, so videoRef.current was still null, the
      // stream was never attached, videoWidth stayed 0 and the shutter
      // silently did nothing.
      setStage('live');
    } catch (e) {
      const name = (e as DOMException)?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStage('denied');
        setError('The camera is blocked.');
        setDetail('Tap the icon in your browser’s address bar and allow the camera, then try again. On iPhone: Settings → Safari → Camera → Ask or Allow.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setStage('unavailable');
        setError('No camera found on this device.');
      } else {
        setStage('unavailable');
        setError('The camera could not be opened.');
        setDetail(name || String(e));
      }
    }
  }, []);

  /**
   * Binds the live stream to the <video> once React has rendered it.
   *
   * Runs on every entry to 'live', which also covers returning from a
   * review — the element is remounted by the stage switch and would
   * otherwise come back blank.
   */
  useEffect(() => {
    if (stage !== 'live') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => { /* autoplay guard — the frame still paints */ });
  }, [stage]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      // Never let the shutter be a dead tap. If the first frame has not
      // arrived yet, say so rather than appearing to do nothing.
      setError('The camera is still waking up — try that again in a second.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    const raw: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
    if (!raw) { setError('That photo did not come out. Try again.'); return; }

    try {
      setPending(await downscale(raw));
      setStage('review');
    } catch {
      setError('That photo could not be saved. Try again.');
    }
  }, []);

  const keep = useCallback(() => {
    if (!pending) return;
    setPhotos((p) => [...p, pending]);
    setPending(null);
    setStage('live');
  }, [pending]);

  const retake = useCallback(() => {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
    setStage('live');
  }, [pending]);

  const submit = useCallback(async () => {
    if (photos.length === 0) return;
    setStage('sending');
    setError(null);
    setProgress({ done: 0, total: photos.length });

    const res = await submitPhotos(sessionId.current, photos, (done, total) =>
      setProgress({ done, total }));

    if (res.ok) {
      setSent(res.count);
      // The sitting is over: camera off, previews released.
      stopStream();
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      setStage('done');
    } else {
      setError(res.reason);
      setDetail(res.detail ?? null);
      // Back to live so nothing captured is lost — they can retry.
      setStage(streamRef.current ? 'live' : 'intro');
    }
    setProgress(null);
  }, [photos, stopStream]);

  const reset = useCallback(() => {
    stopStream();
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPhotos([]);
    setPending(null);
    setError(null);
    setDetail(null);
    setSent(0);
    sessionId.current = crypto.randomUUID();
    setStage('intro');
  }, [photos, pending, stopStream]);

  return {
    stage, photos, pending,
    remaining: Math.max(0, MAX_PHOTOS - photos.length),
    atLimit: photos.length >= MAX_PHOTOS,
    error, detail, sent, progress, videoRef,
    open, capture, keep, retake, submit, reset,
  };
}
