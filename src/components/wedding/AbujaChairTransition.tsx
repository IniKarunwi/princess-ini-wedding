import { useEffect } from 'react';
import { motion, useMotionValue, animate, useTransform } from 'framer-motion';

const ABUJA_BG = 'https://storage.googleapis.com/banani-generated-images/generated-images/451cac94-c73a-4eeb-927c-365eeff38b2c.jpg';
const CHAIR_BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fee3e746a-48b4-46f7-980b-17b9cac93870?alt=media&token=ddb6776b-257e-49c1-b642-0f32242d8932';

interface Props {
  onComplete: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Three-act dolly shot:
//
//  Act 1 (p 0 → 0.42, 1.7s) — Approach
//    Camera charges toward the venue. The dome and entrance grow to fill the
//    frame. Accelerating pace, no cut, no pause.
//
//  Act 2 (p 0.42 → 0.68, 1.1s) — Threshold
//    The entrance fills the viewport. A brief darkness as the camera passes
//    through the doors. The interior begins to reveal itself.
//
//  Act 3 (p 0.68 → 1.0, 2.2s) — Down the aisle, decelerate
//    The venue interior appears. Camera continues forward, decelerating
//    heavily. The reserved chair rises to the focal point. The camera
//    eases to a complete stop approximately 1 metre in front of the chair.
//
//  Total: ~5 seconds.
//  onComplete fires only when the camera has fully stopped.
// ─────────────────────────────────────────────────────────────────────────────

export default function AbujaChairTransition({ onComplete }: Props) {
  const p = useMotionValue(0);

  // Act 1 + 2: Abuja zooms aggressively into the entrance
  const abujaScale   = useTransform(p, [0, 1],            [1.0, 5.5]);
  const abujaOpacity = useTransform(p, [0, 0.38, 0.65],   [1,   0.75, 0]);

  // Act 2: brief darkness at the doorway threshold
  const darkOpacity  = useTransform(p, [0.38, 0.52, 0.70], [0, 1.0,  0]);

  // Act 3: interior reveals, camera decelerates to a stop at the chair
  // — opacity fades in as we enter
  const chairOpacity = useTransform(p, [0.47, 0.68, 0.92], [0, 0.45, 1]);
  // — very subtle scale: 1.08 → 1.0  (camera was still moving slightly
  //   when interior first appears; it decelerates to a rest)
  const chairScale   = useTransform(p, [0.47, 1.0],        [1.08, 1.0]);
  // — pan: image starts slightly shifted down the aisle (showing more of
  //   the interior depth), settles to the natural framing as camera stops
  const chairY       = useTransform(p, [0.47, 1.0],        ['10%', '0%']);

  useEffect(() => {
    let stopped = false;

    (async () => {
      // Act 1: camera charges toward entrance (slightly accelerating push)
      await animate(p, 0.42, {
        duration: 1.7,
        ease: [0.16, 0, 0.72, 1],
      });
      if (stopped) return;

      // Act 2: constant drive through the threshold (no easing, pure momentum)
      await animate(p, 0.68, {
        duration: 1.1,
        ease: 'linear',
      });
      if (stopped) return;

      // Act 3: fly down the aisle with heavy deceleration — the camera
      //   absorbs all its kinetic energy and comes to rest at the chair
      await animate(p, 1, {
        duration: 2.2,
        ease: [0.42, 0, 0.05, 1],
      });
      if (stopped) return;

      onComplete();
    })();

    return () => { stopped = true; };
  }, []);                                        // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // Full-screen overlay; sits above the world camera during the shot.
    // No enter/exit animation — it appears instantly when the user taps
    // and disappears the moment the camera stops (seamless handoff to Chair).
    <div className="absolute inset-0 overflow-hidden">

      {/* Abuja exterior — zooms forward until the entrance consumes the frame */}
      <motion.img
        src={ABUJA_BG}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        style={{
          opacity: abujaOpacity,
          scale: abujaScale,
          objectPosition: 'center 35%',   // tilt slightly up toward dome
        }}
      />

      {/* Chair interior — fades in as the camera enters the venue */}
      <motion.img
        src={CHAIR_BG}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        style={{
          opacity: chairOpacity,
          scale: chairScale,
          y: chairY,
          objectPosition: 'center 45%',
        }}
      />

      {/* Darkness at the threshold — the doorway moment */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: darkOpacity,
          background: '#050201',
        }}
      />
    </div>
  );
}
