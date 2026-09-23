#!/usr/bin/env node
/**
 * Generates the doodles the letter actually shows — public/email/doodle-*.png
 *
 *   npm run email:doodles
 *
 * ── Why these exist at all ─────────────────────────────────────────────────
 * The wedding doodles were already in this project, as backdrop.png: a tile
 * scattered behind the page. In a real inbox almost nobody sees them, for two
 * reasons that compound.
 *
 * They are drawn at 3–8.5% opacity, and only OUTSIDE an 840px clean centre
 * channel. The card is 700px wide, so the nearest doodle sits 70px past its
 * edge, and nothing is visible at all until the window is wider than 840px.
 * A phone, a Gmail reading pane, a preview panel — all of them are narrower
 * than that, and all of them show flat beige.
 *
 * On top of which the tile is a CSS background-image (plus VML for Outlook),
 * and a page-level background is the single least reliable thing in HTML
 * email. When a client drops it, there is nothing else: the final-details
 * letter contained no <img> element whatsoever.
 *
 * So the backdrop stays exactly as it is — it is a nice touch on a wide
 * desktop screen and it costs nothing — and these are added in front of it,
 * inside the card, as ordinary images. An <img> with width, height and a src
 * is the one thing every email client has rendered correctly since 1999.
 *
 * ── Why they are opaque, and not transparent PNGs ──────────────────────────
 * Drawn INTO the card colour rather than composited over it. Outlook renders
 * PNG alpha against its own guess of the background, and dark-mode clients
 * invert or re-ground transparent images unpredictably — both produce a grey
 * halo around the flourish. A flat opaque rectangle the same colour as the
 * card cannot do that. It also means the assets never need a background style
 * behind them to look right.
 *
 * ── Why a script and not exported art ──────────────────────────────────────
 * Same reasoning as generate-backdrop.mjs: opacity, scale and spacing are the
 * things that need a nudge after seeing them in a real inbox, and the icons
 * come from doodle-icons.mjs so the flourishes and the tile can never drift
 * apart. Re-running redraws identically — there is no jitter here.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

import { ICONS } from './doodle-icons.mjs';
import { PALETTE as P, LAYOUT } from './config.mjs';

/* ── Dials ───────────────────────────────────────────────────────────────── */

const CFG = {
  scale:  2,                 // rendered at 2x for retina
  ground: P.card,            // the card colour — these sit ON the card
  ink:    '#556B4E',         // olive, as the backdrop
  stroke: 2.6,

  // Full strength, because unlike the backdrop these are meant to be seen.
  // Still ink-on-cream rather than black: this is stationery, not a logo.
  opacity: 0.42,
};

/** The card's inner measure: 700 less 2×56 of padding. */
const MEASURE = LAYOUT.card - 112;

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/**
 * One icon, placed. `size` is the width in CSS px of its 100×100 box.
 */
function mark({ name, x, y, size, rotate = 0, opacity = CFG.opacity }) {
  const s = size / 100;
  return `  <g transform="translate(${x} ${y}) rotate(${rotate}) scale(${s.toFixed(4)})" ` +
         `stroke="${CFG.ink}" stroke-opacity="${opacity}" fill="none" ` +
         `stroke-width="${(CFG.stroke / s).toFixed(2)}" ` +
         `stroke-linecap="round" stroke-linejoin="round">${ICONS[name]()}</g>`;
}

function svg({ width, height, marks }) {
  return `<svg xmlns="http://www.w3.org/2000/svg"
     width="${width * CFG.scale}" height="${height * CFG.scale}"
     viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${CFG.ground}"/>
${marks.join('\n')}
</svg>`;
}

/* ── The three pieces ────────────────────────────────────────────────────────
 * Three, not one per section. A flourish that appears at every heading stops
 * being a flourish and becomes a bullet point.
 */

const PIECES = {
  /**
   * Under the masthead. Rings centred, a sprig either side leaning outward —
   * the one piece that carries the wedding symbol explicitly.
   */
  'doodle-crest': () => {
    const w = 320, h = 86;
    return { width: w, height: h, marks: [
      mark({ name: 'sprig',  x: w / 2 - 104, y: h / 2, size: 58, rotate: -22, opacity: 0.30 }),
      mark({ name: 'rings',  x: w / 2,       y: h / 2 + 2, size: 76 }),
      mark({ name: 'sprig',  x: w / 2 + 104, y: h / 2, size: 58, rotate: 22, opacity: 0.30 }),
    ] };
  },

  /**
   * Between sections. A hairline rule broken by a heart, full card measure, so
   * it reads as a divider rather than as a picture of one.
   */
  'doodle-divider': () => {
    const w = MEASURE, h = 40;
    const mid = w / 2, gap = 34;
    const rule = (x1, x2) =>
      `  <path d="M${x1},${h / 2} L${x2},${h / 2}" stroke="${CFG.ink}" ` +
      `stroke-opacity="0.22" stroke-width="1" stroke-linecap="round" fill="none"/>`;
    return { width: w, height: h, marks: [
      rule(40, mid - gap),
      mark({ name: 'heart', x: mid, y: h / 2, size: 40, opacity: 0.34 }),
      rule(mid + gap, w - 40),
    ] };
  },

  /**
   * Above the signature. Champagne and a bouquet, leaning together — the
   * closing note rather than the opening one.
   */
  'doodle-signoff': () => {
    const w = 260, h = 96;
    return { width: w, height: h, marks: [
      mark({ name: 'bouquet',   x: w / 2 - 62, y: h / 2 + 4, size: 66, rotate: -14, opacity: 0.32 }),
      mark({ name: 'champagne', x: w / 2 + 52, y: h / 2 + 6, size: 70, rotate: 10 }),
    ] };
  },
};

/* ── Write them ──────────────────────────────────────────────────────────── */

const dir = join(process.cwd(), 'public', 'email');
mkdirSync(dir, { recursive: true });

console.log('');
const sizes = {};

for (const [name, build] of Object.entries(PIECES)) {
  const piece = build();
  const markup = svg(piece);
  const out = join(dir, `${name}.png`);

  const info = await sharp(Buffer.from(markup))
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(out);

  sizes[name] = { width: piece.width, height: piece.height };
  console.log(`  ${`${name}.png`.padEnd(22)} ${String(`${info.width}×${info.height}`).padEnd(12)} ` +
              `${String(`${(info.size / 1024).toFixed(1)} KB`).padStart(9)}   ` +
              `(${piece.width}×${piece.height} CSS px @${CFG.scale}x)`);

  writeFileSync(out.replace(/\.png$/, '.svg'), markup);
}

console.log(`\n  ink ${CFG.ink} at ${CFG.opacity} on ${CFG.ground}, opaque — no alpha, no background-image`);
console.log('  DISPLAY_SIZE in config.mjs must match the CSS px above:');
console.log(`  ${JSON.stringify(sizes)}\n`);
