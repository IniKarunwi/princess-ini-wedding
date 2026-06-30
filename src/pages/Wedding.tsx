import { useState, useEffect, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import Landing from '@/components/wedding/Landing';
import Abuja from '@/components/wedding/Abuja';
import Chair from '@/components/wedding/Chair';
import AbujaChairTransition from '@/components/wedding/AbujaChairTransition';
import RSVPDecision from '@/components/wedding/RSVPDecision';
import RSVPForm, { RSVPFormValues } from '@/components/wedding/RSVPForm';
import Confirmation from '@/components/wedding/Confirmation';
import Regrets from '@/components/wedding/Regrets';
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
  | 'duplicate';

// ─ intro phase ───────────────────────────────────────────────────────────────
// 'loading'   – image not yet ready, black screen shown
// 'revealing' – image decoded, fade-in + blur-sharpen running (~1.1s)
// 'done'      – intro layer unmounts; world camera bg takes over seamlessly
type IntroPhase = 'loading' | 'revealing' | 'done';

export default function Wedding() {
  const [contentPhase, setContentPhase] = useState<ContentPhase>('landing');
  const [guestName, setGuestName] = useState('');

  const [introPhase, setIntroPhase]     = useState<IntroPhase>('loading');
  const [startContent, setStartContent] = useState(false);

  // Abuja content is held until the spring camera has settled at cam≈1
  const [abujaContentReady, setAbujaContentReady] = useState(false);
  const abujaReadyFiredRef = useRef(false);

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
  // Camera pushes aggressively toward the dome (1× → 3.8×) as it rises (-6% y).
  // Opacity stays full until the scene is deeply zoomed (cam 0.62), then fades
  // rapidly — the tight zoom hides the crossfade with the Abuja image.
  const landingScale   = useTransform(cam, [0, 1.0],                    [1.0, 3.8]);
  const landingY       = useTransform(cam, [0, 1.0],                    ['0%', '-6%']);
  const landingOpacity = useTransform(cam, [0, 0.62, 0.88, 1.05],       [1, 1, 0.15, 0]);

  // Landing cream overlays — fade early so they don't fight the zoom
  const landingTopGrad = useTransform(cam, [0, 0.28, 0.52],             [1, 0.15, 0]);

  // ── ABUJA BG ────────────────────────────────────────────────────────────────
  // Enters at 2.2× zoom (matching the tight zoom-in on the dome) and decelerates
  // to 1× — the illusion of one continuous camera rising over the dome and
  // settling into the aerial view.
  const abujaScale   = useTransform(cam, [0.55, 1.0, 2],                [2.2, 1.0, 1.24]);
  const abujaY       = useTransform(cam, [0.55, 1.0],                   ['4%', '0%']);
  const abujaOpacity = useTransform(cam, [0.55, 0.82, 1.0, 1.6, 2.2],  [0, 0.8, 1, 0.5, 0]);
  const abujaGrad    = useTransform(cam, [0.65, 0.9, 1.0, 1.7, 2.2],   [0, 0, 1, 0.5, 0]);

  // ── CHAIR BG ────────────────────────────────────────────────────────────────
  // Fades in as camera arrives at cam=2; stays for all form screens
  const chairOpacity = useTransform(cam, [1.2, 1.85, 2.0], [0, 0.35, 1]);
  const chairScale   = useTransform(cam, [1, 2],            [1.48, 1.0]);

  // Chair + form screens: cream from bottom (makes room for card)
  const chairGrad = useTransform(cam, [1.3, 2.0], [0, 1]);

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

  return (
    <div className="w-full flex justify-center" style={{ minHeight: '100dvh', background: '#2c2420' }}>
      <div className="relative w-full overflow-hidden" style={{ maxWidth: '480px', height: '100dvh' }}>

        {/* ══ WORLD CAMERA ══════════════════════════════════════════════════ */}
        {/* All images are always present in the DOM. The spring drives their
            opacity and scale continuously — the camera never cuts or resets. */}

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

        {/* Abuja background — enters zoomed (continuing drone motion), settles to aerial */}
        <motion.img
          src={ABUJA_BG}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{ opacity: abujaOpacity, scale: abujaScale, y: abujaY, objectPosition: 'center 40%' }}
        />
        {/* Abuja: dark bottom vignette */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: abujaGrad,
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.72) 100%)',
          }}
        />

        {/* Chair background */}
        <motion.img
          src={CHAIR_BG}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{ opacity: chairOpacity, scale: chairScale, objectPosition: 'center 10%' }}
        />
        {/* Chair + form: cream bottom gradient (card surface) */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: chairGrad,
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.04) 38%, rgba(250,245,238,0.7) 58%, rgba(250,245,238,0.97) 76%, rgba(250,245,238,1) 100%)',
          }}
        />

        {/* ══ CINEMATIC INTRO LAYER ════════════════════════════════════════ */}
        {/* Sits above world camera, below content. Black screen → bg fade-in
            with push-in and blur-sharpen. Unmounts the instant the world
            camera bg (same image, already at steady state) takes over.     */}
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

        {/* ══ CONTENT LAYER ═════════════════════════════════════════════════ */}
        {/* Overlaid on the world. Components contain no backgrounds — only
            UI elements: text, forms, decorations, interactive controls.     */}
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
              <Confirmation guestName={guestName} />
            </div>
          )}

          {contentPhase === 'regrets' && (
            <div key="regrets" className="absolute inset-0 z-10">
              <Regrets guestName={guestName} />
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
    </div>
  );
}
