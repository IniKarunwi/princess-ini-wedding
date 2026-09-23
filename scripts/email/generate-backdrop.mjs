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
import { ICONS, ORDER } from './doodle-icons.mjs';

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

/* The six icons and their order now live in doodle-icons.mjs, so the tile and
 * the flourishes printed inside the card are the same drawings. */

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
