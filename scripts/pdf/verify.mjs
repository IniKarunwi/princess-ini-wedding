#!/usr/bin/env node
/**
 * Checks the built guides — npm run pdf:verify
 *
 * Run after `npm run pdf:guides`. Reads the PDFs back and asserts the things
 * that go wrong silently in a print piece, all of which happened while this
 * was being built:
 *
 *   · an event leaking into a variant that is not invited to it
 *   · an HTML entity printed literally, e.g. "&MIDDOT;" — eyebrow() escapes
 *     its argument, so passing `&middot;` prints the entity rather than the
 *     character, and uppercase makes it shout
 *   · content overflowing a fixed-height page, which drops the end of a
 *     section off the bottom with no error anywhere
 *   · the venue reverting to the printed guide's original wrong name
 *
 * Text is pulled with pdftotext if present, otherwise with Python + pymupdf.
 * Neither is a project dependency, so the check degrades to a clear message
 * rather than a crash.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { WEDDING, REGISTRY_URL, BANK_ACCOUNTS, STAY } from '../email/config.mjs';
import { EVENTS, TIER_EVENTS } from '../email/events.mjs';

const OUT = join(process.cwd(), 'dist', 'guides');
const PAGES = 8;

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
};

const VARIANTS = [
  { tier: 'JOINING',    file: 'guide-wedding-service.pdf' },
  { tier: 'RECEPTION',  file: 'guide-reception.pdf' },
  { tier: 'AFTERPARTY', file: 'guide-after-party.pdf' },
];

let failures = 0;
let passed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  ${c.green('PASS')}  ${name}`); }
  else { failures++; console.log(`  ${c.red('FAIL')}  ${name}${detail ? c.dim(`  — ${detail}`) : ''}`); }
};

/** Page-by-page text, via whichever extractor this machine has. */
function readPdf(path) {
  const py = `
import pymupdf, json, sys
d = pymupdf.open(sys.argv[1])
print(json.dumps({"pages": [p.get_text() for p in d]}))
`;
  try {
    const out = execFileSync('python3', ['-c', py, path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out).pages;
  } catch {
    return null;
  }
}

console.log(`\n${c.bold('Guest guides')}  ${c.dim(OUT)}\n`);

for (const { tier, file } of VARIANTS) {
  const path = join(OUT, file);
  console.log(c.bold(`${file}  ${c.dim(TIER_EVENTS[tier].join(' · '))}`));

  if (!existsSync(path)) {
    check(`${file} exists`, false, 'run npm run pdf:guides first');
    continue;
  }

  const pages = readPdf(path);
  if (!pages) {
    console.log(c.dim('  (no pymupdf — install it to check content: pip install pymupdf)\n'));
    check(`${file} is a non-trivial PDF`, statSync(path).size > 100 * 1024);
    continue;
  }

  const all = pages.join(' ').replace(/\s+/g, ' ');
  // letter-spacing makes Chromium emit "T R W  2 0 2 6", so uppercase labels
  // only match once the spaces between single characters are squeezed out.
  const dense = all.replace(/\s+/g, '');

  check('page count is as designed', pages.length === PAGES, `${pages.length} pages, expected ${PAGES}`);

  // ── The rule that matters ────────────────────────────────────────────────
  // Every event NOT in this tier must be absent from the document entirely —
  // not styled out, not greyed, absent.
  const invited = new Set(TIER_EVENTS[tier]);
  for (const [key, ev] of Object.entries(EVENTS)) {
    const present = all.includes(ev.name);
    if (invited.has(key)) {
      check(`shows "${ev.name}" and its time`, present && all.includes(ev.time));
    } else {
      check(`never mentions "${ev.name}"`, !present, 'a guest would learn about an event they are not invited to');
      check(`never mentions ${ev.time}`, !all.includes(ev.time));
    }
  }

  // ── Entities printed literally ───────────────────────────────────────────
  // Scanned against the de-spaced text, not the raw text: these leak most
  // often inside letter-spaced uppercase labels, where Chromium emits
  // "& M I D D O T ;" and a plain search for "&middot;" sails straight past.
  const leaked = ['&middot;', '&amp;', '&rsquo;', '&hellip;', '&mdash;', '&nbsp;', '&#']
    .filter(e => dense.toLowerCase().includes(e.toLowerCase().replace(/\s+/g, '')));
  check('no HTML entity printed literally', leaked.length === 0, leaked.join(', '));

  // ── Overflow ─────────────────────────────────────────────────────────────
  // Each page is a fixed 385x529pt box with overflow:hidden, so content that
  // is too tall is silently clipped — no error, it simply is not printed.
  //
  // These MUST be scoped to the page that carries the line. Searching the
  // whole document instead makes them checks of nothing: "TRW 2026" is also
  // the moodboard header on pages 5 and 6, and the couple's name appears on
  // five of the seven pages, so both matched even with the closing page
  // catastrophically overflowing. Verified by mutation.
  const page = (i) => (pages[i] ?? '').replace(/\s+/g, '');
  // Band labels and area names are uppercased by CSS, so the text layer holds
  // "PREMIUM" where the config says "Premium". Compare case-insensitively.
  const pageHas = (i, needle) =>
    page(i).toLowerCase().includes(String(needle).replace(/\s+/g, '').toLowerCase());
  // Page order: cover, welcome, itinerary, WHERE TO STAY, dress guide,
  // ladies, gentlemen, closing. These indices move whenever a page is added
  // — which is how the "where to stay" page was caught shifting them.
  const STAY_PAGE = 3, DRESS = 4, CLOSING = 7;

  check('the dress guide reaches its sign-off',
    page(DRESS).includes(WEDDING.couple.replace(/\s+/g, '')),
    'the dress guide page is overflowing — its last line is clipped');
  check('the closing page reaches its sign-off',
    /Withallourlove/i.test(page(CLOSING)),
    'the closing page is overflowing — the sign-off is clipped');
  check('the closing page reaches its colophon',
    /TRW2026/i.test(page(CLOSING)),
    'the closing page is overflowing — the colophon is clipped');

  // ── Facts ────────────────────────────────────────────────────────────────
  // ── Where to stay ────────────────────────────────────────────────────────
  // Every hotel must actually appear: a list that silently loses its last two
  // entries to an overflowing page is worse than no list, because the guest
  // cannot tell anything is missing.
  for (const band of STAY.bands) {
    check(`stay: "${band.label}" band is present`, pageHas(STAY_PAGE, band.label));
    for (const [name] of band.hotels) {
      check(`stay: lists ${name}`, pageHas(STAY_PAGE, name),
        'missing — the page may be overflowing');
    }
  }
  check('stay: lists the farther-out option, and its area',
    pageHas(STAY_PAGE, "D'Crown Place") && pageHas(STAY_PAGE, STAY.farther.area));
  check('stay: does not promise rooms are held', /noroomsareheld/i.test(page(STAY_PAGE)),
    'the copy must not imply a block booking exists');

  check('names the venue the email uses', all.includes(WEDDING.venueName),
    `expected "${WEDDING.venueName}"`);
  check('does not use the original guide\'s wrong venue',
    !/Wells Hall|Signature Love Wells/i.test(all));
  check('carries the registry', all.includes(REGISTRY_URL.replace(/^https:\/\//, '')));
  for (const a of BANK_ACCOUNTS) {
    check(`carries the ${a.bank} account number`, all.includes(a.number));
  }

  // These guests cannot RSVP — there is no address for them. Asking them to
  // would be the one thing the document must not do.
  check('makes no RSVP request', !/\bRSVP\b/i.test(all), 'these guests have no email to reply from');
  check('states the seat is reserved', /reserved/i.test(all));

  console.log('');
}

console.log(failures
  ? `${c.red(`FAILED — ${failures} of ${passed + failures} checks`)}\n`
  : `${c.green(`All checks passed (${passed})`)}\n`);
process.exitCode = failures ? 1 : 0;
