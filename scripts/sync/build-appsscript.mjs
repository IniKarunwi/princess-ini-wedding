#!/usr/bin/env node
/**
 * Generates apps-script/Core.gs from the pure sync modules.
 *
 *   npm run build:appsscript
 *
 * Google Apps Script has no ES modules and no npm: every .gs file in a project
 * shares one global scope. So rather than hand-porting the logic — which would
 * start drifting from the Node version the moment either changed — we strip the
 * import/export syntax and concatenate the modules into a single file.
 *
 * The Node runner and the Apps Script sync therefore execute BYTE-IDENTICAL
 * normalisation, mapping, tier derivation, matching and planning. Only the
 * edges differ: where rows come from, and how they reach Supabase.
 *
 * Only PURE modules may be listed here — no Node APIs, no supabase-js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT  = path.join(HERE, '..', '..', 'apps-script', 'Core.gs');

// Dependency order — later files may reference earlier ones.
const MODULES = ['config.mjs', 'normalize.mjs', 'transform.mjs', 'matcher.mjs', 'engine.mjs'];

/**
 * Collects aliased imports — `import { email as normEmail }`.
 *
 * Concatenation alone would leave `normEmail` undefined, since the real
 * declaration is named `email`. Each alias becomes an assignment so the
 * bundled code keeps working with the name it was written against. Missing
 * this is not a syntax error: it fails at runtime, on whichever code path
 * first touches the alias.
 */
function collectAliases(src) {
  const aliases = [];
  for (const m of src.matchAll(/^import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]*['"];?/gm)) {
    for (const spec of m[1].split(',')) {
      const as = /^\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(spec);
      if (as) aliases.push({ original: as[1], alias: as[2] });
    }
  }
  return aliases;
}

/** Removes ES module syntax; everything else is left exactly as written. */
function stripModuleSyntax(src) {
  return src
    // import ... from '...';  (single or multi-line)
    .replace(/^import[\s\S]*?from\s*['"][^'"]*['"];?[ \t]*\r?\n/gm, '')
    // bare `export {};`
    .replace(/^export\s*\{[^}]*\}\s*;?[ \t]*\r?\n/gm, '')
    // `export const|function|let|var|class` → drop the keyword
    .replace(/^export\s+(?=(?:async\s+)?(?:const|function|let|var|class)\b)/gm, '');
}

/**
 * Converts TOP-LEVEL const/let to var.
 *
 * Apps Script shares one scope across .gs files, but not uniformly:
 * `function` and `var` declarations become properties of the global object and
 * are visible everywhere, while top-level `const`/`let` create *script-scoped*
 * lexical bindings whose cross-file visibility depends on the order Apps Script
 * evaluates files. Core.gs exports TABLE and friends to SupabaseClient.gs and
 * Sync.gs, so those must be `var` to be reliable.
 *
 * `var` also tolerates redeclaration, so pasting a file twice degrades to a
 * harmless overwrite rather than a SyntaxError that takes down the project.
 *
 * Only column-0 declarations are rewritten; everything inside a function keeps
 * the block scoping it was written with.
 */
function topLevelConstToVar(src) {
  return src.replace(/^(const|let)\s+(?=[A-Za-z_$])/gm, 'var ');
}

const banner = `/**
 * Core.gs — GENERATED FILE, DO NOT EDIT
 *
 * Built from scripts/sync/{${MODULES.join(', ')}}
 * by scripts/sync/build-appsscript.mjs.
 *
 * Edit the source modules and re-run:  npm run build:appsscript
 *
 * This is the same normalisation, mapping, tier derivation, matching and
 * planning logic the Node runner uses — not a reimplementation. Anything
 * changed here is lost on the next build.
 *
 * Generated: ${new Date().toISOString()}
 */
`;

const parts = [banner];
const allAliases = [];

for (const name of MODULES) {
  const src = fs.readFileSync(path.join(HERE, name), 'utf8');
  const aliases = collectAliases(src);
  allAliases.push(...aliases.map(a => ({ ...a, module: name })));

  let body = `\n// ${'='.repeat(74)}\n// ${name}\n// ${'='.repeat(74)}\n\n`;
  if (aliases.length) {
    body += `// Import aliases from ${name}, preserved so bundled code resolves them.\n`;
    body += aliases.map(a => `var ${a.alias} = ${a.original};`).join('\n') + '\n\n';
  }
  parts.push(body + topLevelConstToVar(stripModuleSyntax(src)).trim() + '\n');
}

const output = parts.join('\n');

if (allAliases.length) {
  console.log('Aliases preserved:');
  for (const a of allAliases) console.log(`  ${a.original} → ${a.alias}   (${a.module})`);
}

// Guard: nothing that only exists in Node may survive into the bundle.
const FORBIDDEN = [
  [/^(?:const|let)\s/m,     'top-level const/let (must be var for Apps Script)'],
  [/\brequire\s*\(/,        'require()'],
  [/\bprocess\./,           'process.*'],
  [/\bimport\s+/,           'import statement'],
  [/^export\s/m,            'export statement'],
  [/\bnode:/,               'node: specifier'],
];
const problems = FORBIDDEN.filter(([re]) => re.test(output)).map(([, label]) => label);
if (problems.length) {
  console.error(`Refusing to write: bundle contains ${problems.join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, output);

const lines = output.split('\n').length;
console.log(`Core.gs written — ${MODULES.length} modules, ${lines} lines`);
console.log(`  ${path.relative(process.cwd(), OUT)}`);
