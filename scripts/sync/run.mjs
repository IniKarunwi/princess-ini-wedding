#!/usr/bin/env node
/**
 * RSVP sync — CLI entry point.
 *
 *   npm run sync:rsvps -- --file ./data/rsvps.xlsx            # preview
 *   npm run sync:rsvps -- --file ./data/rsvps.xlsx --apply    # write
 *
 * Dry run is the default on purpose: this writes to the live guest table.
 */

import { createClient } from '@supabase/supabase-js';
import { loadSource } from './sources/index.mjs';
import { planSync } from './engine.mjs';
import { fetchExisting, applyPlan } from './supabase-io.mjs';
import { printReport, writeLog } from './report.mjs';

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--file':      args.file = next(); break;
      case '--sheet':     args.sheet = next(); break;
      case '--worksheet': args.worksheet = next(); break;
      case '--range':     args.range = next(); break;
      case '--key-file':  args.keyFile = next(); break;
      case '--apply':     args.apply = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
    }
  }
  return args;
}

const HELP = `
RSVP sync — planning spreadsheet → Supabase

  --file <path>        Read an .xlsx / .csv export        (source: file)
  --sheet <id>         Read a Google Sheet by id          (source: API, not yet enabled)
  --worksheet <name>   Worksheet to read (default: first)
  --range <a1>         Sheets range (default: A:Z)
  --key-file <path>    Google service-account JSON
  --apply              Commit changes. Without it, nothing is written.
  -h, --help           This message

Environment (.env, loaded with --env-file):
  SUPABASE_URL                 Project URL
  SUPABASE_SERVICE_ROLE_KEY    Service-role key — required to write past RLS
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      '\nMissing Supabase credentials.\n\n' +
      '  SUPABASE_URL               ' + (url ? 'ok' : 'MISSING') + '\n' +
      '  SUPABASE_SERVICE_ROLE_KEY  ' + (key ? 'ok' : 'MISSING') + '\n\n' +
      'Copy .env.example to .env and fill it in, then run:\n' +
      '  node --env-file=.env scripts/sync/run.mjs --file <path>\n\n' +
      'The service-role key is required: the anon key cannot update rows under RLS.\n' +
      'Never commit it — .env is gitignored.\n'
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const source = await loadSource(args);
  if (!source.rows.length) {
    console.error(`No data rows found in ${source.name}.`);
    process.exitCode = 1;
    return;
  }

  const existing = await fetchExisting(supabase);
  const plan = planSync(source, existing);

  let results = { inserted: 0, updated: 0, errors: [] };
  if (args.apply) {
    results = await applyPlan(supabase, plan);
  }

  printReport({ source, plan, results, applied: args.apply, existingCount: existing.length });

  const logFile = writeLog({ source, plan, results, applied: args.apply });
  console.log(`log: ${logFile}\n`);

  if (results.errors.length) process.exitCode = 1;
}

main().catch(err => {
  console.error(`\nSync failed: ${err.message}\n`);
  process.exitCode = 1;
});
