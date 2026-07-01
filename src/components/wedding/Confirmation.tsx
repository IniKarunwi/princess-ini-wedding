import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ConfirmationProps {
  guestName: string;
  onRegistry: () => void;
  plusOneRequested?: boolean;
}

function Confetti() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {[...Array(24)].map((_, i) => {
        const colors = ['#e8b8b0', '#c4daa8', '#c9a84c', '#e8d5a3', '#f0c8b8', '#7a1a2e'];
        const color = colors[i % colors.length];
        const left = `${(i * 4.2) % 100}%`;
        const delay = (i * 0.12) % 2;
        const duration = 2.2 + (i % 5) * 0.3;
        return (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-sm"
            style={{ left, top: '-8px', background: color }}
            animate={{
              y: ['0vh', '110vh'],
              x: [0, ((i % 7) - 3) * 40],
              rotate: [0, 360 * (i % 2 === 0 ? 1 : -1)],
              opacity: [1, 1, 0],
            }}
            transition={{ duration, delay, ease: 'easeIn', repeat: Infinity, repeatDelay: 1 }}
          />
        );
      })}
    </div>
  );
}


const cardVariants = {
  hidden: { y: 90, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { delay: 0.08, duration: 0.65, type: 'spring' as const, damping: 26, stiffness: 190 },
  },
  exit: {
    y: 60,
    opacity: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as number[] },
  },
};

const itemVariants = {
  hidden: { y: 14, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as number[] } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.35 } },
};

export default function Confirmation({ guestName, onRegistry, plusOneRequested }: ConfirmationProps) {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const details = [
    {
      icon: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>,
      label: 'Guest Name',
      value: guestName || 'Your Name',
    },
    {
      icon: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
      label: 'Date',
      value: '26th September, 2026',
    },
    {
      icon: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
      label: 'Venue',
      value: 'Asokoro, Abuja',
    },
  ];

  return (
    <motion.div
      className="relative w-full h-full flex flex-col justify-end"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {showConfetti && <Confetti />}

      <motion.div
        className="relative z-10 rounded-t-3xl px-6 pt-7 pb-11 shadow-2xl"
        style={{ background: 'rgba(253,249,243,0.97)' }}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">
          {/* Check icon */}
          <motion.div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'linear-gradient(135deg, #d4edda, #b8dfc4)', border: '2px solid #6dbf85' }}
            variants={{
              hidden: { scale: 0, opacity: 0 },
              visible: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } },
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2d7a4a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          </motion.div>

          <motion.p
            className="text-[15px] italic text-center mb-1"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#7a1a2e' }}
            variants={itemVariants}
          >
            You're on the list!
          </motion.p>
          <motion.h2
            className="text-[22px] font-semibold text-center mb-2"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c2420' }}
            variants={itemVariants}
          >
            See You at the Wedding
          </motion.h2>
          <motion.div className="w-12 h-px bg-[#e8d5a3] mx-auto mb-4" variants={itemVariants} />

          {/* +1 pending notice */}
          {plusOneRequested && (
            <motion.div
              className="rounded-[14px] px-4 py-3 mb-4 text-center"
              style={{ background: '#fdf6ee', border: '1.5px solid #e8d5a3' }}
              variants={itemVariants}
            >
              <p className="text-[13px] leading-relaxed" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}>
                Your RSVP has been received. Your attendance is confirmed.
                <br /><br />
                Your +1 request has also been received and is currently{' '}
                <span style={{ color: '#c9a84c', fontWeight: 600 }}>pending review</span>.
                We'll reach out if we need any additional information before confirming your guest reservation.
              </p>
            </motion.div>
          )}

          {/* Detail rows */}
          {details.map((row, i) => (
            <motion.div
              key={i}
              className="flex items-center gap-2.5 py-3"
              style={{ borderBottom: i < 2 ? '1px solid #e8d8c8' : 'none' }}
              variants={itemVariants}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#f5ede0' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {row.icon}
                </svg>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] mb-0.5" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#8a7a70' }}>
                  {row.label}
                </div>
                <div className="text-[15px] font-medium" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c2420' }}>
                  {row.value}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Buttons */}
          <motion.div className="mt-5 flex flex-col gap-2.5" variants={itemVariants}>
            <button
              className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-full text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ fontFamily: 'Cormorant Garamond, serif', background: '#2d5a3d' }}
              onClick={() => {
                const date = '20260926T080000Z/20260926T200000Z';
                window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=Princess+%26+IniOluwa+Wedding&dates=${date}&location=Asokoro,+Abuja,+Nigeria`, '_blank');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
              </svg>
              Add to Calendar
            </button>
            <button
              onClick={onRegistry}
              className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-full text-[16px] font-medium transition-opacity hover:opacity-80"
              style={{ fontFamily: 'Cormorant Garamond, serif', background: 'rgba(253,249,243,0.9)', color: '#5a4a40', border: '1.5px solid #e8d8c8' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a4a40" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12v10H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
              </svg>
              View our wedding Registry
            </button>
          </motion.div>
        </motion.div>
      </motion.div>

    </motion.div>
  );
}
