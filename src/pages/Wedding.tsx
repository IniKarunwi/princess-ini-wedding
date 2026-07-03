import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  useAnimation,
  type MotionValue,
} from 'framer-motion';
import Landing from '@/components/wedding/Landing';
import Abuja from '@/components/wedding/Abuja';
import Chair from '@/components/wedding/Chair';
import RSVPDecision from '@/components/wedding/RSVPDecision';
import RSVPForm, { RSVPFormValues } from '@/components/wedding/RSVPForm';
import Confirmation from '@/components/wedding/Confirmation';
import Regrets from '@/components/wedding/Regrets';
import Duplicate from '@/components/wedding/Duplicate';
import Registry from '@/components/wedding/Registry';
import { submitRSVP } from '@/lib/supabase';

// Background images — managed exclusively here, not in child components
const LANDING_BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fd62d4227-36a4-4315-a204-31d5edd5b01a?alt=media&token=60dd1bf9-31b0-4738-b105-6b2d335fd535';
const ABUJA_BG   = 'https://storage.googleapis.com/banani-generated-images/generated-images/451cac94-c73a-4eeb-927c-365eeff38b2c.jpg';
const CHAIR_BG   = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fee3e746a-48b4-46f7-980b-17b9cac93870?alt=media&token=ddb6776b-257e-49c1-b642-0f32242d8932';

// Landscape variants for wide screens — served from /public.
// The landing web image has the invitation text painted in, so the Landing
// component hides its own text overlay on desktop.
const LANDING_BG_WEB = '/landing-web.webp';
const ABUJA_BG_WEB   = '/abuja-web.webp';
const CHAIR_BG_WEB   = '/chair-web.webp';

const DESKTOP_MQ = '(min-width: 768px)';

// Camera positions along the journey:
//   0 = Landing  |  1 = Abuja  |  2 = Chair / form screens
const CAM_LANDING = 0;
const CAM_ABUJA   = 1;
const CAM_CHAIR   = 2;

type ContentPhase =
  | 'landing'
  | 'abuja'
  | 'chair'
  | 'rsvp-decision'
  | 'rsvp-form-attending'
  | 'rsvp-form-regrets'
  | 'confirmation'
  | 'regrets'
  | 'registry'
  | 'duplicate';

// ─ intro phase ───────────────────────────────────────────────────────────────
// 'loading'   – image not yet ready, black screen shown
// 'revealing' – image decoded, fade-in + blur-sharpen running (~1.1s)
// 'done'      – intro layer unmounts; world camera bg takes over seamlessly
type IntroPhase = 'loading' | 'revealing' | 'done';

// Max readable width for sheet-style UI (forms, cards) on wide screens.
// Scene backgrounds stay full-bleed; only the foreground column is capped.
const SHEET_MAX_WIDTH = 620;

// Centers sheet-style content into a readable column on wide screens while
// leaving the full-bleed scene background visible on either side.
function SheetLayer({ isDesktop, children }: { isDesktop: boolean; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex justify-center">
      <div
        className="relative w-full h-full"
        style={{ maxWidth: isDesktop ? SHEET_MAX_WIDTH : '100%' }}
      >
        {children}
      </div>
    </div>
  );
}

