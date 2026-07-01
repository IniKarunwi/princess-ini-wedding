import { useState, useEffect, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  useAnimation,
} from 'framer-motion';
import Landing from '@/components/wedding/Landing';
import Abuja from '@/components/wedding/Abuja';
import Chair from '@/components/wedding/Chair';
import AbujaChairTransition from '@/components/wedding/AbujaChairTransition';
import RSVPDecision from '@/components/wedding/RSVPDecision';
import RSVPForm, { RSVPFormValues } from '@/components/wedding/RSVPForm';
import Confirmation from '@/components/wedding/Confirmation';
import Regrets from '@/components/wedding/Regrets';
import Registry from '@/components/wedding/Registry';
import { submitRSVP } from '@/lib/supabase';

// Background images — managed exclusively here, not in child components
const LANDING_BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fd62d4227-36a4-4315-a204-31d5edd5b01a?alt=media&token=60dd1bf9-31b0-4738-b105-6b2d335fd535';
const ABUJA_BG   = 'https://storage.googleapis.com/banani-generated-images/generated-images/451cac94-c73a-4eeb-927c-365eeff38b2c.jpg';
const CHAIR_BG   = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fee3e746a-48b4-46f7-980b-17b9cac93870?alt=media&token=ddb6776b-257e-49c1-b642-0f32242d8932';

// Camera positions along the journey:
//   0 = Landing  |  1 = Abuja  |  2 = Chair / form screens
const CAM_LANDING = 0;
const CAM_ABUJA   = 1;
const CAM_CHAIR   = 2;

type ContentPhase =
  | 'landing'
  | 'abuja'
  | 'abuja-to-chair'
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

// ─ desktop cinematic background helpers ──────────────────────────────────────
type DesktopBgKey = 'landing' | 'abuja' | 'chair';

function getDesktopBgKey(phase: ContentPhase): DesktopBgKey {
  if (phase === 'landing') return 'landing';
  if (phase === 'abuja' || phase === 'abuja-to-chair') return 'abuja';
  return 'chair';
}

const DESKTOP_BG_SRCS: Record<DesktopBgKey, string> = {
  landing: LANDING_BG,
  abuja:   ABUJA_BG,
  chair:   CHAIR_BG,
};

// SVG fractal-noise tile for the film grain overlay
const GRAIN_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n' color-interpolation-filters='linearRGB'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E";

// Ambient particles — positioned in side margins, only visible on desktop
const DESKTOP_PARTICLES = [
  { size: 2, color: 'rgba(201,168,76,0.55)',  left: '6%',  top: '12%', dur: 14, delay: 0,   drift: 28 },
  { size: 3, color: 'rgba(232,213,163,0.38)', left: '89%', top: '20%', dur: 19, delay: 2.5, drift: 22 },
  { size: 2, color: 'rgba(201,168,76,0.42)',  left: '4%',  top: '55%', dur: 21, delay: 6,   drift: 18 },
  { size: 2, color: 'rgba(232,181,176,0.32)', left: '92%', top: '65%', dur: 17, delay: 9,   drift: 25 },
  { size: 3, color: 'rgba(201,168,76,0.28)',  left: '9%',  top: '80%', dur: 23, delay: 4,   drift: 20 },
  { size: 2, color: 'rgba(232,213,163,0.48)', left: '87%', top: '42%', dur: 18, delay: 12,  drift: 26 },
  { size: 2, color: 'rgba(240,200,184,0.35)', left: '7%',  top: '35%', dur: 16, delay: 7,   drift: 15 },
  { size: 2, color: 'rgba(201,168,76,0.30)',  left: '91%', top: '84%', dur: 25, delay: 15,  drift: 19 },
];

