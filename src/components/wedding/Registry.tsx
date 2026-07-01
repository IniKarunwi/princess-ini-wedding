import { useState } from 'react';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
//  Registry configuration — edit names, numbers, and banks here only.
// ─────────────────────────────────────────────────────────────────────────────

const SHARED_ACCOUNTS = [
  {
    currency: 'NGN', symbol: '₦', label: 'Naira',
    name: 'Princess Victor Sado',
    bank: 'Zenith Bank',
    number: '2218670750',
    extras: [] as { label: string; value: string }[],
  },
  {
    currency: 'USD', symbol: '$', label: 'US Dollars',
    name: 'IniOluwa Joel Karunwi',
    bank: '',
    number: '212108860233',
    extras: [
      { label: 'ACH Routing', value: '101019644' },
      { label: 'Wire Routing', value: '101019644' },
    ],
  },
  {
    currency: 'GBP', symbol: '£', label: 'GB Pounds',
    name: 'IniOluwa Joel Karunwi',
    bank: 'Clear Junction Limited',
    number: '37325094',
    extras: [
      { label: 'IBAN',      value: 'GB66CLJU04130737325094' },
      { label: 'Swift',     value: 'CLJUGB21XXX' },
      { label: 'Sort Code', value: '041307' },
    ],
  },
];

const REGISTRY = {
  homeEssentials: {
    number: 1,
    title: 'Our Home Essentials',
    image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=900&q=85',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
        <path d="M9 21V12h6v9"/>
      </svg>
    ),
    accounts: SHARED_ACCOUNTS,
  },
  honeymoon: {
    number: 2,
    title: 'Our Honeymoon',
    image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=85',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 21 4s-2 0-3.5 1.5L14 9 5.8 7.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 3.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
      </svg>
    ),
    accounts: SHARED_ACCOUNTS,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  Copy-to-clipboard button
// ─────────────────────────────────────────────────────────────────────────────
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={label ? `Copy ${label}` : 'Copy account number'}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
      }}
      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
      style={{ background: copied ? '#e8f5e9' : '#f5ede0' }}
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2d7a4a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Registry section card — matches the mockup layout exactly
// ─────────────────────────────────────────────────────────────────────────────
type Section = typeof REGISTRY.homeEssentials;

function RegistryCard({ section, delay }: { section: Section; delay: number }) {
  return (
    <motion.div
      className="rounded-[20px] overflow-hidden"
      style={{
        background: '#ffffff',
        border: '1px solid #ede4d4',
        boxShadow: '0 2px 20px rgba(44,36,32,0.07), 0 1px 4px rgba(44,36,32,0.04)',
      }}
      initial={{ y: 36, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Hero image — inset with padding, own rounded corners */}
      <div className="px-3 pt-3">
        <div className="w-full overflow-hidden rounded-[14px]" style={{ aspectRatio: '16/9' }}>
          <img
            src={section.image}
            alt={section.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      </div>

      {/* Section title */}
      <div className="px-4 pt-4 pb-1 flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: '#fdf6ea', border: '1.5px solid #e8d5a3' }}
        >
          {section.icon}
        </div>
        <h2
          className="text-[19px] font-semibold"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1a1410', letterSpacing: '-0.01em' }}
        >
          {section.number}. {section.title}
        </h2>
      </div>

      {/* Divider */}
      <div className="mx-4 mt-3" style={{ height: '1px', background: '#ede4d4' }} />

      {/* Account rows */}
      <div className="px-4 pb-4">
        {section.accounts.map((acct, i) => (
          <div
            key={acct.currency}
            className="py-3.5"
            style={{ borderBottom: i < section.accounts.length - 1 ? '1px solid #f0e8dc' : 'none' }}
          >
            {/* Main row: badge + label + account number + copy */}
            <div className="flex items-center gap-3">
              {/* Currency badge */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#fdf6ea', border: '1.5px solid #e8d5a3' }}
              >
                <span
                  className="text-[15px] font-semibold leading-none"
                  style={{ fontFamily: 'Cormorant Garamond, serif', color: '#c9a84c' }}
                >
                  {acct.symbol}
                </span>
              </div>

              {/* Currency label */}
              <div className="flex-shrink-0" style={{ minWidth: 72 }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: '#8a7a70' }}>
                  {acct.label}
                </p>
                {acct.bank ? (
                  <p className="text-[10px] mt-0.5" style={{ color: '#b0a090' }}>{acct.bank}</p>
                ) : null}
              </div>

              {/* Account number + name — right-aligned */}
              <div className="flex-1 text-right">
                <p className="text-[14px] font-semibold" style={{ fontFamily: 'monospace', color: '#2c2420', letterSpacing: '0.03em' }}>
                  {acct.number}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#8a7a70' }}>{acct.name}</p>
              </div>

              {/* Copy account number */}
              <CopyButton text={acct.number} label="account number" />
            </div>

            {/* Extra fields (routing, IBAN, Swift, Sort Code) */}
            {acct.extras.length > 0 && (
              <div className="mt-2 ml-12 flex flex-col gap-1.5">
                {acct.extras.map(ex => (
                  <div key={ex.label} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: '#b0a090' }}>
                      {ex.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium" style={{ fontFamily: 'monospace', color: '#5a4a40' }}>
                        {ex.value}
                      </span>
                      <CopyButton text={ex.value} label={ex.label} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Registry scene
// ─────────────────────────────────────────────────────────────────────────────
export default function Registry() {
  return (
    <motion.div
      className="absolute inset-0 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

        {/* Transparent spacer — blurred venue background shows through */}
        <div style={{ flex: '0 0 22vh', minHeight: 80 }} />

        {/* Registry card — rises from below */}
        <motion.div
          className="flex-1 rounded-t-[28px] shadow-2xl"
          style={{ background: '#fdf9f3' }}
          initial={{ y: 110, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.85, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Drag handle indicator */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full" style={{ background: '#ddd3c5' }} />
          </div>

          <div
            className="px-4 pt-5"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 36px)' }}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <motion.div
              className="text-center mb-6"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <p
                className="text-[14px] italic mb-1"
                style={{ fontFamily: 'Cormorant Garamond, serif', color: '#c9a84c', letterSpacing: '0.04em' }}
              >
                With Love
              </p>
              <h1
                className="text-[38px] font-semibold leading-none mb-4"
                style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1a1410', letterSpacing: '-0.01em' }}
              >
                Registry
              </h1>
              {/* Gold divider */}
              <div className="flex items-center justify-center">
                <div className="h-px w-20" style={{ background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)' }} />
              </div>
            </motion.div>

            {/* ── Card 1 ─────────────────────────────────────────────────── */}
            <div className="mb-4">
              <RegistryCard section={REGISTRY.homeEssentials} delay={0.38} />
            </div>

            {/* ── Card 2 ─────────────────────────────────────────────────── */}
            <div className="mb-6">
              <RegistryCard section={REGISTRY.honeymoon} delay={0.50} />
            </div>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <motion.p
              className="text-center text-[15px] italic leading-relaxed mb-2"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: '#8a7a70' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.68, ease: [0.22, 1, 0.36, 1] }}
            >
              Thank you for celebrating with us in any way you can.
            </motion.p>
            <motion.p
              className="text-center text-[26px]"
              style={{ fontFamily: 'Pinyon Script, cursive', color: '#7a1a2e' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.78, ease: 'easeOut' }}
            >
              Princess &amp; IniOluwa
            </motion.p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
