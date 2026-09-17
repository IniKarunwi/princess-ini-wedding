/**
 * Guest passes — token model and generation.
 *
 *   npm run pass:generate                 dry run over every eligible party
 *   npm run pass:generate -- --write      actually issue the missing ones
 *   npm run pass:generate -- --guest "Ada Obi"      one party, dry run
 *   npm run pass:generate -- --guest "Ada Obi" --write
 *   npm run pass:revoke  -- --guest "Ada Obi" --reason "phone lost" --write
 *
 * ── The token ──────────────────────────────────────────────────────────────
 * 32 bytes from crypto.randomBytes, base64url. That is 256 bits of entropy —
 * unguessable, and nothing about it is derived from the guest, so one token
 * tells you nothing about any other. Sequential ids are never exposed.
 *
 * ── Only the hash is stored ────────────────────────────────────────────────
 * guest_passes.token_hash holds sha256(token). The raw token is returned once,
 * at generation, goes into the pass URL, and is never written to the database.
 *
 * The reason is the failure everyone plans for too late: if the guest table
 * leaks, an attacker with raw tokens holds working passes for every guest at
 * the wedding. With hashes they hold nothing — a hash cannot be presented at
 * the door, and sha256 of 256 random bits is not reversible.
 *
 * The cost is real: a token the database never saw cannot be read back, so
 * the email sender could not retrieve a guest's pass URL to put in the email.
 * Discarding the token outright would make generation and sending impossible
 * to separate.
 *
 * So the raw tokens are written to data/passes.jsonl — a local, gitignored
 * vault on the couple's own machine. The DATABASE stays hash-only, which is
 * what protects against the realistic threat here (the anon key is in the
 * browser bundle, so a table leak is the thing to design against). The vault
 * is a file one person holds and can delete after the final email goes out.
 *
 * Treat data/passes.jsonl as a credential file: never commit it, never paste
 * it, delete it once the passes have been delivered.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 * A partial unique index in 0007 allows ONE non-revoked pass per rsvp. This
 * script reads the existing passes first and only issues where none exists, so
 * running it twice issues nothing the second time. The index is the real
 * guarantee — it holds even if two people run this at once.
 *
 * ── Rotation without loss of identity ──────────────────────────────────────
 * Regenerating a QR IMAGE needs no new token: the image is a render of the
 * pass URL, so re-rendering changes nothing. Rotation (a compromised token) is
 * a different act — revoke the old row, insert a new one for the same rsvp.
 * The old pass stops working, the audit trail keeps both, and the guest's
 * check-in history is untouched because it hangs off rsvp_id, not the pass.
 */

import { randomBytes, createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TABLE } from '../email/config.mjs';
import { shouldHavePass, partySize, permittedEvents, EVENT_LABEL } from './permissions.mjs';

/** Where a pass lives. The QR encodes exactly this and nothing else. */
export function passUrl(siteUrl, token) {
  return `${String(siteUrl).replace(/\/+$/, '')}/pass/${token}`;
}

/** 256 bits, URL-safe. */
export function newToken() {
  return randomBytes(32).toString('base64url');
}

/** What the database stores. Never the token itself. */
export function hashToken(token) {
  return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * The local vault of raw tokens.
 *
 * JSON Lines, append-only, gitignored. One line per issued pass. The email
 * sender reads it; nothing else should. If it is lost, passes are not lost —
 * revoke and re-issue, which is one command per guest.
 */
export const VAULT = join(process.cwd(), 'data', 'passes.jsonl');

export function readVault() {
  if (!existsSync(VAULT)) return new Map();
  const byRsvp = new Map();
  for (const line of readFileSync(VAULT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      // Later lines win, so a rotated token supersedes the one it replaced.
      if (r.rsvp_id && r.token) byRsvp.set(r.rsvp_id, r);
    } catch { /* a truncated last line is not worth failing a send over */ }
  }
  return byRsvp;
}

function appendVault(entry) {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  appendFileSync(VAULT, JSON.stringify(entry) + '\n', { mode: 0o600 });
}

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
};

