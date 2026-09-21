/**
 * The small pieces the whole site is composed from.
 *
 * Deliberately NOT a component library of cards, panels and containers. These
 * are typographic and compositional primitives — a label, a rule, a reveal, a
 * photograph. If a section needs a box drawn round it to look designed, the
 * composition is wrong and another box will not fix it.
 */

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { C, F, T, label as labelStyle } from '@/lib/design';

/* ── Motion ────────────────────────────────────────────────────────────────── */

/**
 * Reveals a block once, as it enters.
 *
 * IntersectionObserver rather than a scroll listener: no work on the main
 * thread between intersections, which matters on the mid-range Android phones
 * most guests will be holding.
 *
 * Reduced motion is honoured by rendering the element already visible — not by
 * shortening the animation. Someone who has asked for no motion should see a
 * finished page, not a fast one.
 */
export function Reveal({
  children, delay = 0, y = 18, as: Tag = 'div', style,
}: {
  children: ReactNode; delay?: number; y?: number;
  as?: 'div' | 'section' | 'li' | 'figure'; style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced) { setShown(true); return; }
    const el = ref.current;
    if (!el) return;

    // Anything already on screen at mount is shown immediately, with no
    // observer at all.
    //
    // This is not an optimisation — it is a correctness fix. The rootMargin
    // below deliberately shrinks the observer's bottom edge so reveals finish
    // before the guest reaches them. That shrinking means an element sitting
    // in the lowest 12% of the FIRST viewport never intersects, so it stays
    // at opacity 0 until the page is scrolled. The hero's closing line landed
    // exactly there and was invisible on load.
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) { setShown(true); return; }

    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      // Fires a little before the element arrives, so the reveal has finished
      // by the time the guest is actually looking at it.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <Tag
      ref={ref as never}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translate3d(0, ${y}px, 0)`,
        transition: reduced ? 'none'
          : `opacity 1s cubic-bezier(.22,.61,.36,1) ${delay}ms, transform 1.1s cubic-bezier(.22,.61,.36,1) ${delay}ms`,
        willChange: shown ? 'auto' : 'opacity, transform',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/* ── Typography ────────────────────────────────────────────────────────────── */

export function Label({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <p style={{ ...labelStyle(color), ...style }}>{children}</p>;
}

/** The script accent. Used four times on the whole site. */
export function Script({ children, size = 'clamp(1.6rem, 6vw, 2.6rem)', color = C.gold, style }: {
  children: ReactNode; size?: string; color?: string; style?: CSSProperties;
}) {
  return (
    <span style={{ fontFamily: F.script, fontSize: size, color, lineHeight: 1.1, display: 'block', ...style }}>
      {children}
    </span>
  );
}

export function Body({ children, color = C.ink, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return (
    <p style={{
      fontFamily: F.serif, fontSize: T.body, lineHeight: 1.75, color,
      margin: 0, fontWeight: 300, ...style,
    }}>
      {children}
    </p>
  );
}

/** A hairline. The only divider on the site — no borders, no boxes. */
export function Rule({ color = C.rule, width = '100%', style }: { color?: string; width?: string; style?: CSSProperties }) {
  return <div aria-hidden style={{ width, height: 1, background: color, opacity: 0.8, ...style }} />;
}

/**
 * A link that reads as engraving, not as a button.
 *
 * The reference does this everywhere: "View on map", "Join" — small, centred,
 * underlined, no fill, no radius. The underline is drawn as a border so it can
 * sit a comfortable distance below the baseline, which a text-decoration
 * cannot do consistently across browsers.
 *
 * The tap target is padded to 44px of height without the padding being
 * visible, because this has to be usable one-handed at a wedding.
 */
export function Engraved({ children, href, color = C.green, onClick, style }: {
  children: ReactNode; href?: string; color?: string; onClick?: () => void; style?: CSSProperties;
}) {
  const s: CSSProperties = {
    display: 'inline-block',
    fontFamily: F.sans, fontSize: 'clamp(0.66rem, 2.4vw, 0.76rem)',
    fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase',
    color, textDecoration: 'none', cursor: 'pointer',
    background: 'none', border: 0,
    borderBottom: `1px solid ${color}`,
    paddingBottom: '0.5rem',
    // Vertical padding on the LINK would move the underline, so the tap
    // target is grown with margin on a wrapper instead. See <Tap>.
    ...style,
  };
  return href
    ? <Tap><a href={href} style={s}>{children}</a></Tap>
    : <Tap><button type="button" onClick={onClick} style={s}>{children}</button></Tap>;
}

/** Grows a control's hit area to 44px without moving anything visually. */
function Tap({ children }: { children: ReactNode }) {
  return <span style={{ display: 'inline-block', padding: '0.6rem 0', lineHeight: 1 }}>{children}</span>;
}

/* ── Photography ───────────────────────────────────────────────────────────── */

/**
 * A photograph, art-directed.
 *
 * `focal` is an object-position — the crop is chosen per photograph rather
 * than defaulting to centre, because a centred crop of a portrait taken with
 * headroom puts the couple's chins at the bottom of the frame on a phone.
 *
 * Two sources: a 900px file for phones and 1600px for larger screens. The
 * small file is a third of the weight and nobody on a 390px screen can tell.
 */
export function Photo({
  name, alt, ratio, focal = '50% 50%', priority = false, style, grade,
}: {
  name: string; alt: string; ratio: string; focal?: string;
  priority?: boolean; style?: CSSProperties; grade?: CSSProperties['filter'];
}) {
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: ratio, overflow: 'hidden', ...style }}>
      <img
        src={`/photos/${name}.jpg`}
        srcSet={`/photos/${name}-sm.jpg 900w, /photos/${name}.jpg 1600w`}
        sizes="(max-width: 780px) 100vw, 60vw"
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        // The hero must not wait its turn behind anything else.
        fetchPriority={priority ? 'high' : 'auto'}
        decoding={priority ? 'sync' : 'async'}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          objectPosition: focal, display: 'block', filter: grade,
        }}
      />
    </div>
  );
}
