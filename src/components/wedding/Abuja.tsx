import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation, type MotionValue } from 'framer-motion';
import GlassPill from './GlassPill';

interface AbujaProps {
  onNext: () => void;
  abujaTextOpacity: MotionValue<number>;
}

export default function Abuja({ onNext, abujaTextOpacity }: AbujaProps) {
  const [ctaVisible, setCtaVisible] = useState(false);
  const [ctaGone, setCtaGone] = useState(false);
  const arrowControls = useAnimation();

  const bounceArrow = useCallback(async () => {
    for (let i = 0; i < 3; i++) {
      await arrowControls.start({ y: [0, -6, 0], transition: { duration: 0.5, ease: 'easeInOut' } });
      await new Promise(r => setTimeout(r, 180));
    }
  }, [arrowControls]);

  useEffect(() => {
    let cancelled = false;
    let idleTimer: ReturnType<typeof setTimeout>;

    const run = async () => {
      if (cancelled) return;
      setCtaVisible(true);
      await new Promise(r => setTimeout(r, 450));
      if (cancelled) return;
      await bounceArrow();
      if (cancelled) return;
      idleTimer = setTimeout(run, 7000);
    };

    const initial = setTimeout(run, 1500);
    return () => { cancelled = true; clearTimeout(initial); clearTimeout(idleTimer); };
  }, [bounceArrow]);

  function handleNext() {
    if (ctaGone) return;
    setCtaGone(true);
    onNext();
  }

  return (
    // Opacity is driven entirely by the world camera spring (abujaTextOpacity)
    // so the text fades in perfect sync with the background — no independent
    // AnimatePresence exit timeline that could create a visual jump.
    <motion.div
      className="relative w-full h-full"
      style={{ opacity: abujaTextOpacity }}
    >
      {/* Text block — anchored to lower third */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 pb-14 flex flex-col items-center gap-0 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.7 }}
      >
        <span
          className="text-[13px] italic mb-1.5"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#e8d5a3', letterSpacing: '0.06em' }}
        >
          You're Invited
        </span>
        <h1
          className="text-[34px] font-semibold leading-[1.15] mb-5"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#fff', textShadow: '0 2px 20px rgba(0,0,0,0.45)' }}
        >
          It's happening<br />in{' '}
          <span style={{ color: '#e8d5a3', fontStyle: 'italic' }}>Abuja</span>
        </h1>
        <div className="w-10 h-[1.5px] bg-[#c9a84c] opacity-70 mb-5" />

        {/* Location badge */}
        <GlassPill>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span
            className="text-[15px] font-medium"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: 'rgba(253,249,243,0.92)', letterSpacing: '0.03em' }}
          >
            Asokoro, Abuja · Sept 26, 2026
          </span>
        </GlassPill>

        {/* CTA — appears after 3s, disappears on tap */}
        <AnimatePresence>
          {!ctaGone && (
            <motion.div
              className="mt-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: ctaVisible ? 1 : 0, y: ctaVisible ? 0 : 10 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <GlassPill onClick={handleNext}>
                <span
                  className="text-[15px] italic"
                  style={{ fontFamily: 'Cormorant Garamond, serif', color: 'rgba(253,249,243,0.88)', letterSpacing: '0.03em' }}
                >
                  Tap here to continue
                </span>
              </GlassPill>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
