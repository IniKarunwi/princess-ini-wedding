import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import GlassPill from './GlassPill';

interface ChairProps {
  onNext: () => void;
}

export default function Chair({ onNext }: ChairProps) {
  const [arrowVisible, setArrowVisible] = useState(false);
  const [arrowGone, setArrowGone] = useState(false);
  const [tapped, setTapped] = useState(false);
  const arrowControls = useAnimation();

  const bounceArrow = useCallback(async () => {
    for (let i = 0; i < 3; i++) {
      await arrowControls.start({ y: [0, -10, 0], transition: { duration: 0.5, ease: 'easeInOut' } });
      await new Promise(r => setTimeout(r, 200));
    }
  }, [arrowControls]);

  useEffect(() => {
    let cancelled = false;
    let idleTimer: ReturnType<typeof setTimeout>;

    const run = async () => {
      if (cancelled) return;
      setArrowVisible(true);
      await new Promise(r => setTimeout(r, 500));
      if (cancelled) return;
      await bounceArrow();
      if (cancelled) return;
      idleTimer = setTimeout(run, 7000);
    };

    // Delay slightly longer than the camera spring settles (~1.5s) so
    // the arrow appears after the scene has arrived, not mid-zoom.
    const initial = setTimeout(run, 1500);
    return () => { cancelled = true; clearTimeout(initial); clearTimeout(idleTimer); };
  }, [bounceArrow]);

  function handleTap() {
    if (tapped) return;
    setTapped(true);
    setArrowGone(true);
    onNext();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTap(); }
  }

  return (
    // Content-only overlay — background is managed by the world camera in Wedding.tsx.
    // Fade in with a delay so the camera spring has time to zoom in before UI appears.
    <motion.div
      className="relative w-full h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.55, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Pulsing warm glow — positioned behind the chair in the artwork */}
      <motion.div
        className="absolute z-[2] rounded-full pointer-events-none"
        style={{
          width: '52%', paddingBottom: '52%',
          left: '24%', top: '18%',
          background: 'radial-gradient(circle, rgba(201,168,76,0.22) 0%, rgba(201,168,76,0) 70%)',
          filter: 'blur(18px)',
        }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Chair hit area — floats gently, covers the full chair */}
      <motion.div
        role="button"
        tabIndex={0}
        aria-label="Claim My Seat"
        onClick={handleTap}
        onKeyDown={handleKeyDown}
        className="absolute z-[5]"
        style={{ top: '10%', left: '18%', width: '64%', height: '60%', cursor: 'pointer', outline: 'none' }}
        animate={tapped ? { scale: 0.98 } : { y: [0, -3, 0] }}
        transition={tapped
          ? { duration: 0.18, ease: 'easeOut' }
          : { duration: 5.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
        }
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Occasional floral shimmer */}
        <motion.div
          className="absolute inset-0 rounded-sm pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,245,210,0) 30%, rgba(255,245,210,0.18) 50%, rgba(255,245,210,0) 70%)',
            backgroundSize: '200% 200%',
          }}
          animate={{ backgroundPosition: ['200% 200%', '-50% -50%', '200% 200%'] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1 }}
        />
      </motion.div>

      {/* Tap ripple */}
      <AnimatePresence>
        {tapped && (
          <motion.div
            className="absolute z-[4] rounded-full pointer-events-none"
            style={{ width: '60%', paddingBottom: '60%', left: '20%', top: '15%', border: '1.5px solid rgba(201,168,76,0.55)' }}
            initial={{ opacity: 0.8, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.4 }}
            exit={{}}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Arrow + glass pill — fades in after camera settles, disappears on tap */}
      <AnimatePresence>
        {!arrowGone && (
          <motion.div
            className="absolute z-[6] flex flex-col items-center pointer-events-none"
            style={{ bottom: '28px', left: '50%', transform: 'translateX(-50%)', width: '90%' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: arrowVisible ? 1 : 0 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: 0.5 }}
          >
            <motion.div animate={arrowControls} style={{ marginBottom: 10 }}>
              <svg width="52" height="64" viewBox="0 0 52 64" fill="none">
                <path d="M26 60 C26 60, 26 36, 26 18" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#glow)"/>
                <path d="M16 28 L26 14 L36 28" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#glow)"/>
                <defs>
                  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="blur"/>
                    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>
              </svg>
            </motion.div>
            <GlassPill>
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', fontWeight: 500, color: 'rgba(253,249,243,0.92)', letterSpacing: '0.02em', textAlign: 'center' }}>
                Tap the chair to claim your seat
              </span>
            </GlassPill>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
