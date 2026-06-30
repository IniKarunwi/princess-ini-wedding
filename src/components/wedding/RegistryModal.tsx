import { motion, AnimatePresence } from 'framer-motion';

interface RegistryModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RegistryModal({ open, onClose }: RegistryModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="relative z-10 w-full rounded-t-3xl px-6 pt-8 pb-12 text-center"
            style={{ background: 'rgba(253,249,243,0.99)' }}
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 22 }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a7a70" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>

            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: '#f5ede0', border: '1.5px solid #e8d5a3' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12v10H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
              </svg>
            </div>

            <p
              className="text-[13px] italic mb-1"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: '#7a1a2e' }}
            >
              Our Registry
            </p>
            <h2
              className="text-[28px] font-semibold mb-2"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c2420' }}
            >
              Coming Soon
            </h2>
            <div className="w-12 h-px bg-[#e8d5a3] mx-auto mb-5" />
            <p
              className="text-[16px] leading-relaxed mb-6"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
            >
              We're putting the finishing touches on our registry.
              <br /><br />
              Thank you for celebrating with us.
            </p>
            <p
              className="text-[17px] italic"
              style={{ fontFamily: 'Pinyon Script, cursive', color: '#7a1a2e', fontSize: 24 }}
            >
              Princess &amp; IniOluwa ❤️
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
