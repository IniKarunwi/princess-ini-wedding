#!/usr/bin/env node
/**
 * Shrinks the email artwork IN PLACE, keeping every filename and URL.
 *
 *   npm run email:shrink            # report only
 *   npm run email:shrink -- --write # rewrite the files
 *
 * ── Why this exists, and why it is not optimize-artwork.mjs ────────────────
 * optimize-artwork.mjs converts to .jpg and deletes the PNGs. That is the
 * better encoding, but it changes the URLs — and 136 emails have already been
 * delivered with `/email/venue.png` hard-coded into them. An email fetches its
 * images when it is OPENED, not when it is sent, so those URLs have to keep
 * working for as long as anyone might reopen the mail. Renaming them would
 * break every copy already sitting in an inbox.
 *
 * So this does the one thing that helps retroactively: same names, same
 * format, fewer bytes. Every already-delivered email picks up the lighter
 * artwork the next time it is opened, with nothing resent.
 *
 * ── What it actually does ──────────────────────────────────────────────────
 * Two independent wins:
 *
 *   1. Resolution. The art is displayed at 700 CSS px (642 for the venue).
 *      Anything above 2x that is detail no screen can show.
 *   2. Re-encode. The exports carry editor metadata and are not maximally
 *      deflated.
 *
 * PNG is a poor fit for watercolour — it is lossless, so it stores every
 * brush-texture pixel exactly, and there is a hard floor of roughly 0.8 MB an
 * image that no amount of effort gets under. JPEG would reach ~0.25 MB. We
 * accept the floor because it is the price of not breaking the sent mail.
 *
 * A file is only rewritten if the result is actually smaller. joining.png and
 * reception.png are already well encoded and re-saving them makes them bigger,
 * so they are left exactly as they are.
 */

import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ASSET_FILES, LAYOUT } from './config.mjs';

const DIR = join(process.cwd(), 'public', 'email');

/**
 * Display width in CSS px, per asset. 2x of this is the resolution ceiling.
 * The venue sits inside the card's 28px padding, hence the narrower box.
 */
const DISPLAY = {
  joining:       LAYOUT.card,
  reception:     LAYOUT.card,
  'after-party': LAYOUT.card,
  'dress-guide': LAYOUT.card,
  venue:         LAYOUT.card - 58,
};

/** backdrop.png is 14 KB of flat colour — already right, and JPEG would band it. */
const SKIP = new Set(['backdrop']);

const write = process.argv.includes('--write');
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`.padStart(8);

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
};

console.log(`\n${c.bold('Artwork shrink')}  ${c.dim(DIR)}`);
console.log(c.dim('  Filenames and URLs are preserved, so already-sent emails benefit too.\n'));
console.log(c.dim('  file            before     after   saved'));

let before = 0;
let after = 0;
const changed = [];

for (const [key, file] of Object.entries(ASSET_FILES)) {
  if (SKIP.has(key)) continue;
  const path = join(DIR, file);
  if (!existsSync(path)) {
    console.log(`  ${key.padEnd(13)} ${c.red('missing')}`);
    continue;
  }

  const original = readFileSync(path);
  const meta = await sharp(original).metadata();
  const ceiling = (DISPLAY[key] ?? LAYOUT.card) * 2;

  const shrunk = await sharp(original)
    .resize({ width: Math.min(ceiling, meta.width), withoutEnlargement: true })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  before += original.length;

  // Only ever write a smaller file. Re-encoding an already-tight PNG inflates
  // it, and shipping a bigger image would be the opposite of the point.
  const better = shrunk.length < original.length;
  after += better ? shrunk.length : original.length;

  const saved = better ? `${Math.round(100 - (shrunk.length / original.length) * 100)}%` : '—';
  const note = better ? c.green(saved.padStart(6)) : c.dim('  already tight');
  console.log(`  ${key.padEnd(13)} ${mb(original.length)} ${mb(better ? shrunk.length : original.length)} ${note}`);

  if (better) {
    changed.push({ path, buf: shrunk, key });
    if (write) writeFileSync(path, shrunk);
  }
}

console.log(c.dim('  ' + '─'.repeat(46)));
console.log(`  ${'total'.padEnd(13)} ${mb(before)} ${mb(after)}`);

// The number that actually matters: what one guest's phone downloads. A guest
// invited to the whole day gets the joining hero, the venue and the dress
// guide — the heaviest combination anyone receives.
const worstCase = ['joining', 'venue', 'dress-guide'];
const weigh = (getSize) => worstCase.reduce((n, k) => n + getSize(k), 0);
const sizeOf = (k) => statSync(join(DIR, ASSET_FILES[k])).size;
const newSizeOf = (k) => (changed.find(ch => ch.key === k)?.buf.length) ?? sizeOf(k);

console.log(`\n  ${c.bold('Heaviest guest')} ${c.dim('(whole day: hero + venue + dress guide)')}`);
console.log(`    ${mb(weigh(write ? newSizeOf : sizeOf))} ${c.dim(write ? 'now' : 'before')}` +
            (write ? '' : ` →${mb(weigh(newSizeOf))} ${c.dim('after')}`));

if (!write) {
  console.log(`\n${c.bold('REPORT ONLY')} — nothing written. Add ${c.bold('--write')} to apply.\n`);
} else {
  console.log(c.green(`\n  Rewrote ${changed.length} file(s) in place. Filenames unchanged.`));
  console.log(c.dim('  Deploy public/ for already-sent emails to pick this up.\n'));
}
