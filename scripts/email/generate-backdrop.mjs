#!/usr/bin/env node
/**
 * Generates the page backdrop — public/email/backdrop.png
 *
 *   npm run email:backdrop
 *
 * ── Why one flat image and not layered icons ───────────────────────────────
 * Email clients have inconsistent support for multiple background images,
 * background-position lists, and any form of layering. One opaque PNG renders
 * identically in Gmail, Apple Mail and every mobile client, and degrades to a
 * flat colour in Outlook desktop rather than to a broken heap.
 *
 * The doodles are drawn INTO the beige, not composited over it at runtime, so
 * the image is fully opaque and the CSS fallback colour matches it exactly.
 * If the image never loads, the email looks like it did before this existed.
 *
 * ── Why a script and not a hand-exported asset ─────────────────────────────
 * Opacity, spacing, palette and the width of the clean centre channel are the
 * things most likely to need a nudge after seeing it in a real inbox. Those
 * are constants below; re-running redraws the asset identically (the jitter is
 * seeded), so a tweak is a one-line change rather than a round trip through a
 * design tool.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

/* ── Dials ───────────────────────────────────────────────────────────────── */

const CFG = {
  // Tile size in CSS pixels. Wide enough that the card (600px) sits inside the
  // clean channel on a desktop screen, tall enough that vertical repetition is
  // not obvious in a long email.
  width:  1600,
  height: 1000,
  scale:  2,               // rendered at 2x for retina

  bg:    '#e8e0d0',        // must equal PALETTE.page
  ink:   '#556B4E',        // olive

  // Effective opacity of the strokes. The brief asks for 4–8%; the doodles
  // nearest the content fade further, see `opacityAt`.
  opacityOuter: 0.085,
  opacityInner: 0.030,

  // The quiet middle. No doodle is drawn within this band, so the text column
  // sits on flat colour however wide the viewport is.
  // Must stay wider than LAYOUT.card in config.mjs, or the doodles run under
  // the content. 840 leaves 70px of clear ground either side of the 700px card.
  channel: 840,

  stroke: 2.6,
  margin: 60,              // clear border, so horizontal tiling never collides
};

const OUT = join(process.cwd(), 'public', 'email', 'backdrop.png');

/* ── Seeded jitter, so the asset is reproducible ─────────────────────────── */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rand = rng(20260926);
const between = (a, b) => a + rand() * (b - a);

/* ── The six icons ───────────────────────────────────────────────────────────
 * Six, repeated, rather than every wedding symbol there is — a smaller
 * vocabulary reads as stationery, a larger one as clip art.
 *
 * Each is drawn stroke-only in a 100×100 box, origin at the centre. Paths are
 * deliberately not geometrically perfect: the control points are a little off
 * true so the line reads as drawn rather than plotted.
 */

const ICONS = {
  rings: () => `
    <ellipse cx="-13" cy="3" rx="20" ry="21"/>
    <ellipse cx="14" cy="0" rx="19" ry="20"/>
    <path d="M14,-20 l-5,-8 h10 z"/>
    <path d="M9,-28 l5,5 l5,-5"/>`,

  bouquet: () => `
    <path d="M0,34 C-2,18 -6,8 -11,-2"/>
    <path d="M0,34 C1,20 4,10 9,0"/>
    <path d="M0,34 C0,20 0,12 -1,3"/>
    <circle cx="-13" cy="-8" r="8.5"/>
    <circle cx="10" cy="-6" r="7.5"/>
    <circle cx="-2" cy="-19" r="7"/>
    <path d="M-24,10 C-19,4 -14,2 -9,3"/>
    <path d="M22,8 C17,3 12,1 7,2"/>
    <path d="M-9,29 C-3,32 3,32 9,29"/>`,

  // Two flutes tilted into a toast. Each is a bowl, a stem and a foot drawn
  // as separate strokes — the first attempt merged them into one silhouette
  // that read as a tulip rather than a pair of glasses.
  champagne: () => `
    <g transform="translate(-15,2) rotate(-13)">
      <path d="M-12,-30 L12,-30 C11,-16 7,-9 0,-8 C-7,-9 -11,-16 -12,-30 Z"/>
      <path d="M0,-8 L0,15"/>
      <path d="M-9,17 L9,17"/>
    </g>
    <g transform="translate(15,2) rotate(13)">
      <path d="M-12,-30 L12,-30 C11,-16 7,-9 0,-8 C-7,-9 -11,-16 -12,-30 Z"/>
      <path d="M0,-8 L0,15"/>
      <path d="M-9,17 L9,17"/>
    </g>
    <circle cx="0" cy="-38" r="2"/>
    <circle cx="-9" cy="-45" r="1.5"/>
    <circle cx="8" cy="-44" r="1.7"/>`,

  heart: () => `
    <path d="M0,26 C-22,10 -30,-2 -30,-13 C-30,-24 -21,-30 -13,-30
             C-6,-30 -1,-25 0,-20 C1,-25 6,-30 13,-30
             C21,-30 30,-24 30,-13 C30,-2 22,10 0,26 Z"/>`,

  envelope: () => `
    <rect x="-31" y="-21" width="62" height="42" rx="3"/>
    <path d="M-31,-19 L0,6 L31,-19"/>
    <path d="M-31,20 L-9,0"/>
    <path d="M31,20 L9,0"/>`,

  sprig: () => `
    <path d="M0,32 C1,16 -1,2 0,-30"/>
    <path d="M0,-6 C-8,-10 -14,-16 -15,-24 C-7,-23 -1,-17 0,-9"/>
    <path d="M0,2 C8,-2 14,-8 15,-16 C7,-15 1,-9 0,-1"/>
    <path d="M0,14 C-8,10 -13,4 -14,-4 C-6,-3 -1,3 0,11"/>
    <path d="M0,-24 C3,-27 5,-30 5,-34 C1,-33 -1,-30 0,-26"/>`,
};

