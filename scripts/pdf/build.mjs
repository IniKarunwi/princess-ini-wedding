#!/usr/bin/env node
/**
 * Builds the printed guest guides — npm run pdf:guides
 *
 * Three PDFs, one per tier, into dist/guides/:
 *
 *   guide-wedding-service.pdf   Service + Reception + After Party
 *   guide-reception.pdf         Reception only
 *   guide-after-party.pdf       After Party only
 *
 * For the guests we hold no email address for. Each is handed the variant
 * matching what they are invited to, so the rule that governs the email holds
 * on paper as well: nobody reads about an event they were not invited to.
 *
 * ── Why Chromium and not a PDF library ─────────────────────────────────────
 * The page is a design, not a report — a full-bleed cover, floral bleeds off
 * three edges, a nine-swatch palette. Laying that out by drawing primitives is
 * a lot of arithmetic for something CSS already does. Chromium is already on
 * this machine for Playwright, and its --print-to-pdf is deterministic at a
 * fixed @page size.
 *
 * Images are inlined as data: URIs. Chromium loads file:// images from a
 * file:// page inconsistently depending on flags, and inlining removes the
 * question. This is print, so weight does not matter the way it does in email.
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderGuide } from './template.mjs';
import { WEDDING } from '../email/config.mjs';
import { TIER_EVENTS } from '../email/events.mjs';

const ASSETS = join(process.cwd(), 'scripts', 'pdf', 'assets');
const OUT    = join(process.cwd(), 'dist', 'guides');
const TMP    = join(process.cwd(), 'dist', 'guides', '.html');

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
};

/** The three variants. `tier` is fed straight to the shared tier logic. */
const VARIANTS = [
  { tier: 'JOINING',    file: 'guide-wedding-service.pdf' },
  { tier: 'RECEPTION',  file: 'guide-reception.pdf' },
  { tier: 'AFTERPARTY', file: 'guide-after-party.pdf' },
];

/** Chromium, as shipped for Playwright on this image. */
function findChromium() {
  const fromEnv = process.env.CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const roots = ['/opt/pw-browsers'];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const p = join(root, dir, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/** Every asset as a data: URI, keyed by filename without extension. */
function loadAssets() {
  if (!existsSync(ASSETS)) throw new Error(`No assets directory at ${ASSETS}`);
  const out = {};
  for (const f of readdirSync(ASSETS)) {
    const mime = MIME[extname(f).toLowerCase()];
    if (!mime) continue;
    out[basename(f, extname(f))] = `data:${mime};base64,${readFileSync(join(ASSETS, f)).toString('base64')}`;
  }
  return out;
}

const chromium = findChromium();
if (!chromium) {
  console.error(`\n${c.red('No Chromium found.')}\n\n` +
    'Looked under /opt/pw-browsers. Set CHROMIUM_PATH to a Chrome or Chromium\n' +
    'binary and run again.\n');
  process.exit(1);
}

console.log(`\n${c.bold('Printed guest guides')}  ${c.dim(WEDDING.couple)}`);
console.log(c.dim(`  ${chromium}\n`));

const assets = loadAssets();
console.log(c.dim(`  ${Object.keys(assets).length} artwork files inlined\n`));

mkdirSync(TMP, { recursive: true });
const built = [];

for (const { tier, file } of VARIANTS) {
  const html = renderGuide({ tier, assets });
  const htmlPath = join(TMP, file.replace(/\.pdf$/, '.html'));
  writeFileSync(htmlPath, html);

  const pdfPath = join(OUT, file);
  execFileSync(chromium, [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
    // The design has full-bleed colour; without this Chromium drops backgrounds.
    '--print-to-pdf-no-header',
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const events = TIER_EVENTS[tier];
  const kb = (statSync(pdfPath).size / 1024).toFixed(0);
  built.push({ file, tier, events, kb });
  console.log(`  ${c.green('built')} ${file.padEnd(28)} ${c.dim(`${kb}KB`)}`);
  console.log(`        ${c.dim(events.join(' · '))}`);
}

// The intermediate HTML is a build artifact, not a deliverable.
rmSync(TMP, { recursive: true, force: true });

console.log(`\n  ${c.bold('Out')}  ${OUT}`);
console.log(c.dim('  Hand each guest the variant matching what they are invited to.\n'));
