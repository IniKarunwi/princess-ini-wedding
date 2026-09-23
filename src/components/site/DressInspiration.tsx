/**
 * The dress guide's own figures, and the guidance beside them.
 *
 * ── Why this is artwork and not a drawing of mine ──────────────────────────
 * This was a hand-built SVG croquis: two flat figures in colours taken from
 * the palette. It was replaced because the palette it was built from was the
 * wrong one, and because the real guide — the sheet guests were posted, at
 * public/email/dress-guide.jpg — already contains the definitive illustration.
 * Cropping that is both more accurate and better drawn than anything reasoned
 * from hexes.
 *
 * The two crops come straight out of that file, so the site, the email and the
 * printed guide cannot disagree about what the day looks like.
 *
 * ── Why the notes are here and not only on the sheet ───────────────────────
 * "Eden in Full Bloom" and nine circles tell a guest the colours and nothing
 * about the formality — the palette alone could reasonably be read as leave to
 * turn up in a sage sundress. The guide's actual instructions are transcribed
 * in DRESS, so the page can say black tie, floor-length, fascinators, and
 * "kindly refrain from traditional/native attire", which is the one line a
 * guest would be embarrassed to discover on the day.
 */

import { useEffect, useState } from 'react';
import { DRESS } from '@/lib/wedding';
import { C, F } from '@/lib/design';

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 860px)');
    setWide(mq.matches);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

type Side = typeof DRESS.gentlemen | typeof DRESS.ladies;

function Half({ side, image, alt, wide }: {
  side: Side; image: string; alt: string; wide: boolean;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      {/* The crops carry the guide's own near-white paper, which reads as a
          pale rectangle against the section's deeper ivory. multiply dissolves
          it: white becomes the background exactly, the dark suits stay dark,
          and the gowns take a slight warm cast that matches the rest of the
          page. The wrapper needs its own background for the blend to resolve
          against — inside <Reveal>'s animated opacity there is no other
          backdrop to find. */}
      <div style={{ background: C.ivoryDeep, marginBottom: '1.5rem' }}>
        <img
          src={image}
          alt={alt}
          loading="lazy"
          decoding="async"
          sizes={wide ? '44vw' : '88vw'}
          style={{
            width: '100%', height: 'auto', display: 'block',
            mixBlendMode: 'multiply',
          }}
        />
      </div>

      <h3 style={{
        fontFamily: F.serif, fontWeight: 300, color: C.green,
        fontSize: 'clamp(1.25rem, 4.5vw, 1.6rem)', margin: 0, letterSpacing: '0.02em',
      }}>
        {side.heading}
      </h3>
      <p style={{
        fontFamily: F.sans, fontSize: '0.62rem', fontWeight: 600,
        letterSpacing: '0.26em', textTransform: 'uppercase', color: C.gold,
        margin: '0.5rem 0 1.25rem',
      }}>
        {side.label}
      </p>

      {/* A list, not a paragraph. These are four separate decisions a guest
          makes while standing in front of a wardrobe. */}
      <ul style={{
        listStyle: 'none', padding: 0, margin: '0 auto',
        maxWidth: '24rem', textAlign: 'left',
      }}>
        {side.notes.map((note) => (
          <li key={note} style={{
            fontFamily: F.serif, fontSize: '0.98rem', lineHeight: 1.7,
            color: C.muted, fontWeight: 300, margin: '0 0 0.7rem',
            paddingLeft: '1rem', position: 'relative',
          }}>
            <span aria-hidden style={{ position: 'absolute', left: 0, color: C.gold }}>·</span>
            {note}
          </li>
        ))}
      </ul>

      <p style={{
        fontFamily: F.sans, fontSize: '0.6rem', fontWeight: 600,
        letterSpacing: '0.18em', textTransform: 'uppercase', color: C.green,
        margin: '1.5rem auto 0', maxWidth: '20rem', lineHeight: 1.9,
      }}>
        {side.close}
      </p>
    </div>
  );
}

export default function DressInspiration() {
  const wide = useWide();

  return (
    <div style={{ margin: 'clamp(3rem, 9vw, 4.5rem) auto 0', maxWidth: '60rem' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: wide ? '1fr 1fr' : '1fr',
        gap: wide ? 'clamp(2.5rem, 5vw, 4rem)' : 'clamp(3rem, 10vw, 4rem)',
        alignItems: 'start',
      }}>
        <Half
          side={DRESS.gentlemen}
          image="/photos/dress-gentlemen.jpg"
          alt="Three men in black tie — two black tuxedos and one navy"
          wide={wide}
        />
        <Half
          side={DRESS.ladies}
          image="/photos/dress-ladies.jpg"
          alt="Four women in floor-length gowns with fascinators — magenta, coral, yellow and sage"
          wide={wide}
        />
      </div>
    </div>
  );
}