/* ── Plan, without touching anything ───────────────────────────────────────── */

/**
 * Works out what generation WOULD do. Pure: give it rows and existing passes
 * and it decides, so the dry run and the real run share one code path and
 * cannot disagree about who is eligible.
 */
export function planPasses(rows, existingByRsvp) {
  const issue = [];
  const already = [];
  const skipped = [];

  for (const row of rows) {
    if (!shouldHavePass(row)) {
      skipped.push({ row, reason: reasonNotEligible(row) });
      continue;
    }
    if (existingByRsvp.has(row.id)) {
      already.push({ row, pass: existingByRsvp.get(row.id) });
      continue;
    }
    issue.push({ row });
  }
  return { issue, already, skipped };
}

function reasonNotEligible(row) {
  const status = String(row?.main_invite_status ?? '').trim();
  if (status === '') return 'invitation still pending — no decision recorded';
  if (status.toUpperCase() !== 'APPROVED') return `not approved (${status})`;
  const tier = String(row?.approved_for ?? '').trim();
  return tier === '' ? 'approved but no tier set' : `unrecognised tier: ${tier}`;
}

/* ── CLI ───────────────────────────────────────────────────────────────────── */

const RUN = process.argv[1] && /passes\.mjs$/.test(process.argv[1]);

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const write  = argv.includes('--write');
  const revoke = argv.includes('--revoke');
  const guest  = arg('--guest');
  const reason = arg('--reason');

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = process.env.INVITE_SITE_URL || 'https://princessandini.com';

  if (!url || !key) {
    console.error(`\n${c.red('Needs database access.')}\n\n` +
      '  SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY\n\n' +
      'in .env. The service role key is required because RLS denies everyone\n' +
      'else — that is the point of it.\n');
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Every row, paged. PostgREST caps a response at 1000.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(TABLE).select('*').order('id').range(from, from + 999);
    if (error) throw new Error(`Supabase: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const { data: passes, error: pErr } = await db
    .from('guest_passes').select('*').is('revoked_at', null);
  if (pErr) {
    throw new Error(`guest_passes: ${pErr.message}\n\n` +
      'If this says the relation does not exist, 0007_wedding_day.sql has not\n' +
      'been applied yet. Run it in the Supabase SQL editor first.');
  }
  const existing = new Map(passes.map(p => [p.rsvp_id, p]));

  const target = guest
    ? rows.filter(r => String(r.full_name ?? '').toLowerCase().includes(guest.toLowerCase())
                    || String(r.email ?? '').toLowerCase() === guest.toLowerCase())
    : rows;

  if (guest && target.length === 0) {
    console.error(`\n${c.red(`No guest matches "${guest}".`)}\n`);
    process.exitCode = 1;
    return;
  }
  if (guest && target.length > 1) {
    console.error(`\n${c.red(`"${guest}" matches ${target.length} guests — be more specific:`)}\n`);
    for (const r of target.slice(0, 10)) console.error(`  ${r.full_name}  ${c.dim(r.email ?? '')}`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  /* ── Revoke / rotate ────────────────────────────────────────────────────── */
  if (revoke) {
    const row = target[0];
    const pass = existing.get(row.id);
    console.log(`\n${c.bold('Revoke')}  ${row.full_name}`);
    if (!pass) { console.log(c.amber('  no active pass — nothing to revoke\n')); return; }
    if (!reason) { console.error(c.red('  --reason is required, so the ledger says why\n')); process.exitCode = 1; return; }
    if (!write) {
      console.log(c.dim(`  would revoke pass ${pass.id} and issue a replacement`));
      console.log(`\n${c.bold('DRY RUN')} — add --write to apply.\n`);
      return;
    }
    await db.from('guest_passes').update({ revoked_at: new Date().toISOString(), revoked_reason: reason }).eq('id', pass.id);
    const token = newToken();
    await db.from('guest_passes').insert({ rsvp_id: row.id, token_hash: hashToken(token) });
    appendVault({ rsvp_id: row.id, full_name: row.full_name, token, issued_at: new Date().toISOString(), rotated: true });
    console.log(c.green('  revoked, replacement issued'));
    console.log(`  ${c.bold(passUrl(site, token))}`);
    console.log(c.dim('  ^ the only time this URL is ever shown. It is not recoverable.\n'));
    return;
  }

  /* ── Generate ───────────────────────────────────────────────────────────── */
  const plan = planPasses(target, existing);

  console.log(`\n${c.bold('Guest passes')}  ${c.dim(`${rows.length} rsvps, ${existing.size} active passes`)}`);
  console.log(`\n  ${c.green('to issue')}        ${String(plan.issue.length).padStart(4)}`);
  console.log(`  ${c.dim('already have one')} ${String(plan.already.length).padStart(4)}   ${c.dim('left alone — generation is idempotent')}`);
  console.log(`  ${c.dim('not eligible')}     ${String(plan.skipped.length).padStart(4)}`);

  // A pass in the database whose token we no longer hold cannot be emailed.
  // Worth knowing BEFORE the final send rather than during it.
  const vault = readVault();
  const orphaned = plan.already.filter(({ row }) => !vault.has(row.id));
  if (orphaned.length) {
    console.log(`\n  ${c.amber(`${orphaned.length} pass(es) exist but their token is not in the vault.`)}`);
    console.log(c.dim('  Those guests cannot be emailed a link until the pass is rotated:'));
    console.log(c.dim(`    npm run pass:revoke -- --guest "<name>" --reason "token lost" --write`));
  }

  if (plan.issue.length) {
    console.log(`\n${c.bold('Would issue')}`);
    for (const { row } of plan.issue.slice(0, guest ? 5 : 40)) {
      console.log(`  ${(row.full_name || '(no name)').slice(0, 30).padEnd(31)}` +
                  `${c.dim(`party ${String(partySize(row)).padStart(2)}  ` +
                  permittedEvents(row).map(k => EVENT_LABEL[k]).join(', '))}`);
    }
    if (!guest && plan.issue.length > 40) console.log(c.dim(`  … and ${plan.issue.length - 40} more`));
  }

  const byReason = new Map();
  for (const s of plan.skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
  if (byReason.size) {
    console.log(`\n${c.bold('Not eligible')}`);
    for (const [r, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${r}`);
    }
  }

  if (!write) {
    console.log(`\n${c.bold('DRY RUN')} — nothing written.`);
    console.log(`Add ${c.bold('--write')} to issue the ${plan.issue.length} missing pass(es).\n`);
    return;
  }

  let issued = 0;
  const urls = [];
  for (const { row } of plan.issue) {
    const token = newToken();
    const { error } = await db.from('guest_passes').insert({ rsvp_id: row.id, token_hash: hashToken(token) });
    if (error) {
      // The partial unique index. Someone else issued one between the read and
      // this write — which is the index doing its job, not a failure.
      if (/duplicate key/i.test(error.message)) {
        console.log(`  ${c.amber('skip')} ${row.full_name} ${c.dim('— a pass appeared concurrently')}`);
        continue;
      }
      throw new Error(`${row.full_name}: ${error.message}`);
    }
    issued++;
    appendVault({ rsvp_id: row.id, full_name: row.full_name, token, issued_at: new Date().toISOString() });
    urls.push([row.full_name, passUrl(site, token)]);
  }

  console.log(`\n  ${c.green(`issued ${issued}`)}`);
  if (guest && urls.length) {
    console.log(`\n  ${c.bold(urls[0][1])}`);
    console.log(c.dim('  ^ shown once. The database holds only a hash, so this is not recoverable.\n'));
  } else if (urls.length) {
    console.log(c.dim(`\n  URLs are not printed for a bulk run — they are credentials and a terminal\n` +
                      `  scrollback is not where they belong. They are in ${VAULT},\n` +
                      '  which is gitignored and mode 0600. The email sender reads it at send\n' +
                      '  time; delete it once the passes have gone out.\n'));
  }
}

if (RUN) {
  main().catch(err => {
    console.error(`\n${c.red('Failed')}\n\n${err.message}\n`);
    process.exitCode = 1;
  });
}
