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

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderConfirmationPack } from './template.mjs';
import { assetUrls, ASSET_FILES, WEDDING } from './config.mjs';

const outDir = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : join(process.cwd(), 'scratch', 'email-preview');

// Point at the deployed site if you have one, so the real artwork loads.
const siteUrl = process.env.INVITE_SITE_URL || 'https://princessandini.com';
const real    = assetUrls({ siteUrl, baseUrl: process.env.INVITE_ASSET_BASE_URL });

/**
 * Until the five artwork files are uploaded, those URLs 404 and every preview
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

const CAPTIONS = {
  joining:       ['Wedding Service artwork',   1.4],
  reception:     ['Wedding Reception artwork', 1.4],
  'after-party': ['After Party artwork',       1.4],
  'dress-guide': ['Dress Guide artwork',       1.45],
  venue:         ['Venue illustration',        0.62],
  backdrop:      ['Backdrop',                  0.71],
};

const assetPath = (file) => join(process.cwd(), 'public', 'email', file);

/**
 * Sniffs the real format from the file's magic bytes rather than trusting the
 * extension. A placeholder committed to reserve a filename, or a JPEG saved as
 * .png, both look fine to existsSync and neither renders.
 */
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8)                        return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF'
   && buf.toString('latin1', 8, 12) === 'WEBP')                  return 'image/webp';
  if (buf.toString('latin1', 0, 3) === 'GIF')                    return 'image/gif';
  return null;
}

/** The real file, base64'd so the preview is self-contained and shareable. */
function inlined(file) {
  const path = assetPath(file);
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const mime = sniff(buf);
  if (!mime) return null;          // a stub or something that is not an image
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Which artwork the preview uses:
 *
 *   default        the real file from public/email/ if it is there, a
 *                  stand-in if it is not — so a preview is never a wall of
 *                  broken boxes, and never silently shows a stand-in for a
 *                  file that does exist
 *   --placeholder  stand-ins throughout, to judge layout alone
 *   --remote       the deployed https URLs, exactly as a guest receives them
 *
 * A browser opening a file:// page cannot reach the deployed URLs, which is
 * why the default inlines. The email itself ALWAYS uses the https URLs.
 */
const mode = process.argv.includes('--placeholder') ? 'placeholder'
           : process.argv.includes('--remote')      ? 'remote'
           : 'local';

const usingPlaceholder = [];
const assets = mode === 'remote' ? real : Object.fromEntries(
  Object.entries(ASSET_FILES).map(([key, file]) => {
    if (mode === 'local') {
      const data = inlined(file);
      if (data) return [key, data];
    }
    usingPlaceholder.push(file);
    return [key, placeholder(...CAPTIONS[key])];
  }),
);

const base = {
  id: 'preview', full_name: 'Ada Obi', email: 'ada@example.com',
  main_invite_status: 'APPROVED', attending: true,
  plus_one_requested: false, plus_one_status: null, plus_one_name: null,
  plus_one_approved_for: null,
};

const variants = [
  ['joining-plus-one-approved', { approved_for: 'JOINING', plus_one_requested: true,
    plus_one_status: 'APPROVED', plus_one_name: 'Chidi Obi', plus_one_approved_for: 'JOINING' }],
  ['joining-no-plus-one',       { approved_for: 'JOINING' }],
  ['reception-plus-one-declined', { approved_for: 'RECEPTION', plus_one_requested: true, plus_one_status: 'REJECTED' }],
  ['reception-no-plus-one',     { approved_for: 'RECEPTION' }],
  ['reception-and-after-party', { approved_for: 'RECEPTION, AFTERPARTY' }],
  // The plus one's invitation is independent of the main guest's: here the
  // guest has the whole day and their guest only the reception.
  ['joining-plus-one-reception-only', { approved_for: 'JOINING', plus_one_requested: true,
    plus_one_status: 'APPROVED', plus_one_name: 'Chidi Obi', plus_one_approved_for: 'RECEPTION' }],
  ['after-party',               { approved_for: 'AFTERPARTY' }],
];

mkdirSync(outDir, { recursive: true });

console.log(`\nPreviews → ${outDir}\n`);
for (const [name, over] of variants) {
  const row = { ...base, ...over };
  const { html, text, events, plusOne, plusOneEvents } =
    renderConfirmationPack(row, { assets, rsvpUrl: siteUrl });

  writeFileSync(join(outDir, `${name}.html`), html);
  writeFileSync(join(outDir, `${name}.txt`), text);

  console.log(`  ${name.padEnd(34)} ${events.map(e => e.name).join(' · ').padEnd(48)} ` +
              `+1: ${plusOne}${plusOneEvents?.length ? ` (${plusOneEvents.map(e => e.name).join(', ')})` : ''}`);
}

console.log(`\n  ${WEDDING.dateLong} — ${
  renderConfirmationPack({ ...base, approved_for: 'JOINING' }, { assets, rsvpUrl: siteUrl }).days
} days away as of today.`);
if (mode === 'remote') {
  console.log(`\n  Artwork: the deployed URLs under ${siteUrl}/email/`);
} else if (usingPlaceholder.length) {
  console.log(`\n  \x1b[33mStand-in artwork for ${usingPlaceholder.length} file(s):\x1b[0m ` +
              usingPlaceholder.join(', '));
  console.log('  \x1b[2mAdd them to public/email/ and re-run to see the real thing.\x1b[0m');
} else {
  console.log('\n  \x1b[32mAll artwork is the real thing, inlined from public/email/.\x1b[0m');
}

console.log('\nOpen the .html files in a browser. Check that reception-*.html says');
console.log('nothing at all about the Wedding Service or the After Party.\n');
