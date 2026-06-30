import { motion } from 'framer-motion';

interface ChairProps {
  onNext: () => void;
}

const CHAIR_BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fee3e746a-48b4-46f7-980b-17b9cac93870?alt=media&token=ddb6776b-257e-49c1-b642-0f32242d8932';

export default function Chair({ onNext }: ChairProps) {
  return (
    <motion.div
      className="relative w-full h-full overflow-hidden"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <motion.img
        src={CHAIR_BG}
        alt="Wedding venue with chair"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: 'center 10%' }}
        animate={{ scale: [1, 1.04], y: [0, -6, 0] }}
        transition={{ duration: 10, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
      />

      <div className="absolute inset-0 bg-black/7" />

      {/* Claim seat annotation */}
      <motion.button
        onClick={onNext}
        className="absolute z-10"
        style={{ top: '24%', left: '50%', transform: 'translateX(-50%)' }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="flex flex-col items-center">
          <div
            className="rounded-[20px] px-6 py-[9px] text-[15px] font-semibold italic whitespace-nowrap mb-0.5"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              background: 'rgba(253,249,243,0.96)',
              border: '1.5px solid #e8d5a3',
              color: '#2c2420',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}
          >
            Claim My Seat
          </div>
          <svg width="32" height="48" viewBox="0 0 32 48" fill="none" style={{ display: 'block', marginTop: 2 }}>
            <path d="M16 3 C16 3, 4 14, 4 28 C4 38, 12 43, 18 44" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M12 40 L18 46 L24 41" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
      </motion.button>

      {/* Bottom hint */}
      <motion.div
        className="absolute bottom-[38px] left-1/2 z-10 flex items-center gap-1.5 rounded-full px-[18px] py-[9px] whitespace-nowrap shadow-md"
        style={{ transform: 'translateX(-50%)', background: 'rgba(253,249,243,0.92)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/>
        </svg>
        <span
          className="text-[13px] font-medium"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
        >
          Tap the chair to RSVP
        </span>
      </motion.div>
    </motion.div>
  );
}
