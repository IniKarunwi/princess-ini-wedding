#!/usr/bin/env node
/**
 * Preflight for a real send — npm run email:doctor
 *
 * Checks the things that actually go wrong on a first production send, against
 * the live services rather than against assumptions:
 *
 *   1. the environment is complete
 *   2. the Resend key works, and is not a test key
 *   3. the FROM domain is verified in Resend — the single most common failure
 *   4. every image the email references is reachable over https
 *   5. the RSVP site responds
 *
 * Reads .env the same way the sender does. Prints no secrets.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assetUrls, ASSET_FILES, SENT_ASSET_FILES, DEFAULT_FROM, SUBJECT } from './config.mjs';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
};

let failed = 0;
let warned = 0;
const ok   = (m, d) => console.log(`  ${c.green('ok')}    ${m}${d ? c.dim(`  ${d}`) : ''}`);
const warn = (m, d) => { warned++; console.log(`  ${c.amber('check')} ${m}${d ? c.dim(`  ${d}`) : ''}`); };
const bad  = (m, d) => { failed++; console.log(`  ${c.red('FAIL')}  ${m}${d ? c.dim(`  ${d}`) : ''}`); };

/**
 * Loads .env when the process was not started with --env-file.
 * Only fills what is missing, so a real environment variable always wins.
 */
