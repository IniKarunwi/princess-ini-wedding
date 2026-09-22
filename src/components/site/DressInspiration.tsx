/**
 * Two fashion-illustration figures, drawn in the palette the guests were sent.
 *
 * ── Why this is drawn and not photographed ─────────────────────────────────
 * A photograph of two people wearing green would read as an instruction —
 * "wear this" — and it would also be a photograph of somebody, which is the
 * wrong register for a dress code. A croquis is understood by anyone who has
 * ever seen a lookbook: it is a suggestion about colour and formality, not a
 * garment you are being asked to source.
 *
 * ── Every colour here comes from DRESS.swatches ────────────────────────────
 * Nothing is hard-coded. `hex()` looks the values up by their printed names,
 * so if a swatch is ever re-toned the outfits re-tone with it and the two can
 * never disagree. If a name is ever removed from the palette this throws at
 * module load rather than silently falling back to a colour nobody chose.
 *
 * ── Proportion ─────────────────────────────────────────────────────────────
 * Nine heads, not the seven-and-a-half of an actual body. That elongation is
 * the whole visual grammar of fashion illustration and is what keeps these
 * reading as drawings rather than as small people. Faces are left blank for
 * the same reason a tailor's dummy has no face.
 */

import { DRESS } from '@/lib/wedding';
import { C, F } from '@/lib/design';

/** A palette colour, by the name printed under the swatches. */
function hex(name: string): string {
  const found = DRESS.swatches.find(([, n]) => n === name);
  if (!found) throw new Error(`DressInspiration: "${name}" is not in DRESS.swatches`);
  return found[0];
}

const EMERALD   = hex('Emerald');        // his suit
const GREEN     = hex('Garden Green');   // his lapels and tie — tonal, not a second colour
const BLUSH     = hex('Garden Blush');   // her gown
const CHAMPAGNE = hex('Champagne');      // her fascinator and sash, his pocket square
const IVORY     = hex('Ivory');          // his shirt, the feather
const SAGE      = hex('Sage');           // the shadow they stand on
const TERRACOTTA = hex('Terracotta');    // the figures themselves, as turned wood