const ORDER = ['rings', 'bouquet', 'champagne', 'heart', 'envelope', 'sprig'];

/* ── Placement ───────────────────────────────────────────────────────────────
 * Flourishes around the edges, not a grid. Positions are laid out on a loose
 * staggered rhythm down each side, then jittered, so nothing lines up.
 */

function placements() {
  const { width, height, channel, margin } = CFG;
  const gutter = (width - channel) / 2;          // usable width per side
  const rows = 5;
  const out = [];

  for (let row = 0; row < rows; row++) {
    for (const side of [-1, 1]) {
      // Stagger: the right column sits half a row lower than the left.
      const t = (row + (side === 1 ? 0.5 : 0)) / rows;
      const y = margin + t * (height - margin * 2) + between(-38, 38);

      // Keep clear of the tile's own left/right edges so horizontal repetition
      // never butts two doodles together.
      const inset = between(margin, gutter - margin);
      const x = side === -1 ? inset : width - inset;

      const name = ORDER[(row * 2 + (side === 1 ? 1 : 0)) % ORDER.length];
      out.push({
        name, x, y,
        scale: between(0.62, 1.05),
        rotate: between(-24, 24),
      });
    }
  }
  return out;
}

/**
 * Fade toward the centre.
 *
 * A doodle sitting just outside the content column is nearly invisible; one
 * out at the edge of the viewport carries the full (still very low) weight.
 * This is what stops the pattern crowding the text.
 */
function opacityAt(x) {
  const { width, channel, opacityInner, opacityOuter } = CFG;
  const edgeOfChannel = (width - channel) / 2;
  const distance = Math.min(x, width - x);              // to nearest tile edge
  const t = Math.min(1, Math.max(0, distance / edgeOfChannel));
  // t = 0 at the tile edge, 1 at the channel. Invert: faint near the channel.
  return opacityOuter + (opacityInner - opacityOuter) * t;
}

function buildSvg() {
  const { width, height, scale, bg, ink, stroke } = CFG;

  const marks = placements().map(p => {
    const o = opacityAt(p.x).toFixed(4);
    return `  <g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) ` +
           `rotate(${p.rotate.toFixed(1)}) scale(${p.scale.toFixed(3)})" ` +
           `stroke="${ink}" stroke-opacity="${o}" fill="none" ` +
           `stroke-width="${(stroke / p.scale).toFixed(2)}" ` +
           `stroke-linecap="round" stroke-linejoin="round">` +
           `${ICONS[p.name]()}</g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg"
     width="${width * scale}" height="${height * scale}"
     viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}"/>
${marks}
</svg>`;
}

const svg = buildSvg();
mkdirSync(dirname(OUT), { recursive: true });

// palette:true gives an 8-bit PNG. The image is a flat ground plus a handful
// of very low-contrast strokes, so it quantises to a few dozen colours with no
// visible loss and a fraction of the bytes.
const info = await sharp(Buffer.from(svg))
  .png({ palette: true, quality: 90, effort: 10 })
  .toFile(OUT);

const kb = (info.size / 1024).toFixed(1);
console.log(`\n  ${OUT}`);
console.log(`  ${info.width}×${info.height}  ${kb} KB  (${CFG.width}×${CFG.height} CSS px @${CFG.scale}x)`);
console.log(`  ${placements().length} flourishes · ${ORDER.length} icons · ` +
            `${CFG.channel}px clean centre channel`);
console.log(`  opacity ${CFG.opacityOuter} at the edge → ${CFG.opacityInner} nearest the content\n`);

if (info.size > 200 * 1024) {
  console.warn('  Over 200KB — consider dropping scale to 1.5.\n');
}

// The raw SVG is kept alongside for anyone who wants to open it in a vector
// editor rather than re-run this script.
writeFileSync(OUT.replace(/\.png$/, '.svg'), svg);
