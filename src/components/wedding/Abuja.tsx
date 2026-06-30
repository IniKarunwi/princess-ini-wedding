import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import GlassPill from './GlassPill';

interface AbujaProps {
  onNext: () => void;
}

const ABUJA_BG = 'https://storage.googleapis.com/banani-generated-images/generated-images/451cac94-c73a-4eeb-927c-365eeff38b2c.jpg';

export default function Abuja({ onNext }: AbujaProps) {
  const [ctaVisible, setCtaVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCtaVisible(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      className="relative w-full h-full overflow-hidden"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.16 }}
      transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.img
        src={ABUJA_BG}
        alt="Abuja city watercolour"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: 'center 40%' }}
        animate={{ scale: [1, 1.06] }}
        transition={{ duration: 8, ease: 'easeInOut' }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.72) 100%)',
        }}
      />

      <motion.div
        className="absolute bottom-0 left-0 right-0 z-10 pb-12 flex flex-col items-center gap-0 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.7 }}
      >
        <span
          className="text-[13px] italic mb-1.5"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#e8d5a3', letterSpacing: '0.06em' }}
        >
          You're Invited
        </span>
        <h1
          className="text-[34px] font-semibold leading-[1.15] mb-5"
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#fff',
            textShadow: '0 2px 20px rgba(0,0,0,0.45)',
          }}
        >
          It's happening<br />in{' '}
          <span style={{ color: '#e8d5a3', fontStyle: 'italic' }}>Abuja</span>
        </h1>
        <div className="w-10 h-[1.5px] bg-[#c9a84c] opacity-70 mb-5" />

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

        <motion.div
          className="mt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={ctaVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <GlassPill onClick={onNext}>
            <span
              className="text-[15px] italic"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: 'rgba(253,249,243,0.88)', letterSpacing: '0.03em' }}
            >
              Tap here to continue
            </span>
          </GlassPill>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