export default function DressInspiration() {
  return (
    <figure style={{ margin: 'clamp(2.5rem, 8vw, 4rem) auto 0', maxWidth: '34rem', padding: 0 }}>
      <figcaption style={{
        fontFamily: F.sans, fontSize: 'clamp(0.55rem, 2.1vw, 0.65rem)',
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: C.muted, textAlign: 'center', marginBottom: 'clamp(1rem, 4vw, 1.5rem)',
      }}>
        Dress inspiration
      </figcaption>

      {/* One drawing containing both figures rather than two side-by-side
          images: they then scale as a pair, stay side by side at every width
          without a media query, and cannot be broken onto separate lines by
          a container narrower than they are. */}
      <svg
        viewBox="0 0 400 410"
        width="100%"
        height="auto"
        role="img"
        aria-label="Two fashion illustrations — a figure in an emerald suit with a green tie, and a figure in a blush floor-length gown with a champagne fascinator."
        style={{ display: 'block' }}
      >
        {/* The ground. One soft ellipse each, so the figures stand rather
            than float, without drawing a floor. */}
        <ellipse cx="115" cy="396" rx="36" ry="4.5" fill={SAGE} opacity="0.45" />
        <ellipse cx="285" cy="398" rx="50" ry="4.5" fill={SAGE} opacity="0.45" />

        {/* ── HIM ─────────────────────────────────────────────────────── */}
        <g>
          {/* Sleeves before the body, then shaded a touch, so the arm reads
              as an arm rather than widening the jacket into a slab. */}
          <path d="M92,84 C86,112 84,150 86,190 L96,190 C94,150 95,112 99,86 Z" fill={EMERALD} />
          <path d="M138,84 C144,112 146,150 144,190 L134,190 C136,150 135,112 131,86 Z" fill={EMERALD} />
          <path d="M92,84 C86,112 84,150 86,190 L96,190 C94,150 95,112 99,86 Z" fill={TERRACOTTA} opacity="0.14" />
          <path d="M138,84 C144,112 146,150 144,190 L134,190 C136,150 135,112 131,86 Z" fill={TERRACOTTA} opacity="0.14" />
          <ellipse cx="91" cy="196" rx="5" ry="6.5" fill={TERRACOTTA} />
          <ellipse cx="139" cy="196" rx="5" ry="6.5" fill={TERRACOTTA} />

          {/* Head, hair, neck. No features. */}
          <rect x="109.5" y="58" width="11" height="15" fill={TERRACOTTA} />
          <ellipse cx="115" cy="46" rx="13" ry="17" fill={TERRACOTTA} />
          <path d="M102,46 C101,27 108,20 115,20 C122,20 129,27 128,46 C126,34 122,30 115,30 C108,30 104,34 102,46 Z" fill={EMERALD} />

          {/* Trousers. The notch between the legs is what stops a suit
              reading as a column dress at this scale. */}
          <path d="M93,196 L137,196 L133,384 L121,384 L115,258 L109,384 L97,384 Z" fill={EMERALD} />
          <path d="M96,384 L110,384 L110,392 L93,392 Z" fill={TERRACOTTA} />
          <path d="M120,384 L134,384 L137,392 L120,392 Z" fill={TERRACOTTA} />

          {/* Jacket, then lapels, then the shirt and tie on top of both — so
              the collar frames the shirt instead of covering it. */}
          <path d="M92,84 C94,76 100,71 107,69 L115,79 L123,69 C130,71 136,76 138,84 L136,152 L137,198 L93,198 L94,152 Z" fill={EMERALD} />
          <path d="M106,69 L115,80 L110,126 L100,90 Z" fill={GREEN} />
          <path d="M124,69 L115,80 L120,126 L130,90 Z" fill={GREEN} />
          <path d="M107,71 L115,80 L123,71 L121,120 L115,127 L109,120 Z" fill={IVORY} />
          <path d="M115,82 L118.5,90 L117,117 L115,122 L113,117 L111.5,90 Z" fill={GREEN} />
          <rect x="126" y="104" width="8" height="3.5" fill={CHAMPAGNE} />
        </g>

        {/* ── HER ─────────────────────────────────────────────────────── */}
        <g>
          {/* Arms held a little off the body, which is most of the
              difference between a figure and a silhouette. */}
          <path d="M266,88 C258,116 255,150 258,180 L263,179 C261,150 263,118 270,92 Z" fill={TERRACOTTA} />
          <path d="M304,88 C312,116 315,150 312,180 L307,179 C309,150 307,118 300,92 Z" fill={TERRACOTTA} />
          <ellipse cx="260.5" cy="185" rx="4.5" ry="5.5" fill={TERRACOTTA} />
          <ellipse cx="309.5" cy="185" rx="4.5" ry="5.5" fill={TERRACOTTA} />

          {/* The gown: fitted to the waist, then released. The hem is drawn
              as a shallow curve rather than a straight edge — that, and the
              sweep to her left, is what reads as fabric instead of as a
              triangle. */}
          <path d="M269,154 L301,154 C313,214 325,302 333,381 C335,389 331,395 324,394 C298,399 269,391 248,394 C241,395 238,389 240,381 C249,302 259,214 269,154 Z" fill={BLUSH} />
          {/* One fold. Terracotta at low opacity rather than a new colour,
              so the shading stays inside the palette. */}
          <path d="M290,162 C299,240 310,330 318,388 L302,390 C297,330 291,240 287,164 Z" fill={TERRACOTTA} opacity="0.07" />

          {/* Bodice and sash. */}
          <path d="M268,86 C270,79 277,75 285,75 C293,75 300,79 302,86 L301,154 L269,154 Z" fill={BLUSH} />
          <rect x="268" y="148" width="34" height="8" fill={CHAMPAGNE} />

          {/* Head, updo, neck. */}
          <rect x="280" y="60" width="10" height="14" fill={TERRACOTTA} />
          <ellipse cx="285" cy="48" rx="12" ry="16" fill={TERRACOTTA} />
          <path d="M272,48 C271,30 278,23 285,23 C292,23 299,30 298,48 C296,36 292,33 285,33 C278,33 274,36 272,48 Z" fill={EMERALD} />
          <ellipse cx="296" cy="36" rx="6.5" ry="6.5" fill={EMERALD} />

          {/* The fascinator. A tilted disc and one feather — the detail that
              makes the occasion legible at a glance. */}
          <g transform="rotate(-20 267 30)">
            <ellipse cx="267" cy="30" rx="16" ry="5" fill={CHAMPAGNE} />
            <ellipse cx="267" cy="28.5" rx="16" ry="3.5" fill={IVORY} opacity="0.3" />
          </g>
          <path d="M261,26 C254,12 261,3 272,2 C263,7 259,15 262,26 Z" fill={CHAMPAGNE} />
          <path d="M262,24 C257,13 262,6 269,4 C264,9 261,16 263,24 Z" fill={IVORY} opacity="0.45" />
        </g>
      </svg>
    </figure>
  );
}
