import { motion } from 'framer-motion';

interface AbujaProps {
  onNext: () => void;
}

const ABUJA_BG = 'https://storage.googleapis.com/banani-generated-images/generated-images/451cac94-c73a-4eeb-927c-365eeff38b2c.jpg';

export default function Abuja({ onNext }: AbujaProps) {
  return (
    <motion.div
      className="relative w-full h-full overflow-hidden"
      initial={{ opacity: 0, scale: 1.08 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      <motion.img
        src={ABUJA_BG}
        alt="Abuja city watercolour"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: 'center 40%' }}
        animate={{ scale: [1, 1.06] }}
        transition={{ duration: 8, ease: 'easeInOut' }}
      />

      {/* Dark gradient overlay at bottom */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.72) 100%)',
        }}
      />

      {/* CTA button - centered vertically */}
      <motion.button
        onClick={onNext}
        className="absolute z-10 top-[42%] left-1/2"
        style={{ transform: 'translate(-50%, -50%)' }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        whileTap={{ scale: 0.95 }}
      >
        <div
          className="rounded-[20px] px-6 py-[9px] text-[15px] font-semibold italic whitespace-nowrap"
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            background: 'rgba(253,249,243,0.96)',
            border: '1.5px solid #e8d5a3',
            color: '#2c2420',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          Take Me There
        </div>
      </motion.button>

      {/* Bottom text */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-10 pb-14 flex flex-col items-center gap-0 text-center"
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
        <div
          className="flex items-center gap-1.5 rounded-full px-[18px] py-[9px] backdrop-blur-sm"
          style={{
            background: 'rgba(253,249,243,0.14)',
            border: '1px solid rgba(201,168,76,0.5)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span
            className="text-[15px] font-medium"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: 'rgba(253,249,243,0.92)', letterSpacing: '0.03em' }}
          >
            Asokoro, Abuja · Sept 26, 2026
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
