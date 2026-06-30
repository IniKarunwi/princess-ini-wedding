import { motion } from 'framer-motion';

interface LandingProps {
  onNext: () => void;
}

const LANDING_BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fd62d4227-36a4-4315-a204-31d5edd5b01a?alt=media&token=60dd1bf9-31b0-4738-b105-6b2d335fd535';

export default function Landing({ onNext }: LandingProps) {
  return (
    <motion.div
      className="relative w-full h-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.14 }}
      transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Background */}
      <motion.img
        src={LANDING_BG}
        alt="Wedding couple watercolour illustration"
        className="absolute inset-0 w-full h-full object-cover object-top"
        initial={{ scale: 1 }}
        animate={{ scale: 1.04 }}
        transition={{ duration: 18, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
      />

      {/* Fades */}
      <div className="absolute inset-0 z-[2]" style={{
        background: 'linear-gradient(180deg, rgba(253,249,243,0.92) 0%, rgba(253,249,243,0.8) 35%, rgba(253,249,243,0) 100%)'
      }} />
      <div className="absolute bottom-0 left-0 right-0 h-[20%] z-[2]" style={{
        background: 'linear-gradient(0deg, rgba(253,249,243,0.6) 0%, rgba(253,249,243,0) 100%)'
      }} />

      {/* Floral SVG frame */}
      <svg
        className="absolute inset-0 w-full h-full z-[3] pointer-events-none"
        viewBox="0 0 376 798"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path d="M0 0 Q 30 60 10 100" stroke="#a8c890" strokeWidth="1.8" fill="none" opacity="0.75"/>
        <ellipse cx="18" cy="28" rx="9" ry="5" fill="#b8d4a0" opacity="0.7" transform="rotate(-30 18 28)"/>
        <circle cx="22" cy="18" r="8" fill="#e8b8b0" opacity="0.8"/>
        <circle cx="22" cy="18" r="5" fill="#d4948c" opacity="0.7"/>
        <circle cx="22" cy="18" r="2.5" fill="#c07870" opacity="0.9"/>
        <circle cx="40" cy="60" r="7" fill="#f0c8b8" opacity="0.75"/>
        <circle cx="40" cy="60" r="4.5" fill="#dba898" opacity="0.7"/>
        <path d="M376 0 Q 346 60 366 100" stroke="#a8c890" strokeWidth="1.8" fill="none" opacity="0.75"/>
        <circle cx="354" cy="18" r="8" fill="#e8b8b0" opacity="0.8"/>
        <circle cx="354" cy="18" r="5" fill="#d4948c" opacity="0.7"/>
        <circle cx="336" cy="60" r="7" fill="#f0c8b8" opacity="0.75"/>
        <path d="M0 798 Q 30 738 10 698" stroke="#a8c890" strokeWidth="1.8" fill="none" opacity="0.7"/>
        <circle cx="22" cy="780" r="8" fill="#e8b8b0" opacity="0.75"/>
        <circle cx="22" cy="780" r="5" fill="#d4948c" opacity="0.65"/>
        <path d="M376 798 Q 346 738 366 698" stroke="#a8c890" strokeWidth="1.8" fill="none" opacity="0.7"/>
        <circle cx="354" cy="780" r="8" fill="#e8b8b0" opacity="0.75"/>
        <circle cx="354" cy="780" r="5" fill="#d4948c" opacity="0.65"/>
        {/* Top center ornament */}
        <path d="M170 0 Q 180 18 188 10 Q 196 18 206 0" stroke="#b0c888" strokeWidth="1.2" fill="none" opacity="0.5"/>
        <circle cx="188" cy="12" r="4" fill="#f0c8b8" opacity="0.6"/>
        <circle cx="188" cy="12" r="2" fill="#dca898" opacity="0.55"/>
      </svg>

      {/* Floating particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none z-[4]"
          style={{
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            background: i % 2 === 0 ? '#e8b8b0' : '#c4daa8',
            left: `${10 + i * 11}%`,
            top: `${20 + (i % 3) * 20}%`,
          }}
          animate={{
            y: [0, -12, 0],
            opacity: [0.4, 0.9, 0.4],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            delay: i * 0.4,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Text block */}
      <motion.div
        className="absolute top-9 left-0 right-0 z-[5] flex flex-col items-center text-center px-7"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
      >
        <span
          className="text-[11px] tracking-[0.28em] font-semibold uppercase mb-0.5"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2d5a3d' }}
        >
          You're Invited
        </span>
        <span
          className="text-base italic mb-0"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
        >
          to the wedding of
        </span>
        <div className="leading-none text-center mt-0.5">
          <span
            className="block text-[76px] leading-none"
            style={{
              fontFamily: 'Pinyon Script, cursive',
              color: '#7a1a2e',
              textShadow: '0 1px 18px rgba(253,249,243,1), 0 0 56px rgba(253,249,243,0.9)',
            }}
          >
            Princess &amp;
          </span>
          <span
            className="block text-[76px] leading-none"
            style={{
              fontFamily: 'Pinyon Script, cursive',
              color: '#7a1a2e',
              textShadow: '0 1px 18px rgba(253,249,243,1), 0 0 56px rgba(253,249,243,0.9)',
            }}
          >
            IniOluwa
          </span>
        </div>
        <div className="flex items-center gap-2.5 mt-2">
          <div className="w-8 h-px bg-[#c9a84c] opacity-80" />
          <span
            className="text-[11px] tracking-[0.18em] font-semibold uppercase"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
          >
            September 26, 2026
          </span>
          <div className="w-8 h-px bg-[#c9a84c] opacity-80" />
        </div>
      </motion.div>

      {/* CTA */}
      <motion.button
        onClick={onNext}
        className="absolute z-10 right-5"
        style={{ top: '56%', transform: 'translateY(-50%)' }}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="flex flex-col items-center gap-1">
          <div
            className="rounded-[20px] px-4 py-[7px] text-[13px] font-semibold italic whitespace-nowrap shadow-md"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              background: 'rgba(253,249,243,0.97)',
              border: '1.5px solid #e8d5a3',
              color: '#2c2420',
              boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
            }}
          >
            Tap Here to Begin
          </div>
          <svg width="48" height="64" viewBox="0 0 48 64" fill="none" style={{ display: 'block', marginRight: 16 }}>
            <path d="M40 4 C42 20, 36 36, 22 50 C14 58, 6 60, 4 62" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M0 56 L4 63 L11 57" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
      </motion.button>
    </motion.div>
  );
}
