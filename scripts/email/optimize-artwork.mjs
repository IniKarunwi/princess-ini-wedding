#!/usr/bin/env node
/**
 * Optimises the email artwork — public/email/*.jpg
 *
 *   npm run email:optimize            # report only
 *   npm run email:optimize -- --write # convert, and remove the source PNGs
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The exported artwork totalled 8.8 MB. A guest invited to the whole day
 * loads the hero, the venue and the dress guide, so that is 5.4 MB arriving
 * on a phone — most of our guests are on Nigerian mobile data, and several
 * clients simply refuse to fetch images that large.
 *
 * ── Why JPEG and not PNG ───────────────────────────────────────────────────
 * These are watercolours: continuous tone, no flat regions, no transparency.
 * PNG is lossless and so encodes every brush-texture pixel exactly — re-saving
 * them as PNG at 1200px produced files LARGER than the originals (up to
 * 3.5 MB). JPEG is the right format for this content and gets the same images
 * to ~230–290 KB with no visible loss at the size they are displayed.
 *
 * WebP would be smaller again, but Outlook does not support it and this is an
 * email. AVIF likewise.
 *
 * The dress guide is encoded at a higher quality than the rest because it is
 * the only one carrying text, and JPEG artefacts show up first on hard edges.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ASSET_FILES, SENT_ASSET_FILES, LAYOUT } from './config.mjs';

const DIR = join(process.cwd(), 'public', 'email');

/**
 * The card is LAYOUT.card CSS px wide, so 2x covers a retina screen and
 * nothing beyond. This was 1200 from when the card was 600. The heroes are
 * only ~1030px to begin with, and `withoutEnlargement` leaves those at native
 * size rather than upscaling them into a bigger file for no extra detail.
 */
const WIDTH = LAYOUT.card * 2;

/** Text needs the extra quality; the watercolours do not. */
const QUALITY = { 'dress-guide': 88, default: 84 };

/** backdrop.png stays a PNG — flat colour, 14 KB, and JPEG would band it. */
const SKIP = new Set(['backdrop']);

const write = process.argv.includes('--write');
const kb = (n) => `${(n / 1024).toFixed(0)}KB`.padStart(7);

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
};

console.log(`\n${c.bold('Artwork optimisation')}  ${c.dim(DIR)}\n`);
console.log(c.dim('  file              before    after   saved'));

let before = 0;
let after  = 0;
const converted = [];

for (const [key, file] of Object.entries(ASSET_FILES)) {
  if (SKIP.has(key)) continue;

  // Always read from the PNG, whatever ASSET_FILES currently points at, so
  // re-running this after the switch to .jpg re-encodes the original rather
  // than an already-lossy JPEG.
  const src = join(DIR, SENT_ASSET_FILES[key] ?? file);
  if (!existsSync(src)) {
    console.log(`  ${file.padEnd(16)} ${c.amber('missing')}`);
    continue;
  }

  const srcBytes = statSync(src).size;
  const quality  = QUALITY[key] ?? QUALITY.default;

  const buf = await sharp(src)
    .resize({ width: WIDTH, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  before += srcBytes;
  after  += buf.length;

  const out = file.replace(/\.(png|jpe?g|webp)$/i, '.jpg');
  const pct = Math.round((1 - buf.length / srcBytes) * 100);


  console.log(`  ${out.padEnd(16)} ${kb(srcBytes)} ${kb(buf.length)}  ${String(pct + '%').padStart(5)}` +
              (quality !== QUALITY.default ? c.dim(`   q${quality}, text`) : ''));

  if (write) {
    writeFileSync(join(DIR, out), buf);
    // The source PNG is deliberately NOT deleted. 136 confirmation emails are
    // already delivered with /email/<name>.png baked into them, and an email
    // fetches its images when it is opened — possibly years from now. Those
    // URLs have to keep resolving, so the PNGs stay for good. See
    // SENT_ASSET_FILES in config.mjs.
    converted.push([key, out]);
  }
}

console.log(`\n  ${c.bold('total')}            ${kb(before)} ${kb(after)}  ` +
            `${String(Math.round((1 - after / before) * 100) + '%').padStart(5)}`);

if (!write) {
  console.log(`\n${c.dim('  Report only. Add --write to convert.')}\n`);
} else {
  console.log(c.green('\n  Written.'));
  console.log(c.dim('  ASSET_FILES already points at these names:'));
  for (const [key, out] of converted) console.log(c.dim(`    ${key.padEnd(14)} '${out}'`));
  console.log(`\n  ${c.bold('The source PNGs are still there, and must stay deployed.')}`);
  console.log(c.dim('  136 delivered emails fetch them by name every time one is opened.\n'));
}
