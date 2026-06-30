import { motion } from 'framer-motion';

interface RSVPDecisionProps {
  onAttending: () => void;
  onNotAttending: () => void;
  onClose: () => void;
}

const BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fee3e746a-48b4-46f7-980b-17b9cac93870?alt=media&token=ddb6776b-257e-49c1-b642-0f32242d8932';

export default function RSVPDecision({ onAttending, onNotAttending, onClose }: RSVPDecisionProps) {
  return (
    <motion.div
      className="relative w-full h-full overflow-hidden flex flex-col justify-end"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <img src={BG} alt="Wedding background" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 10%' }} />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.04) 38%, rgba(250,245,238,0.7) 58%, rgba(250,245,238,0.97) 76%, rgba(250,245,238,1) 100%)' }}
      />

      {/* Card */}
      <motion.div
        className="relative z-10 rounded-t-3xl px-6 pb-11 pt-7 shadow-2xl"
        style={{ background: 'rgba(253,249,243,0.97)' }}
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ delay: 0.08, duration: 0.65, type: 'spring', damping: 26, stiffness: 190 }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a7a70" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>

        {/* Icon */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: '#f5ede0', border: '1.5px solid #e8d5a3' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </div>

        <p
          className="text-[15px] italic text-center mb-2"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#7a1a2e', letterSpacing: '0.02em' }}
        >
          We'd like to know…
        </p>
        <h2
          className="text-[26px] font-semibold text-center leading-[1.25] mb-2"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c2420', letterSpacing: '-0.01em' }}
        >
          Will You Be Attending Our Wedding?
        </h2>
        <div className="w-12 h-px bg-[#e8d5a3] mx-auto mb-6" />

        <button
          onClick={onAttending}
          className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-full text-[16px] font-semibold mb-3 text-white transition-opacity hover:opacity-90"
          style={{ fontFamily: 'Cormorant Garamond, serif', background: '#2d5a3d' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          Yes, I'll Be There
        </button>
        <button
          onClick={onNotAttending}
          className="w-full flex items-center justify-center py-4 px-6 rounded-full text-[16px] font-medium transition-opacity hover:opacity-80"
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            background: 'transparent',
            color: '#5a4a40',
            border: '1.5px solid #e8d8c8',
          }}
        >
          Sorry, I Can't Make It
        </button>
      </motion.div>
    </motion.div>
  );
}
