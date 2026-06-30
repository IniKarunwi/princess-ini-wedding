import { motion, useReducedMotion } from 'framer-motion';

interface LandingProps {
  onNext: () => void;
  startContent: boolean;
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

// Pre-computed stable values for particles — avoids Math.random() on each render
const PARTICLES = [
  { w: 4, h: 4, color: '#e8b8b0', left: '10%', top: '22%', dur: 3.0, delay: 0.0, dy: -14 },
  { w: 3, h: 3, color: '#c4daa8', left: '21%', top: '38%', dur: 3.5, delay: 0.4, dy: -10 },
  { w: 5, h: 5, color: '#e8b8b0', left: '34%', top: '18%', dur: 4.0, delay: 0.8, dy: -12 },
  { w: 3, h: 3, color: '#c4daa8', left: '48%', top: '42%', dur: 3.2, delay: 1.2, dy: -8  },
  { w: 4, h: 4, color: '#e8b8b0', left: '62%', top: '26%', dur: 3.8, delay: 0.6, dy: -16 },
  { w: 3, h: 3, color: '#c4daa8', left: '74%', top: '34%', dur: 3.4, delay: 1.6, dy: -11 },
  { w: 4, h: 4, color: '#e8b8b0', left: '83%', top: '20%', dur: 4.2, delay: 0.2, dy: -13 },
  { w: 3, h: 3, color: '#c4daa8', left: '90%', top: '46%', dur: 3.6, delay: 1.0, dy: -9  },
];

// Warm shimmer dust — golden tones, very subtle
const SHIMMER = [
  { size: 2, color: '#c9a84c', left: '18%', top: '55%', dur: 5.0, delay: 0.8 },
  { size: 2, color: '#e8d5a3', left: '37%', top: '48%', dur: 6.2, delay: 1.4 },
  { size: 2, color: '#c9a84c', left: '55%', top: '62%', dur: 4.8, delay: 2.1 },
  { size: 2, color: '#f0c8b8', left: '72%', top: '50%', dur: 5.5, delay: 0.5 },
  { size: 2, color: '#e8d5a3', left: '86%', top: '58%', dur: 6.0, delay: 1.9 },
];

export default function Landing({ onNext, startContent }: LandingProps) {
  const reduced = useReducedMotion();

  // When reduced motion is preferred, all elements are immediately visible
  const visible = reduced ? true : startContent;

  function itemAnim(delay: number, extraProps?: object) {
    return {
      initial: { opacity: 0, y: 20 },
      animate: visible ? { opacity: 1, y: 0, ...extraProps } : { opacity: 0, y: 20 },
      transition: { duration: 0.6, delay: reduced ? 0 : delay, ease },
    };
  }

  return (
    <motion.div
      className="relative w-full h-full"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.55, ease }}
    >

      {/* ── Floating ambient particles ──────────────────────────────────────── */}
      {PARTICLES.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none z-[4]"
          style={{ width: p.w, height: p.h, background: p.color, left: p.left, top: p.top }}
          initial={{ opacity: 0 }}
          animate={visible ? { opacity: [0.4, 0.85, 0.4], y: [0, p.dy, 0] } : { opacity: 0 }}
          transition={{
            duration: p.dur,
            delay: reduced ? 0 : 0.5 + p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Warm shimmer dust */}
      {SHIMMER.map((s, i) => (
        <motion.div
          key={`s${i}`}
          className="absolute rounded-full pointer-events-none z-[4]"
          style={{ width: s.size, height: s.size, background: s.color, left: s.left, top: s.top }}
          initial={{ opacity: 0 }}
          animate={visible ? {
            opacity: [0, 0.6, 0, 0.45, 0],
            y: [0, -10, -20],
            scale: [1, 1.5, 0.6],
          } : { opacity: 0 }}
          transition={{
            duration: s.dur,
            delay: reduced ? 0 : s.delay,
            repeat: Infinity,
            repeatDelay: 1.2,
            ease: 'easeOut',
          }}
        />
      ))}

      {/* ── Floral SVG frame ────────────────────────────────────────────────── */}
      <motion.svg
        className="absolute inset-0 w-full h-full z-[3] pointer-events-none"
        viewBox="0 0 376 798"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        {...itemAnim(0.48)}
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
        <path d="M170 0 Q 180 18 188 10 Q 196 18 206 0" stroke="#b0c888" strokeWidth="1.2" fill="none" opacity="0.5"/>
        <circle cx="188" cy="12" r="4" fill="#f0c8b8" opacity="0.6"/>
        <circle cx="188" cy="12" r="2" fill="#dca898" opacity="0.55"/>
      </motion.svg>

      {/* ── Invitation text ─────────────────────────────────────────────────── */}
      <div className="absolute top-9 left-0 right-0 z-[5] flex flex-col items-center text-center px-7">

        {/* 1. "You're Invited" */}
        <motion.span
          className="text-[11px] tracking-[0.28em] font-semibold uppercase mb-0.5"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2d5a3d' }}
          {...itemAnim(0)}
        >
          You're Invited
        </motion.span>

        {/* 2. "to the wedding of" */}
        <motion.span
          className="text-base italic mb-0"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
          {...itemAnim(0.12)}
        >
          to the wedding of
        </motion.span>

        {/* 3. Names */}
        <motion.div className="leading-none text-center mt-0.5" {...itemAnim(0.24)}>
          <span
            className="block text-[76px] leading-none"
            style={{ fontFamily: 'Pinyon Script, cursive', color: '#7a1a2e', textShadow: '0 1px 18px rgba(253,249,243,1), 0 0 56px rgba(253,249,243,0.9)' }}
          >
            Princess &amp;
          </span>
          <span
            className="block text-[76px] leading-none"
            style={{ fontFamily: 'Pinyon Script, cursive', color: '#7a1a2e', textShadow: '0 1px 18px rgba(253,249,243,1), 0 0 56px rgba(253,249,243,0.9)' }}
          >
            IniOluwa
          </span>
        </motion.div>

        {/* 4. Date */}
        <motion.div className="flex items-center gap-2.5 mt-2" {...itemAnim(0.36)}>
          <div className="w-8 h-px bg-[#c9a84c] opacity-80" />
          <span
            className="text-[11px] tracking-[0.18em] font-semibold uppercase"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
          >
            September 26, 2026
          </span>
          <div className="w-8 h-px bg-[#c9a84c] opacity-80" />
        </motion.div>

      </div>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <motion.button
        onClick={onNext}
        className="absolute z-10 right-5"
        style={{ top: '56%', transform: 'translateY(-50%)' }}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.65, delay: reduced ? 0 : 0.6, ease }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="flex flex-col items-center gap-1">
          <div
            className="rounded-[20px] px-4 py-[7px] text-[13px] font-semibold italic whitespace-nowrap"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              background: 'rgba(253,249,243,0.97)',
              border: '1.5px solid #e8d5a3',
              color: '#2c2420',
              boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
            }}
          >
            Tap to Begin
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
