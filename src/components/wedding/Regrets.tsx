import { useState } from 'react';
import { motion } from 'framer-motion';
import RegistryModal from './RegistryModal';

interface RegretsProps {
  guestName: string;
}

const BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fee3e746a-48b4-46f7-980b-17b9cac93870?alt=media&token=ddb6776b-257e-49c1-b642-0f32242d8932';

const cardVariants = {
  hidden: { y: 90, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { delay: 0.08, duration: 0.65, type: 'spring' as const, damping: 26, stiffness: 190 },
  },
};

const itemVariants = {
  hidden: { y: 12, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as number[] } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.35 } },
};

export default function Regrets({ guestName }: RegretsProps) {
  const [registryOpen, setRegistryOpen] = useState(false);

  return (
    <motion.div
      className="relative w-full h-full overflow-hidden flex flex-col justify-end"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <img src={BG} alt="Wedding background" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 10%' }} />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.04) 38%, rgba(250,245,238,0.7) 58%, rgba(250,245,238,0.97) 76%, rgba(250,245,238,1) 100%)' }}
      />

      <motion.div
        className="relative z-10 rounded-t-3xl px-6 pt-7 pb-11 shadow-2xl"
        style={{ background: 'rgba(253,249,243,0.97)' }}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">
          {/* Heart icon */}
          <motion.div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: '#fdf0f0', border: '2px solid #e8b8b0' }}
            variants={{
              hidden: { scale: 0, opacity: 0 },
              visible: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } },
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c07870" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </motion.div>

          <motion.p
            className="text-[15px] italic text-center mb-1"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#7a1a2e' }}
            variants={itemVariants}
          >
            We'll Miss You
          </motion.p>
          <motion.h2
            className="text-[22px] font-semibold text-center mb-2"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c2420' }}
            variants={itemVariants}
          >
            We'll Miss You ❤️
          </motion.h2>
          <motion.div className="w-12 h-px bg-[#e8d5a3] mx-auto mb-4" variants={itemVariants} />

          <motion.p
            className="text-[15px] text-center leading-relaxed mb-6"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
            variants={itemVariants}
          >
            We're sorry you won't be able to celebrate with us
            {guestName ? `, ${guestName.split(' ')[0]}` : ''}.
            <br /><br />
            Thank you for letting us know. Your love and support mean everything to us.
          </motion.p>

          <motion.button
            onClick={() => setRegistryOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-full text-[16px] font-medium transition-opacity hover:opacity-80"
            style={{ fontFamily: 'Cormorant Garamond, serif', background: 'rgba(253,249,243,0.9)', color: '#5a4a40', border: '1.5px solid #e8d8c8' }}
            variants={itemVariants}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a4a40" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12v10H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
            Explore Our Wedding Registry
          </motion.button>
        </motion.div>
      </motion.div>

      <RegistryModal open={registryOpen} onClose={() => setRegistryOpen(false)} />
    </motion.div>
  );
}