function loadEnvFile() {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["'](.*)["']$/, '$1');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

const hadEnvFile = loadEnvFile();

/**
 * --site <url> checks the artwork URLs alone, with no .env and no secrets.
 * Useful straight after a deploy, and safe to run anywhere.
 */
const siteArg = process.argv.includes('--site')
  ? process.argv[process.argv.indexOf('--site') + 1]
  : null;
if (siteArg) process.env.INVITE_SITE_URL = siteArg;
const urlsOnly = Boolean(siteArg) || process.argv.includes('--urls-only');

console.log(`\n${c.bold('Preflight')}  ${
  urlsOnly ? c.dim('artwork URLs only')
           : hadEnvFile ? c.dim('.env loaded') : c.dim('no .env — reading the environment')}\n`);

// ── 1. Environment ──────────────────────────────────────────────────────────
if (!urlsOnly) console.log(c.bold('Configuration'));

const env = {
  RESEND_API_KEY:  process.env.RESEND_API_KEY,
  INVITE_SITE_URL: process.env.INVITE_SITE_URL,
  SUPABASE_URL:    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const from    = process.env.INVITE_FROM     || DEFAULT_FROM;
const replyTo = process.env.INVITE_REPLY_TO || null;

if (!urlsOnly) for (const [k, v] of Object.entries(env)) {
  // Never print a secret. Length alone is enough to tell "set" from "truncated".
  const secret = k.includes('KEY');
  if (!v) {
    const onlyForBatches = k.startsWith('SUPABASE');
    (onlyForBatches ? warn : bad)(`${k} is not set`,
      onlyForBatches ? 'needed for guest sends, not for --to' : '');
  } else {
    ok(k, secret ? `${v.length} chars` : v);
  }
}

if (!urlsOnly && env.RESEND_API_KEY && !/^re_/.test(env.RESEND_API_KEY)) {
  warn('RESEND_API_KEY does not start with re_', 'is that a Resend key?');
}

const fromAddress = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
const fromDomain  = fromAddress.split('@')[1];
if (!urlsOnly) {
  ok('From', from);
  console.log(`  ${c.dim('      Reply-to')} ${c.dim(replyTo ?? '(same as From)')}`);
  console.log(`  ${c.dim('      Subject ')} ${c.dim(SUBJECT)}`);
}

// ── 2 & 3. Resend ───────────────────────────────────────────────────────────
if (!urlsOnly) console.log(`\n${c.bold('Resend')}`);

if (urlsOnly) {
  // skipped
} else if (!env.RESEND_API_KEY) {
  bad('cannot check the account without RESEND_API_KEY');
} else {
  let res, body;
  try {
    res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    bad('could not reach api.resend.com', e.message);
  }

  if (res && res.status === 401) {
    bad('the API key was rejected', 'check it was copied whole, and not revoked');
  } else if (res && !res.ok) {
    bad(`Resend replied HTTP ${res.status}`, body?.message ?? '');
  } else if (res) {
    const domains = body?.data ?? [];
    ok('API key accepted', `${domains.length} domain(s) on the account`);

    const match = domains.find(d => d.name?.toLowerCase() === fromDomain?.toLowerCase());
    if (!match) {
      bad(`${fromDomain} is not on this Resend account`,
          domains.length ? `has: ${domains.map(d => d.name).join(', ')}` : 'no domains added');
      console.log(c.dim(`        Either verify ${fromDomain}, or set INVITE_FROM to a verified domain.`));
    } else if (match.status !== 'verified') {
      bad(`${fromDomain} is ${match.status}, not verified`,
          'Resend rejects sends from an unverified domain');
      console.log(c.dim('        Resend → Domains → check the DNS records have propagated.'));
    } else {
      ok(`${fromDomain} is verified`, match.region ? `region ${match.region}` : '');
    }
  }
}

// ── 4. Artwork over https ───────────────────────────────────────────────────
console.log(`\n${c.bold('Artwork')}  ${c.dim('as a guest\'s email client will fetch it')}`);

if (!env.INVITE_SITE_URL) {
  bad('cannot check images without INVITE_SITE_URL');
} else {
  const urls = assetUrls({
    siteUrl: env.INVITE_SITE_URL,
    baseUrl: process.env.INVITE_ASSET_BASE_URL,
  });

  let total = 0;
  for (const [key, url] of Object.entries(urls)) {
    const file = ASSET_FILES[key];
    try {
      // HEAD first; some hosts do not implement it, so fall back to a ranged GET.
      let r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (r.status === 405 || r.status === 501) {
        r = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
      }
      if (!r.ok && r.status !== 206) {
        bad(file, `HTTP ${r.status} — the email will show nothing here`);
        continue;
      }
      const type = r.headers.get('content-type') ?? '';
      const len  = Number(r.headers.get('content-length') ?? 0);
      total += len;

      if (!/^image\//.test(type)) {
        bad(file, `served as ${type || 'no content-type'} — clients may refuse it`);
      } else {
        ok(file, `${type}${len ? `, ${(len / 1024).toFixed(0)}KB` : ''}`);
      }
    } catch (e) {
      bad(file, e.message);
    }
  }
  if (total) {
    const mb = total / 1024 / 1024;
    const line = `${mb.toFixed(2)}MB if a guest loaded every image`;
    mb > 3 ? warn('total artwork weight', line) : ok('total artwork weight', line);
  }

  // ── The artwork ALREADY-DELIVERED email points at ─────────────────────────
  // 136 confirmation packs are in inboxes with /email/<name>.png written into
  // them. An email fetches its images when it is OPENED, so these URLs have to
  // keep resolving for as long as anyone might reopen theirs. Nothing we send
  // from now on uses them, which is exactly why they need checking here — a
  // break would be invisible from the sending side and show up only as
  // artwork quietly vanishing out of mail people already have.
  console.log(`\n${c.bold('Delivered artwork')}  ${c.dim('the .png URLs in the 136 already sent')}`);
  const sent = assetUrls({
    siteUrl: env.INVITE_SITE_URL,
    baseUrl: process.env.INVITE_ASSET_BASE_URL,
    files: SENT_ASSET_FILES,
  });
  for (const [key, url] of Object.entries(sent)) {
    const file = SENT_ASSET_FILES[key];
    try {
      let r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (r.status === 405 || r.status === 501) {
        r = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
      }
      if (!r.ok && r.status !== 206) {
        bad(file, `HTTP ${r.status} — artwork has disappeared from mail already sent`);
        continue;
      }
      const type = r.headers.get('content-type') ?? '';
      const len  = Number(r.headers.get('content-length') ?? 0);
      const kb   = len ? `, ${(len / 1024).toFixed(0)}KB` : '';
      // Still resolving but never shrunk means the delivered mail is still
      // loading the multi-megabyte originals that caused the placeholders.
      if (len > 1024 * 1024) warn(file, `${type}${kb} — deploy the shrunk PNG`);
      else ok(file, `${type}${kb}`);
    } catch (e) {
      bad(file, e.message);
    }
  }
}

// ── 5. The RSVP site ────────────────────────────────────────────────────────
console.log(`\n${c.bold('Site')}`);
if (!env.INVITE_SITE_URL) {
  bad('INVITE_SITE_URL is not set');
} else {
  try {
    const r = await fetch(env.INVITE_SITE_URL, { redirect: 'follow' });
    r.ok ? ok('the site responds', `HTTP ${r.status}`)
         : bad('the site did not respond well', `HTTP ${r.status}`);
  } catch (e) {
    bad('could not reach the site', e.message);
  }
}

// ── Verdict ─────────────────────────────────────────────────────────────────
console.log('');
if (failed) {
  console.log(c.red(`${failed} problem(s) to fix before sending.\n`));
  process.exitCode = 1;
} else if (warned) {
  console.log(c.amber(`Ready to send, with ${warned} thing(s) worth a look above.\n`));
} else {
  console.log(c.green('Everything checks out.\n'));
}

console.log(c.dim(urlsOnly
  ? 'Full check:  npm run email:doctor    (needs .env)\n'
  : 'Next:  npm run email:pack -- --to you@example.com --send\n'));
