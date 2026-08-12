#!/usr/bin/env node
/**
 * Renders every variant of the pack to HTML files you can open in a browser.
 *
 *   npm run email:preview
 *
 * No network, no database, no API key. This is how you check the design and,
 * more importantly, how you check that a Reception guest's pack genuinely
 * contains no trace of the After Party.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderConfirmationPack } from './template.mjs';
import { assetUrls, WEDDING } from './config.mjs';

const outDir = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : join(process.cwd(), 'scratch', 'email-preview');

// Point at the deployed site if you have one, so the real artwork loads.
const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
const real    = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });

/**
 * Until the four artwork files are uploaded, those URLs 404 and every preview
 * shows a broken box — which makes the layout impossible to judge. --placeholder
 * swaps in a labelled stand-in at the right aspect ratio so the spacing and
 * rhythm read correctly.
 *
 * A data: URI is fine HERE because a browser renders it; Gmail strips them, so
 * the real email always uses the https URLs above.
 */
function placeholder(caption, ratio) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 ${Math.round(600 * ratio)}">
    <rect width="100%" height="100%" fill="#f2ece0"/>
    <rect x="10" y="10" width="580" height="${Math.round(600 * ratio) - 20}" fill="none"
          stroke="#d9c48a" stroke-width="2" stroke-dasharray="8 6"/>
    <text x="300" y="${Math.round(600 * ratio / 2) - 8}" text-anchor="middle"
          font-family="Georgia,serif" font-size="21" fill="#1b3b2a">${caption}</text>
    <text x="300" y="${Math.round(600 * ratio / 2) + 20}" text-anchor="middle"
          font-family="Helvetica,Arial" font-size="12" fill="#8a8271"
          letter-spacing="2">PLACEHOLDER &#183; UPLOAD THE ARTWORK</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const usePlaceholders = process.argv.includes('--placeholder');
const assets = usePlaceholders ? {
  joining:        placeholder('Joining Ceremony artwork', 1.4),
  reception:      placeholder('Reception artwork',        1.4),
  'after-party':  placeholder('After Party artwork',      1.4),
  'dress-guide':  placeholder('Dress Guide artwork',      1.45),
} : real;

const base = {
  id: 'preview', full_name: 'Ada Obi', email: 'ada@example.com',
  main_invite_status: 'APPROVED', attending: true,
  plus_one_requested: false, plus_one_status: null, plus_one_name: null,
};

const variants = [
  ['joining-plus-one-approved', { approved_for: 'JOINING',    plus_one_requested: true, plus_one_status: 'APPROVED', plus_one_name: 'Chidi Obi' }],
  ['joining-no-plus-one',       { approved_for: 'JOINING' }],
  ['reception-plus-one-declined', { approved_for: 'RECEPTION', plus_one_requested: true, plus_one_status: 'REJECTED' }],
  ['reception-no-plus-one',     { approved_for: 'RECEPTION' }],
  ['after-party',               { approved_for: 'AFTERPARTY' }],
];

mkdirSync(outDir, { recursive: true });

console.log(`\nPreviews → ${outDir}\n`);
for (const [name, over] of variants) {
  const row = { ...base, ...over };
  const { html, text, events, days, plusOne } = renderConfirmationPack(row, { assets, rsvpUrl: siteUrl });

  writeFileSync(join(outDir, `${name}.html`), html);
  writeFileSync(join(outDir, `${name}.txt`), text);

  console.log(`  ${name.padEnd(30)} ${events.map(e => e.name).join(' · ').padEnd(34)} ` +
              `+1: ${plusOne}`);
}

console.log(`\n  ${WEDDING.dateLong} — ${
  renderConfirmationPack({ ...base, approved_for: 'JOINING' }, { assets, rsvpUrl: siteUrl }).days
} days away as of today.`);
console.log('\nOpen the .html files in a browser. Check that reception-*.html says');
console.log('nothing at all about the Joining Ceremony or the After Party.\n');
