import { motion } from 'framer-motion';

interface VenueProps {
  onNext: () => void;
}

const VENUE_BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Ff51bc0ba-1148-4a67-bbbb-53b6d1c80610?alt=media&token=c0720ecd-1735-4d48-a31e-c5bdd00dcd49';

export default function Venue({ onNext }: VenueProps) {
  return (
    <motion.div
      className="relative w-full h-full overflow-hidden"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      <motion.img
        src={VENUE_BG}
        alt="Wedding venue wide view"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: 'center 20%' }}
        animate={{ scale: [1, 1.07] }}
        transition={{ duration: 9, ease: 'easeInOut' }}
      />

      <div className="absolute inset-0 bg-black/7" />

      {/* CTA */}
      <motion.button
        onClick={onNext}
        className="absolute z-10 top-[38%] left-1/2"
        style={{ transform: 'translate(-50%, -50%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
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
          Find My Seat
        </div>
      </motion.button>

      {/* Bottom hint */}
      <motion.div
        className="absolute bottom-[38px] left-1/2 z-10 flex items-center gap-1.5 rounded-full px-[18px] py-[9px] whitespace-nowrap shadow-md"
        style={{
          transform: 'translateX(-50%)',
          background: 'rgba(253,249,243,0.92)',
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11l19-9-9 19-2-8-8-2z"/>
        </svg>
        <span
          className="text-[13px] font-medium"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
        >
          Find my seat in the hall
        </span>
      </motion.div>
    </motion.div>
  );
}