export default function Wedding() {
  const [contentPhase, setContentPhase] = useState<ContentPhase>('landing');
  const [guestName, setGuestName] = useState('');

  const [introPhase, setIntroPhase]     = useState<IntroPhase>('loading');
  const [startContent, setStartContent] = useState(false);

  // Tracks whether we're on a desktop viewport (≥768px)
  const [isDesktop, setIsDesktop] = useState(false);

  // Abuja content is held until the spring camera has settled at cam≈1
  const [abujaContentReady, setAbujaContentReady] = useState(false);
  const abujaReadyFiredRef = useRef(false);

  // Lazy-load scene backgrounds: only fetch what the user is about to see.
  // abujaBgUnlocked: true after the intro fades (~1.4s) — user is reading
  //   Landing, giving the Abuja image time to download before they tap.
  // chairBgUnlocked: true once the user reaches Abuja — Chair image loads
  //   during the ~5–15s the user spends on the Abuja screen.
  const abujaBgUnlocked = startContent;
  const [chairBgUnlocked, setChairBgUnlocked] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
    img.src = LANDING_BG;

    return () => { cancelled = true; };
  }, []);

  // Unlock Chair bg as soon as user reaches Abuja (one-way latch).
  useEffect(() => {
    if (contentPhase === 'abuja' && !chairBgUnlocked) setChairBgUnlocked(true);
  }, [contentPhase, chairBgUnlocked]);

  // Fire once when the spring settles at the Abuja position so content
  // never appears while the camera is still moving.
  useEffect(() => {
    if (contentPhase !== 'abuja') {
      setAbujaContentReady(false);
      return;
    }
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

  // Chair reveal micro-push: the wrapper starts 4% wider than final so the
  // camera makes one last gentle push-in (750ms) before the arrow appears.
  const chairRevealControls = useAnimation();
  useEffect(() => {
    if (contentPhase === 'chair') {
      chairRevealControls.start({
        scale: 1,
        filter: 'blur(0px)',
        transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
      });
    } else if (contentPhase === 'registry') {
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
  const landingScale   = useTransform(cam, [0, 1.0],                    [1.0, 3.8]);
  const landingY       = useTransform(cam, [0, 1.0],                    ['0%', '-6%']);
  const landingOpacity = useTransform(cam, [0, 0.62, 0.88, 1.05],       [1, 1, 0.15, 0]);
  const landingTopGrad = useTransform(cam, [0, 0.28, 0.52],             [1, 0.15, 0]);

  // ── ABUJA BG ────────────────────────────────────────────────────────────────
  const abujaScale   = useTransform(cam, [0.55, 1.0, 2],                [2.2, 1.0, 1.24]);
  const abujaY       = useTransform(cam, [0.55, 1.0],                   ['4%', '0%']);
  const abujaOpacity = useTransform(cam, [0.55, 0.82, 1.0, 1.6, 2.2],  [0, 0.8, 1, 0.5, 0]);
  const abujaGrad    = useTransform(cam, [0.65, 0.9, 1.0, 1.7, 2.2],   [0, 0, 1, 0.5, 0]);

  // ── CHAIR BG ────────────────────────────────────────────────────────────────
  const chairOpacity = useTransform(cam, [1.2, 1.85, 2.0], [0, 0.35, 1]);
  const chairScale   = useTransform(cam, [1, 2],            [1.48, 1.0]);
  const chairDim     = useTransform(cam, [1.3, 2.0],        [0, 1]);

  // ── NAVIGATION ───────────────────────────────────────────────────────────
  function goTo(phase: ContentPhase, camTarget?: number) {
    if (camTarget !== undefined) rawCam.set(camTarget);
    setContentPhase(phase);
  }

  async function handleRSVPSubmit(data: RSVPFormValues, attending: boolean) {
    setGuestName(data.fullName);
    const result = await submitRSVP({
      full_name:   data.fullName,
      email:       data.email,
      phone:       data.phone,
      guest_count: data.guestCount,
      attending,
    });
    if (result.error === 'duplicate') {
      goTo('duplicate');
    } else {
      goTo(attending ? 'confirmation' : 'regrets');
    }
  }

  const desktopBgKey = getDesktopBgKey(contentPhase);

  return (
    <div
      className="w-full flex justify-center relative overflow-hidden"
      style={{ minHeight: '100dvh', background: '#0d0908' }}
    >

      {/* ══ DESKTOP CINEMATIC BACKGROUND ══════════════════════════════════════
          Three blurred scene images crossfade as the guest progresses.
          z-index 1–3 keeps them behind the phone (z-index 10) on all screen
          sizes — on mobile the phone covers them entirely; on desktop they
          fill the side margins. No Tailwind breakpoint classes needed.      */}

      {/* Blurred scene image layers — one per phase group, crossfading.
          Each layer is only mounted once its source image is already
          being fetched by the world camera, so no extra network cost.
          Only the active layer runs the ambient zoom; idle layers hold
          still at scale 1.1 so they don't drive unnecessary GPU frames. */}
      {(Object.keys(DESKTOP_BG_SRCS) as DesktopBgKey[]).map(key => {
        if (key === 'abuja' && !abujaBgUnlocked) return null;
        if (key === 'chair' && !chairBgUnlocked) return null;
        const isActive = desktopBgKey === key;
        return (
          <motion.img
            key={`dbg-${key}`}
            src={DESKTOP_BG_SRCS[key]}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            style={{
              filter: 'blur(52px) saturate(1.3) brightness(0.52)',
              zIndex: 1,
              willChange: isActive ? 'opacity, transform' : 'auto',
            }}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{
              opacity: isActive ? 1 : 0,
              scale:   isActive ? [1.10, 1.17, 1.10] : 1.1,
            }}
            transition={{
              opacity: { duration: 1.6, ease: 'easeInOut' },
              scale:   isActive
                ? { duration: 30, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
                : { duration: 0 },
            }}
          />
        );
      })}

      {/* Warm luxury color grade — golden-rose tint */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          background: 'linear-gradient(135deg, rgba(201,168,76,0.08) 0%, transparent 45%, rgba(122,26,46,0.06) 100%)',
        }}
      />

      {/* Radial vignette — darkens edges, pulls focus to the phone */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          background: 'radial-gradient(ellipse 55% 68% at 50% 50%, transparent 18%, rgba(8,5,3,0.48) 60%, rgba(3,1,0,0.90) 100%)',
        }}
      />

      {/* Film grain — fractal-noise SVG tile, barely perceptible */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 3,
          opacity: 0.028,
          backgroundImage: `url("${GRAIN_URL}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* Soft light bloom — warm glow from the center of the scene */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          zIndex: 2,
          width: '44%', height: '58%',
          left: '28%', top: '21%',
          background: 'radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 68%)',
          filter: 'blur(28px)',
        }}
      />

      {/* Ambient floating dust particles — only instantiated on desktop
          where they're visible; saves 8 animated nodes on mobile.        */}
      {isDesktop && DESKTOP_PARTICLES.map((p, i) => (
        <motion.div
          key={`dp-${i}`}
          aria-hidden="true"
          className="absolute rounded-full pointer-events-none"
          style={{
            width: p.size, height: p.size,
            background: p.color,
            left: p.left, top: p.top,
            zIndex: 3,
          }}
          animate={{
            y:       [0, -p.drift, 0],
            opacity: [0.2, 1, 0.2],
          }}
          transition={{
            duration: p.dur,
            delay:    p.delay,
            repeat:   Infinity,
            ease:     'easeInOut',
          }}
        />
      ))}

      {/* ══ PHONE SHADOW + EDGE GLOW ═══════════════════════════════════════════
          Positioned at the same place as the phone but outside its
          overflow:hidden shell, so the shadow bleeds into the margins.      */}
      {isDesktop && (
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 520,
            zIndex: 9,
            borderRadius: 32,
            boxShadow: [
              '0 60px 160px rgba(0,0,0,0.80)',
              '0 20px 60px rgba(0,0,0,0.55)',
              '0 0 0 1px rgba(255,255,255,0.04)',
              '0 0 90px rgba(201,168,76,0.10)',
              'inset 0 1px 0 rgba(255,255,255,0.07)',
            ].join(', '),
          }}
        />
      )}

      {/* ══ PHONE ══════════════════════════════════════════════════════════════
          Floats gently on desktop (y ±3px over 7s).
          Fills the full viewport on mobile — no visible float there.         */}
      <motion.div
        style={{
          width: '100%', maxWidth: 520, height: '100dvh',
          position: 'relative', flexShrink: 0, zIndex: 10,
        }}
        animate={isDesktop ? { y: [0, -3, 0] } : { y: 0 }}
        transition={{ duration: 7, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
      >
        {/* Inner phone shell — clips content; rounded on desktop */}
        <div
          className="relative w-full h-full overflow-hidden"
          style={{ borderRadius: isDesktop ? 28 : 0 }}
        >

          {/* ══ WORLD CAMERA ════════════════════════════════════════════════
              All images always present in the DOM. The spring drives their
              opacity and scale continuously — the camera never cuts.        */}

          {/* Landing background — zooms toward the dome as camera advances */}
          <motion.img
            src={LANDING_BG}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            style={{ opacity: landingOpacity, scale: landingScale, y: landingY, objectPosition: 'center 30%' }}
          />
          {/* Landing cream overlays — fade out before the zoom gets tight */}
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
                src={ABUJA_BG}
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
              Chair image fetches during the ~5–15s they spend there,
              well before AbujaChairTransition fires.                      */}
          {chairBgUnlocked && (
            <>
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ scale: 1.04 }}
                animate={chairRevealControls}
              >
                <motion.img
                  src={CHAIR_BG}
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

          {/* ══ CINEMATIC INTRO LAYER ══════════════════════════════════════
              Black screen → bg fade-in with push-in and blur-sharpen.
              Unmounts the instant the world camera takes over.            */}
          {introPhase !== 'done' && (
            <div
              className="absolute inset-0 z-[5] pointer-events-none"
              style={{ background: '#050201' }}
            >
              <motion.img
                src={LANDING_BG}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover object-top select-none"
                initial={{ opacity: 0, scale: 1.03, filter: 'blur(8px)' }}
                animate={introPhase === 'revealing'
                  ? { opacity: 1, scale: 1.0, filter: 'blur(0px)' }
                  : { opacity: 0, scale: 1.03, filter: 'blur(8px)' }}
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
                <Landing onNext={() => goTo('abuja', CAM_ABUJA)} startContent={startContent} />
              </div>
            )}

            {contentPhase === 'abuja' && abujaContentReady && (
              <div key="abuja" className="absolute inset-0 z-10">
                <Abuja onNext={() => goTo('abuja-to-chair', CAM_CHAIR)} />
              </div>
            )}

            {contentPhase === 'chair' && (
              <div key="chair" className="absolute inset-0 z-10">
                <Chair onNext={() => goTo('rsvp-decision')} />
              </div>
            )}

            {contentPhase === 'rsvp-decision' && (
              <div key="rsvp-decision" className="absolute inset-0 z-10">
                <RSVPDecision
                  onAttending={()    => goTo('rsvp-form-attending')}
                  onNotAttending={() => goTo('rsvp-form-regrets')}
                  onClose={()        => goTo('chair')}
                />
              </div>
            )}

            {contentPhase === 'rsvp-form-attending' && (
              <div key="rsvp-form-attending" className="absolute inset-0 z-10">
                <RSVPForm
                  attending={true}
                  onSubmit={(data) => handleRSVPSubmit(data, true)}
                  onBack={() => goTo('rsvp-decision')}
                />
              </div>
            )}

            {contentPhase === 'rsvp-form-regrets' && (
              <div key="rsvp-form-regrets" className="absolute inset-0 z-10">
                <RSVPForm
                  attending={false}
                  onSubmit={(data) => handleRSVPSubmit(data, false)}
                  onBack={() => goTo('rsvp-decision')}
                />
              </div>
            )}

            {contentPhase === 'confirmation' && (
              <div key="confirmation" className="absolute inset-0 z-10">
                <Confirmation guestName={guestName} onRegistry={() => goTo('registry')} />
              </div>
            )}

            {contentPhase === 'regrets' && (
              <div key="regrets" className="absolute inset-0 z-10">
                <Regrets guestName={guestName} onRegistry={() => goTo('registry')} />
              </div>
            )}

            {contentPhase === 'registry' && (
              <div key="registry" className="absolute inset-0 z-10">
                <Registry />
              </div>
            )}

            {contentPhase === 'duplicate' && (
              <div
                key="duplicate"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center px-8 text-center"
                style={{ background: 'rgba(253,249,243,0.97)' }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: '#f5ede0', border: '2px solid #e8d5a3' }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </div>
                <h2 className="text-[24px] font-semibold mb-3" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c2420' }}>
                  We've already received your RSVP.
                </h2>
                <p className="text-[18px] italic" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}>
                  Thank you ❤️
                </p>
              </div>
            )}

          </AnimatePresence>

          {/* Dolly transition — rendered above everything, unmounts on completion */}
          {contentPhase === 'abuja-to-chair' && (
            <div className="absolute inset-0 z-20">
              <AbujaChairTransition onComplete={() => setContentPhase('chair')} />
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
}
