import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import GlassPill from './GlassPill';

interface ChairProps {
  onNext: () => void;
  cameraReady: boolean;
}

export default function Chair({ onNext, cameraReady }: ChairProps) {
  const [arrowVisible, setArrowVisible] = useState(false);
  const [tapped, setTapped] = useState(false);
  const arrowControls = useAnimation();

  const bounceArrow = useCallback(async () => {
    await arrowControls.start({
      y: [0, -10, 0],
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    });
  }, [arrowControls]);

  // Show arrow once the spring has settled and the 300ms breath has passed
  // (the delay lives in Wedding.tsx so this fires at exactly the right moment).
  useEffect(() => {
    if (!cameraReady || arrowVisible) return;
    setArrowVisible(true);
  }, [cameraReady, arrowVisible]);

  // Bounce immediately on first appearance, then every ~8s as a gentle nudge.
  useEffect(() => {
    if (!arrowVisible) return;
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await bounceArrow();
      if (cancelled) return;
      setTimeout(run, 8000);
    };

    const t = setTimeout(run, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [arrowVisible, bounceArrow]);

  function handleTap() {
    if (tapped) return;
    setTapped(true);
    onNext();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTap(); }
  }

  return (
    // Content-only overlay — background is managed by the world camera in Wedding.tsx.
    // Fades in gently so the UI doesn't pop over the still-moving spring.
    <motion.div
      className="relative w-full h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Full-screen hit area — the entire scene is tappable */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Claim my seat"
        onClick={handleTap}
        onKeyDown={handleKeyDown}
        className="absolute inset-0 z-[5]"
        style={{ cursor: 'pointer', outline: 'none' }}
      />

      {/* Tap ripple — expands from centre on click */}
      <AnimatePresence>
        {tapped && (
          <motion.div
            className="absolute z-[4] rounded-full pointer-events-none"
            style={{
              width: '70%', paddingBottom: '70%',
              left: '15%', top: '12%',
              border: '1.5px solid rgba(201,168,76,0.5)',
            }}
            initial={{ opacity: 0.8, scale: 0.5 }}
            animate={{ opacity: 0, scale: 1.5 }}
            exit={{}}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Gold arrow + instruction pill — fade in after camera settles */}
      <AnimatePresence>
        {arrowVisible && !tapped && (
          <motion.div
            className="absolute z-[6] flex flex-col items-center pointer-events-none"
            style={{ bottom: 36, left: '50%', transform: 'translateX(-50%)', width: '90%' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div animate={arrowControls} style={{ marginBottom: 10 }}>
              <svg width="52" height="64" viewBox="0 0 52 64" fill="none">
                <path
                  d="M26 60 C26 60, 26 36, 26 18"
                  stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" fill="none"
                  filter="url(#chair-arrow-glow)"
                />
                <path
                  d="M16 28 L26 14 L36 28"
                  stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"
                  filter="url(#chair-arrow-glow)"
                />
                <defs>
                  <filter id="chair-arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="blur"/>
                    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>
              </svg>
            </motion.div>
            <GlassPill>
              <span
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: 18,
                  fontWeight: 500,
                  color: 'rgba(253,249,243,0.92)',
                  letterSpacing: '0.02em',
                  textAlign: 'center',
                }}
              >
                Tap the chair to claim your seat
              </span>
            </GlassPill>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