export default function Wedding() {
  const [contentPhase, setContentPhase] = useState<ContentPhase>('landing');
  const [guestName, setGuestName] = useState('');
  const [plusOneRequested, setPlusOneRequested] = useState(false);

  const [introPhase, setIntroPhase]     = useState<IntroPhase>('loading');
  const [startContent, setStartContent] = useState(false);

  // Tracks whether we're on a desktop viewport (≥768px).
  // Initialized synchronously so the first paint (and the intro preloader)
  // already uses the correct scene image for this viewport.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_MQ).matches);

  // Abuja content is held until the spring camera has settled at cam≈1
  const [abujaContentReady, setAbujaContentReady] = useState(false);
  const abujaReadyFiredRef = useRef(false);

  // Chair arrow is held until the spring has settled at cam≈2, then a
  // 300ms breath before the UI appears — same pattern as abujaContentReady.
  const [chairCameraReady, setChairCameraReady] = useState(false);
  const chairReadyFiredRef = useRef(false);

  // Lazy-load scene backgrounds: only fetch what the user is about to see.
  // abujaBgUnlocked: true after the intro fades (~1.4s) — user is reading
  //   Landing, giving the Abuja image time to download before they tap.
  // chairBgUnlocked: true once the user reaches Abuja — Chair image loads
  //   during the ~5–15s the user spends on the Abuja screen.
  const abujaBgUnlocked = startContent;
  const [chairBgUnlocked, setChairBgUnlocked] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Viewport-appropriate scene images (portrait art on mobile, landscape on web)
  const landingSrc = isDesktop ? LANDING_BG_WEB : LANDING_BG;
  const abujaSrc   = isDesktop ? ABUJA_BG_WEB   : ABUJA_BG;
  const chairSrc   = isDesktop ? CHAIR_BG_WEB   : CHAIR_BG;

  useEffect(() => {
    let cancelled = false;

    // Respect prefers-reduced-motion: skip the whole intro sequence
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIntroPhase('done');
      setStartContent(true);
      return;
    }

    const run = () => {
      if (cancelled) return;
      // 200ms black hold, then reveal
      setTimeout(() => {
        if (cancelled) return;
        setIntroPhase('revealing');

        // bg fade takes 1 100ms, then 300ms settle before content starts
        setTimeout(() => {
          if (cancelled) return;
          setStartContent(true);
          setIntroPhase('done');
        }, 1100 + 300);
      }, 200);
    };

    const img = new window.Image();
    img.onload = () => {
      if (img.decode) {
        img.decode().then(run).catch(run);
      } else {
        run();
      }
    };
    img.onerror = run; // never block on a failed load
    // Read the media query directly — this effect runs once on mount
    img.src = window.matchMedia(DESKTOP_MQ).matches ? LANDING_BG_WEB : LANDING_BG;

    return () => { cancelled = true; };
  }, []);

  // Unlock Chair bg as soon as user reaches Abuja (one-way latch).
  useEffect(() => {
    if (contentPhase === 'abuja' && !chairBgUnlocked) setChairBgUnlocked(true);
  }, [contentPhase, chairBgUnlocked]);

  // Fire once when the spring settles at the Chair position (cam≥1.95),
  // then wait 300ms before revealing the arrow so the camera has a moment
  // of stillness before the UI appears.
  useEffect(() => {
    if (contentPhase !== 'chair' || chairReadyFiredRef.current) return;

    const unsub = cam.on('change', (v: number) => {
      if (v >= 1.95 && !chairReadyFiredRef.current) {
        chairReadyFiredRef.current = true;
        setTimeout(() => setChairCameraReady(true), 300);
        unsub();
      }
    });
    return unsub;
  // cam is a stable MotionValue reference — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentPhase]);

  // Fire once when the spring settles at the Abuja position so content
  // never appears while the camera is still moving.
  useEffect(() => {
    if (contentPhase !== 'abuja') return;
    abujaReadyFiredRef.current = false;

    const unsub = cam.on('change', (v: number) => {
      if (v >= 0.95 && !abujaReadyFiredRef.current) {
        abujaReadyFiredRef.current = true;
        setAbujaContentReady(true);
        unsub();
      }
    });
    return unsub;
  // cam is a stable MotionValue reference — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentPhase]);

  // chairRevealControls: no-op on 'chair' entry (spring deceleration handles
  // the zoom); used for 'registry' to softly zoom+blur the chair behind the sheet.
  const chairRevealControls = useAnimation();
  useEffect(() => {
    if (contentPhase === 'registry') {
      chairRevealControls.start({
        scale: 1.06,
        filter: 'blur(3px)',
        transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
      });
    }
  // chairRevealControls is a stable object — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentPhase]);

  // ── SINGLE VIRTUAL CAMERA ─────────────────────────────────────────────────
  // rawCam jumps immediately; cam (spring) eases into every position.
  // All world transforms are derived from cam — it never resets.
  //
  // Spring tuned to ~1.8s travel for the Landing→Abuja drone shot:
  //   stiffness=30, damping=14  →  ζ≈1.28 (overdamped, no bounce)
  //   cam reaches 0.95 at ≈1.5s, 0.99 at ≈2.0s (within spec's 1.8–2.5s window)
  const rawCam = useMotionValue(CAM_LANDING);
  const cam    = useSpring(rawCam, { stiffness: 30, damping: 14, mass: 1 });

  // ── LANDING BG ──────────────────────────────────────────────────────────────
  // Layers stack landing → abuja → chair in DOM order, so each incoming scene
  // fades in OVER a still-opaque outgoing scene. The outgoing layer never
  // drops out — the black page base can never show through mid-transition.
  //
  // Camera language differs per viewport: the portrait mobile art supports a
  // dramatic dive-through zoom, but the landscape web images have the
  // invitation text painted in — zooming through them fills the screen with
  // giant blurry letters. Desktop gets a gentle push + crossfade instead.
  const landingScale   = useTransform(cam, [0, 1.0],        [1.0, 3.8]);
  const landingY       = useTransform(cam, [0, 1.0],        ['0%', '-6%']);
  const landingTopGrad = useTransform(cam, [0, 0.28, 0.52], [1, 0.15, 0]);

  // ── ABUJA BG ────────────────────────────────────────────────────────────────
  const abujaScale   = useTransform(cam, [0.55, 1.0, 2],   [2.2, 1.0, 1.24]);
  const abujaY       = useTransform(cam, [0.55, 1.0],      ['4%', '0%']);
  // Fades in over the still-opaque landing and then NEVER fades out — the
  // chair layer (drawn above it) becomes fully opaque and simply covers it.
  // Fading abuja out at the end risked exposing the black page base if the
  // chair image hadn't finished loading/decoding (opacity 1 on an unloaded
  // <img> renders nothing) — that was the residual abuja→chair black flash.
  const abujaOpacity = useTransform(cam, [0.55, 1.0],                [0, 1]);
  const abujaGrad    = useTransform(cam, [0.65, 0.9, 1.0, 1.5, 1.9], [0, 0, 1, 0.3, 0]);

  // ── CHAIR BG ────────────────────────────────────────────────────────────────
  // Reaches full opacity by cam≈1.8 (≈700ms into the spring travel from cam=1)
  // so the chair is fully established while the spring is still decelerating.
  const chairOpacity = useTransform(cam, [1.0, 1.4, 1.8], [0, 0.5, 1]);
  const chairScale   = useTransform(cam, [1, 2],           [1.48, 1.0]);
  const chairDim     = useTransform(cam, [1.3, 2.0],       [0, 1]);

  // ── DESKTOP CAMERA STRIP ─────────────────────────────────────────────────
  // On desktop every scene is a static painting laid side-by-side on a
  // 300vw strip. The ONLY animated property in the whole scene graph is
  // this wrapper's translateX — one GPU transform of one composited layer.
  // The images themselves carry no transforms, no opacity animation,
  // nothing: they are frozen. The spring pans the camera; each scene is
  // already in its final position when the camera arrives.
  const stripX = useTransform(cam, [0, 2], ['0vw', '-200vw']);

  // ── ABUJA TEXT OPACITY ───────────────────────────────────────────────────
  // Driven by the same spring so text and background fade in sync.
  // Matches the abujaOpacity background curve so they disappear together.
  const abujaTextOpacity: MotionValue<number> = useTransform(
    cam, [0.9, 1.0, 1.35, 1.65], [0, 1, 0.4, 0]
  );

  // ── NAVIGATION ───────────────────────────────────────────────────────────
  function goTo(phase: ContentPhase, camTarget?: number) {
    if (camTarget !== undefined) rawCam.set(camTarget);
    setContentPhase(phase);
  }

  // Scene images already decoded — camera can depart immediately.
  const decodedScenesRef = useRef(new Set<string>());

  // Camera transitions between scenes only start once the destination image
  // is downloaded AND decoded. An <img> that hasn't finished loading paints
  // nothing regardless of its opacity, so departing early exposed whatever
  // was behind the empty layer (the black page base) — the source of the
  // scene-transition flashes. Normally the image finishes while the user
  // reads the current screen and this gate is a no-op; on a fast tap-through
  // it holds the current scene the extra beat the decode needs. A 5s
  // failsafe departs anyway so a broken image can never strand the user.
  function goToScene(phase: ContentPhase, camTarget: number, src: string) {
    if (decodedScenesRef.current.has(src)) {
      goTo(phase, camTarget);
      return;
    }
    let done = false;
    const proceed = () => {
      if (done) return;
      done = true;
      decodedScenesRef.current.add(src);
      goTo(phase, camTarget);
    };
    const img = new window.Image();
    img.onload  = () => { img.decode ? img.decode().then(proceed).catch(proceed) : proceed(); };
    img.onerror = proceed;
    img.src = src;
    // Cached images can be complete synchronously without firing onload
    if (img.complete) {
      img.decode ? img.decode().then(proceed).catch(proceed) : proceed();
    }
    setTimeout(proceed, 5000);
  }

  async function handleRSVPSubmit(data: RSVPFormValues, attending: boolean): Promise<string | void> {
    setGuestName(data.fullName);
    const requestingPlusOne = attending && data.plusOneRequested;
    setPlusOneRequested(requestingPlusOne);
    const result = await submitRSVP({
      full_name:             data.fullName,
      email:                 data.email,
      phone:                 data.phone || null,
      attending,
      plus_one_requested:    requestingPlusOne,
      plus_one_name:         requestingPlusOne ? (data.plusOneName || null) : null,
      plus_one_relationship: requestingPlusOne ? (data.plusOneRelationship || null) : null,
    });
    if (result.error === 'duplicate') {
      goTo('duplicate');
    } else if (result.error) {
      return result.error;
    } else {
      goTo(attending ? 'confirmation' : 'regrets');
    }
  }


  return (
    <div
      className="w-full flex justify-center relative overflow-hidden"
      style={{ minHeight: '100dvh', background: '#0d0908' }}
    >

      {/* ══ STAGE ══════════════════════════════════════════════════════════════
          Fills the full viewport on every screen size. Scene backgrounds
          are full-bleed (object-cover); sheet-style UI is centered into a
          readable column via SheetLayer so it never stretches edge-to-edge. */}
      <motion.div
        style={{
          width: '100%', maxWidth: '100%', height: '100dvh',
          position: 'relative', flexShrink: 0, zIndex: 10,
        }}
      >
        {/* Inner shell — clips content; full-bleed, no rounding */}
        <div
          className="relative w-full h-full overflow-hidden"
          style={{ borderRadius: 0 }}
        >

          {/* ══ WORLD CAMERA ════════════════════════════════════════════════
              Desktop: three static paintings on a 300vw strip; the camera
              (one wrapper's translateX) is the only thing that ever moves.
              Mobile: original stacked layers with opacity/scale driven by
              the same spring.                                              */}

          {isDesktop ? (
            <motion.div
              aria-hidden="true"
              className="absolute top-0 left-0 h-full flex pointer-events-none"
              style={{ width: '300vw', x: stripX, willChange: 'transform' }}
            >
              {/* Panel 1 — Landing (static painting) */}
              <div className="relative h-full flex-shrink-0" style={{ width: '100vw' }}>
                <img
                  src={landingSrc}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover select-none"
                  draggable={false}
                />
              </div>

              {/* Panel 2 — Abuja (static painting + frozen legibility grad) */}
              <div className="relative h-full flex-shrink-0" style={{ width: '100vw' }}>
                {abujaBgUnlocked && (
                  <img
                    src={abujaSrc}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover select-none"
                    draggable={false}
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.42) 78%, rgba(0,0,0,0.6) 100%)' }}
                />
              </div>

              {/* Panel 3 — Chair (static painting + frozen vignette) */}
              <div className="relative h-full flex-shrink-0" style={{ width: '100vw' }}>
                {chairBgUnlocked && (
                  <img
                    src={chairSrc}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover select-none"
                    style={{ filter: 'brightness(0.9) contrast(1.06)' }}
                    draggable={false}
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse 58% 62% at 50% 44%, transparent 28%, rgba(0,0,0,0.18) 68%, rgba(0,0,0,0.42) 100%)' }}
                />
              </div>
            </motion.div>
          ) : (
            <>
              {/* Landing background — zooms toward the dome as camera advances.
                  Never fades out: abuja (above it) becomes opaque and covers it,
                  so an unloaded upper layer can only ever reveal this scene,
                  never the black page base. */}
              <motion.img
                src={landingSrc}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                style={{ scale: landingScale, y: landingY, objectPosition: 'center 30%' }}
              />
              {/* Landing cream overlays — give the overlay text legibility */}
              <motion.div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{
                  opacity: landingTopGrad,
                  background: 'linear-gradient(180deg, rgba(253,249,243,0.92) 0%, rgba(253,249,243,0.8) 35%, rgba(253,249,243,0) 100%)',
                }}
              />
              <motion.div
                aria-hidden="true"
                className="absolute bottom-0 left-0 right-0 h-[20%] pointer-events-none"
                style={{
                  opacity: landingTopGrad,
                  background: 'linear-gradient(0deg, rgba(253,249,243,0.6) 0%, rgba(253,249,243,0) 100%)',
                }}
              />

              {/* Abuja background — deferred until after intro so only Landing
                  fetches on page load; user reads Landing for several seconds
                  giving the browser time to download this before they tap.     */}
              {abujaBgUnlocked && (
                <>
                  <motion.img
                    src={abujaSrc}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                    style={{ opacity: abujaOpacity, scale: abujaScale, y: abujaY, objectPosition: 'center 40%' }}
                  />
                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      opacity: abujaGrad,
                      background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.72) 100%)',
                    }}
                  />
                </>
              )}

              {/* Chair background — deferred until user reaches Abuja so the
                  Chair image fetches during the ~5–15s they spend there.    */}
              {chairBgUnlocked && (
                <>
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ scale: 1 }}
                    animate={chairRevealControls}
                  >
                    <motion.img
                      src={chairSrc}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                      style={{
                        opacity: chairOpacity,
                        scale: chairScale,
                        objectPosition: 'center 45%',
                        filter: 'brightness(0.86) contrast(1.10)',
                      }}
                    />
                  </motion.div>

                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      opacity: chairOpacity,
                      background: 'radial-gradient(ellipse 58% 62% at 50% 44%, transparent 28%, rgba(0,0,0,0.18) 68%, rgba(0,0,0,0.42) 100%)',
                    }}
                  />

                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      opacity: chairDim,
                      background: 'rgba(28, 24, 20, 0.09)',
                    }}
                  />
                </>
              )}
            </>
          )}

          {/* ══ CINEMATIC INTRO LAYER ══════════════════════════════════════
              Black screen → bg fade-in with push-in and blur-sharpen.
              Unmounts the instant the world camera takes over.            */}
          {introPhase !== 'done' && (
            <div
              className="absolute inset-0 z-[5] pointer-events-none"
              style={{ background: '#050201' }}
            >
              <motion.img
                src={landingSrc}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover object-top select-none"
                initial={isDesktop ? { opacity: 0 } : { opacity: 0, scale: 1.03, filter: 'blur(8px)' }}
                animate={introPhase === 'revealing'
                  ? (isDesktop ? { opacity: 1 } : { opacity: 1, scale: 1.0, filter: 'blur(0px)' })
                  : (isDesktop ? { opacity: 0 } : { opacity: 0, scale: 1.03, filter: 'blur(8px)' })}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          )}

          {/* ══ CONTENT LAYER ═══════════════════════════════════════════════
              Components contain no backgrounds — only UI: text, forms,
              decorations, interactive controls.                            */}
          <AnimatePresence mode="sync">

            {contentPhase === 'landing' && (
              <div key="landing" className="absolute inset-0 z-10">
                <Landing onNext={() => goToScene('abuja', CAM_ABUJA, abujaSrc)} startContent={startContent} isDesktop={isDesktop} />
              </div>
            )}

            {/* Keep Abuja mounted during the chair transition so its text fades
                out via the camera MotionValue — not via AnimatePresence.
                It unmounts silently once the camera has fully settled (chairCameraReady),
                by which point abujaTextOpacity is already 0. */}
            {abujaContentReady && (contentPhase === 'abuja' || (contentPhase === 'chair' && !chairCameraReady)) && (
              <div key="abuja" className="absolute inset-0 z-10">
                <Abuja onNext={() => goToScene('chair', CAM_CHAIR, chairSrc)} abujaTextOpacity={abujaTextOpacity} isDesktop={isDesktop} />
              </div>
            )}

            {contentPhase === 'chair' && (
              <div key="chair" className="absolute inset-0 z-10">
                <Chair onNext={() => goTo('rsvp-decision')} cameraReady={chairCameraReady} />
              </div>
            )}

            {contentPhase === 'rsvp-decision' && (
              <SheetLayer key="rsvp-decision" isDesktop={isDesktop}>
                <RSVPDecision
                  onAttending={()    => goTo('rsvp-form-attending')}
                  onNotAttending={() => goTo('rsvp-form-regrets')}
                  onClose={()        => goTo('chair')}
                />
              </SheetLayer>
            )}

            {contentPhase === 'rsvp-form-attending' && (
              <SheetLayer key="rsvp-form-attending" isDesktop={isDesktop}>
                <RSVPForm
                  attending={true}
                  onSubmit={(data) => handleRSVPSubmit(data, true)}
                  onBack={() => goTo('rsvp-decision')}
                />
              </SheetLayer>
            )}

            {contentPhase === 'rsvp-form-regrets' && (
              <SheetLayer key="rsvp-form-regrets" isDesktop={isDesktop}>
                <RSVPForm
                  attending={false}
                  onSubmit={(data) => handleRSVPSubmit(data, false)}
                  onBack={() => goTo('rsvp-decision')}
                />
              </SheetLayer>
            )}

            {contentPhase === 'confirmation' && (
              <SheetLayer key="confirmation" isDesktop={isDesktop}>
                <Confirmation guestName={guestName} onRegistry={() => goTo('registry')} plusOneRequested={plusOneRequested} />
              </SheetLayer>
            )}

            {contentPhase === 'regrets' && (
              <SheetLayer key="regrets" isDesktop={isDesktop}>
                <Regrets guestName={guestName} onRegistry={() => goTo('registry')} />
              </SheetLayer>
            )}

            {contentPhase === 'registry' && (
              <SheetLayer key="registry" isDesktop={isDesktop}>
                <Registry />
              </SheetLayer>
            )}

            {contentPhase === 'duplicate' && (
              <SheetLayer key="duplicate" isDesktop={isDesktop}>
                <Duplicate onRegistry={() => goTo('registry')} />
              </SheetLayer>
            )}

          </AnimatePresence>

        </div>
      </motion.div>
    </div>
  );
}
