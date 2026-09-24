/**
 * A live viewfinder, when the browser will give us one.
 *
 * ── Why this is back ───────────────────────────────────────────────────────
 * A getUserMedia viewfinder was built for this page, worked, and was removed
 * in favour of the OS camera behind <input type="file" capture>. The reason
 * was reach: getUserMedia is blocked in several of the in-app browsers guests
 * arrive in from WhatsApp, and a guest who denies the permission prompt
 * cannot easily undo that from a table at a wedding. The file input always
 * works.
 *
 * What the file input cannot do is stay on screen. iOS hands the whole
 * display to Apple's camera app and closes it after every single shot, which
 * makes "take another" a round trip through two screens. For a guest trying
 * to catch three seconds of a first dance, that is the wrong tool.
 *
 * So both, rather than either: this is tried first, and the file input is
 * still there for everyone it fails. Nothing below the capture changes — a
 * frame from here becomes exactly the same PreparedPhoto as a file from
 * there, and the roll, the store, the signing and the upload never learn
 * which one it came from.
 *
 * ── What a frame from here is, honestly ────────────────────────────────────
 * A video frame, not a still. Apple's camera app applies HDR and Deep Fusion
 * to a photograph; a getUserMedia frame gets none of that, so in dim light it
 * is noisier than the same shot taken through the OS camera. In daylight and
 * at reception lighting the difference is small, and it is the price of the
 * camera staying live. The resolution is asked for high and downscaled to the
 * same 1920 long edge either way.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { JPEG_QUALITY, MAX_EDGE, newId, type PreparedPhoto } from './photoService';

export type LiveState =
  | 'idle'        // not asked for yet
  | 'starting'    // permission prompt is up, or the camera is warming
  | 'live'        // a stream is running
  | 'denied'      // the guest said no
  | 'unavailable'; // no getUserMedia, no camera, or the browser refused

export interface LiveCamera {
  state: LiveState;
  videoRef: React.RefObject<HTMLVideoElement>;
  /** True once a stream is attached and playing. */
  ready: boolean;
  start(): Promise<boolean>;
  stop(): void;
  /** Grabs the current frame. Returns null if the camera is not running. */
  capture(): Promise<PreparedPhoto | null>;
}

/**
 * Asked for generously, used modestly.
 *
 * The frame is downscaled to MAX_EDGE anyway, so this is about having enough
 * detail to downscale FROM rather than about the final size. `ideal` rather
 * than `exact` everywhere: an exact constraint that the camera cannot meet
 * fails the whole request, and a smaller frame is much better than none.
 */
const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 2560 },
    height: { ideal: 1920 },
  },
};

export function useLiveCamera(): LiveCamera {
  const [state, setState] = useState<LiveState>('idle');
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
    // Back to 'idle', not left at 'live' — the caller decides what to show by
    // reading this, and a stopped stream still reporting itself live left a
    // dead <video> on screen with no way back to the roll.
    //
    // 'denied' and 'unavailable' are kept: they are decisions, not states,
    // and re-prompting a guest who already said no is worse than not asking.
    setState((s) => (s === 'live' || s === 'starting' ? 'idle' : s));
  }, []);

  // A camera left running is a camera light left on. Release it on the way out.
  useEffect(() => stop, [stop]);

  const start = useCallback(async (): Promise<boolean> => {
    if (stream.current) return true;

    const media = globalThis.navigator?.mediaDevices;
    if (!media?.getUserMedia) {
      // An in-app browser without the API, or a page that is not a secure
      // context. Nothing to recover — the caller falls back.
      setState('unavailable');
      return false;
    }

    setState('starting');
    let got: MediaStream;
    try {
      got = await media.getUserMedia(CONSTRAINTS);
    } catch (e) {
      const name = (e as { name?: string })?.name ?? '';
      // NotAllowedError is the guest saying no, and is worth saying so about.
      // Everything else — no camera, camera in use by another app, a browser
      // that refuses — is indistinguishable to us and equally unrecoverable.
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      return false;
    }

    // The <video> does not exist yet — it is only rendered once this says
    // 'live', which cannot happen before this line. So the stream is parked
    // here and attached by the effect below, once React has put the element
    // on the page. Attaching it inline instead silently did nothing, and the
    // viewfinder never appeared.
    stream.current = got;
    setState('live');
    return true;
  }, []);

  /** Attaches the parked stream as soon as the element exists. */
  useEffect(() => {
    const el = videoRef.current;
    const got = stream.current;
    if (state !== 'live' || !el || !got || el.srcObject === got) return;

    el.srcObject = got;
    // muted + playsInline are both required on iOS, or the video either
    // refuses to autoplay or takes over the whole screen in its own player.
    el.muted = true;
    el.playsInline = true;
    el.play().catch(() => {
      // Autoplay refused. The stream is live and the element usually starts
      // on the next interaction, so this is not fatal.
    });

    /*
     * `ready` means "there is a frame to grab", not "a stream was granted".
     *
     * Those are a few hundred milliseconds apart, and in that gap videoWidth
     * is 0 and a capture silently produces nothing. A guest resuming the
     * camera and tapping straight away got no photograph and no explanation
     * — the shutter simply did not work. So the shutter is armed by this,
     * and this waits for real dimensions.
     */
    const arm = () => { if (el.videoWidth > 0) setReady(true); };
    arm();
    el.addEventListener('loadedmetadata', arm);
    el.addEventListener('playing', arm);
    el.addEventListener('resize', arm);
    return () => {
      el.removeEventListener('loadedmetadata', arm);
      el.removeEventListener('playing', arm);
      el.removeEventListener('resize', arm);
    };
  }, [state]);

  /**
   * One frame, prepared exactly as preparePhoto would prepare a file.
   *
   * Deliberately the same shape and the same two constants, so a photograph
   * taken here and a photograph chosen there are indistinguishable by the
   * time anything downstream sees them.
   */
  const capture = useCallback(async (): Promise<PreparedPhoto | null> => {
    const el = videoRef.current;
    if (!el || !stream.current || !el.videoWidth) return null;

    const started = performance.now();
    const scale = Math.min(1, MAX_EDGE / Math.max(el.videoWidth, el.videoHeight));
    const w = Math.max(1, Math.round(el.videoWidth * scale));
    const h = Math.max(1, Math.round(el.videoHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return null;

    return {
      id: newId(),
      blob,
      contentType: 'image/jpeg',
      previewUrl: URL.createObjectURL(blob),
      width: w,
      height: h,
      processed: true,
      prepareMs: Math.round(performance.now() - started),
    };
  }, []);

  return { state, videoRef, ready, start, stop, capture };
}
