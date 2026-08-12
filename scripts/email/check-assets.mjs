#!/usr/bin/env node
/**
 * Checks the email artwork before a send.
 *
 *   npm run email:assets
 *
 * A missing image renders as nothing at all rather than a broken box — the
 * right call for a wedding email, but it means a misnamed file is completely
 * silent. This is the check that makes it loud.
 */

import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ASSET_FILES } from './config.mjs';

const dir = join(process.cwd(), 'public', 'email');

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
};

/** What each file is for, so a failure says which part of the email it breaks. */
const PURPOSE = {
  joining:        'hero — guests invited to the Wedding Service',
  reception:      'hero — Reception guests',
  'after-party':  'hero — After Party guests',
  venue:          'the venue card (optional — card renders without it)',
  'dress-guide':  'full width, in every pack',
  backdrop:       'page backdrop — generated, npm run email:backdrop',
};

const OPTIONAL = new Set(['venue']);

/** 1200px wide renders at 600 CSS px and stays sharp on a phone. */
const WANT_WIDTH = 1200;
const MAX_BYTES  = 400 * 1024;

console.log(`\n${c.bold('Email artwork')}  ${c.dim(dir)}\n`);

let missing = 0;
let warnings = 0;

for (const [key, file] of Object.entries(ASSET_FILES)) {
  const path = join(dir, file);
  const label = file.padEnd(18);

  if (!existsSync(path)) {
    if (OPTIONAL.has(key)) {
      console.log(`  ${c.amber('optional')}  ${label} ${c.dim(PURPOSE[key])}`);
    } else {
      console.log(`  ${c.red('MISSING ')}  ${label} ${c.dim(PURPOSE[key])}`);
      missing++;
    }
    continue;
  }

  const bytes = statSync(path).size;
  let meta;
  try {
    meta = await sharp(path).metadata();
  } catch {
    const why = bytes < 64 ? `${bytes}-byte stub, not an image` : 'not a valid image';
    console.log(`  ${c.red('UNREADABLE')} ${label} ${c.dim(why)}`);
    missing++;
    continue;
  }

  const notes = [];
  // A JPEG named .png works in most clients because they sniff the content,
  // but the server will serve it as image/png. Cheap to fix, so say so.
  const claimed = file.split('.').pop().toLowerCase();
  const actual  = meta.format === 'jpeg' ? 'jpg' : meta.format;
  if (actual !== claimed && !(claimed === 'jpeg' && actual === 'jpg')) {
    notes.push(`actually a ${meta.format.toUpperCase()} named .${claimed} — re-save as .${claimed}, or rename`);
  }
  if (bytes > MAX_BYTES) {
    notes.push(`${(bytes / 1024 / 1024).toFixed(1)}MB — heavy on mobile data`);
  }
  if (key !== 'backdrop' && meta.width < WANT_WIDTH) {
    notes.push(`${meta.width}px wide — soft on a retina phone, want ${WANT_WIDTH}`);
  }
  if (notes.length) warnings++;

  const size = bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.round(bytes / 1024)}KB`;

  console.log(`  ${notes.length ? c.amber('check   ') : c.green('ok      ')}  ${label} ` +
              `${String(`${meta.width}×${meta.height}`).padEnd(12)} ${size.padStart(6)}` +
              (notes.length ? `\n              ${c.amber(notes.join('; '))}` : ''));
}

// A file sitting in the folder under the wrong name is the most likely mistake,
// and the one hardest to spot — the pack just silently drops that section.
const expected = new Set(Object.values(ASSET_FILES));
const strays = readdirSync(dir)
  .filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f) && !expected.has(f));

if (strays.length) {
  console.log(`\n${c.amber('Not referenced by the template:')}`);
  for (const s of strays) console.log(`  ${s}`);
  console.log(c.dim('  A misnamed file is silent — the section simply does not render.'));
  console.log(c.dim(`  Expected names: ${Object.values(ASSET_FILES).join(', ')}`));
}

console.log('');
if (missing) {
  console.log(c.red(`${missing} required file(s) missing. Those sections will not render.\n`));
  process.exitCode = 1;
} else if (warnings || strays.length) {
  console.log(c.amber('All required files present, with notes above.\n'));
} else {
  console.log(c.green('All artwork present.\n'));
}

console.log(c.dim('Once deployed, confirm each loads over https too — a local file'));
console.log(c.dim('proves nothing about what a guest\'s email client can fetch.\n'));
