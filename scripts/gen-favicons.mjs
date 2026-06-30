import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const publicDir = resolve(root, 'public');

// Monogram SVG — dark forest green, gold italic P & I, red heart
// Uses FreeSerif Italic (system font available in this environment)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="38%" cy="32%" r="80%">
      <stop offset="0%" stop-color="#2e5e40"/>
      <stop offset="100%" stop-color="#1b3829"/>
    </radialGradient>
    <!-- Subtle gold shimmer on letters -->
    <linearGradient id="gold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#f0e0b0"/>
      <stop offset="50%"  stop-color="#e8d5a3"/>
      <stop offset="100%" stop-color="#c9a84c"/>
    </linearGradient>
  </defs>

  <!-- Rounded background -->
  <rect width="512" height="512" rx="108" ry="108" fill="url(#bg)"/>

  <!-- "P" — left initial -->
  <text
    x="72"
    y="335"
    font-family="FreeSerif, 'Liberation Serif', serif"
    font-style="italic"
    font-size="272"
    fill="url(#gold)"
    letter-spacing="-8"
  >P</text>

  <!-- "I" — right initial, nudged in to tighten the composition -->
  <text
    x="312"
    y="335"
    font-family="FreeSerif, 'Liberation Serif', serif"
    font-style="italic"
    font-size="272"
    fill="url(#gold)"
  >I</text>

  <!-- Heart centrepiece — positioned between the two letters -->
  <text
    x="256"
    y="308"
    font-size="90"
    text-anchor="middle"
    font-family="serif"
  >❤️</text>
</svg>`;

const svgBuf = Buffer.from(svg);

const sizes = [
  { name: 'favicon-16x16.png',          size: 16  },
  { name: 'favicon-32x32.png',          size: 32  },
  { name: 'apple-touch-icon.png',        size: 180 },
  { name: 'android-chrome-192x192.png',  size: 192 },
  { name: 'android-chrome-512x512.png',  size: 512 },
];

for (const { name, size } of sizes) {
  await sharp(svgBuf)
    .resize(size, size)
    .png()
    .toFile(resolve(publicDir, name));
  console.log(`✓ ${name}`);
}

// Build a proper ICO containing 16×16, 32×32, and 48×48 PNG frames
async function pngAtSize(size) {
  return sharp(svgBuf).resize(size, size).png().toBuffer();
}

function icoFromPngs(pngs) {
  const count = pngs.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0,     0);
  header.writeUInt16LE(1,     2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = headerSize;
  for (const buf of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(0,          0); // width  0 = 256
    e.writeUInt8(0,          1); // height 0 = 256
    e.writeUInt8(0,          2); // colour count
    e.writeUInt8(0,          3); // reserved
    e.writeUInt16LE(1,       4); // planes
    e.writeUInt16LE(32,      6); // bit depth
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset,  12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

const [p16, p32, p48] = await Promise.all([16, 32, 48].map(pngAtSize));
writeFileSync(resolve(publicDir, 'favicon.ico'), icoFromPngs([p16, p32, p48]));
console.log('✓ favicon.ico  (16+32+48 px frames)');

// Keep the source SVG in public so it can be used as an OG image base
writeFileSync(resolve(publicDir, 'logo.svg'), svg);
console.log('✓ logo.svg');
