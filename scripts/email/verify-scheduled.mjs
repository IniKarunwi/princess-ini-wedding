#!/usr/bin/env node
/**
 * Checks what Resend actually holds, against what the run said it queued.
 *
 *   npm run email:final-details:verify
 *
 * Read-only: one GET per message, no writes, nothing sent, nothing cancelled.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * A scheduled run ends with Resend having ACCEPTED 140 messages. That is not
 * the same as 140 messages being scheduled for the right minute, and the
 * difference is not visible from the sender's own output — it only knows what
 * it asked for. This asks Resend.
 *
 * It reads scratch/final-details-scheduled.json, written by the send, and for
 * every id reports the state Resend has it in and the instant it will go. The
 * summary is deliberately blunt: a count of messages scheduled for the
 * expected time, and a list of every one that is not.
 *
 * Resend has no endpoint that lists a campaign, so the receipt file is the
 * only record of which 140 ids belong to this run. Do not delete it before
 * the mail has gone.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { inWAT } from './schedule.mjs';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

const RECEIPT = join(process.cwd(), 'scratch', 'final-details-scheduled.json');

async function get(id, key, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { error: `HTTP ${res.status}${body?.message ? `: ${body.message}` : ''}` };
  return body;
}

/**
 * Compares one Resend record against what was asked for.
 * Pure, so the verdicts can be tested without a network.
 */
export function verdictFor(record, expectedIso) {
  if (record?.error) return { ok: false, state: 'unreadable', detail: record.error };

  const state = record?.last_event ?? '(none)';
  const at = record?.scheduled_at ?? null;

  if (!at) {
    return { ok: false, state, detail: 'Resend holds no scheduled_at — this one is NOT scheduled' };
  }
  const same = new Date(at).getTime() === new Date(expectedIso).getTime();
  if (!same) return { ok: false, state, detail: `scheduled for ${at}, expected ${expectedIso}` };
  if (state === 'canceled' || state === 'cancelled') {
    return { ok: false, state, detail: 'cancelled — it will not be delivered' };
  }
  return { ok: true, state, detail: at };
}

async function main() {
  const key = String(process.env.RESEND_API_KEY ?? '').trim();
  if (!key) throw new Error('RESEND_API_KEY is needed. Run with --env-file=.env.');

  if (!existsSync(RECEIPT)) {
    throw new Error(
      `No receipt at ${RECEIPT}.\n` +
      'It is written by a scheduled send. Without it there is no record of\n' +
      'which message ids belong to this campaign — Resend cannot list them.');
  }
  const receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  const expected = receipt.scheduledAt;
  if (!expected) throw new Error('That receipt is from an immediate send — there is nothing to verify.');

  console.log(`\n${c.bold('═══ WHAT RESEND ACTUALLY HOLDS ═══')}`);
  console.log(`  ${c.dim(`receipt: ${RECEIPT}`)}`);
  console.log(`  ${c.dim(`queued at ${receipt.runAt} · ${receipt.count} messages`)}`);
  console.log(`  ${c.bold(`expected delivery: ${expected}  (${receipt.scheduledAtWAT ?? inWAT(new Date(expected))})`)}`);
  console.log(`  ${c.dim('read-only: one GET each, nothing sent, nothing cancelled')}\n`);

  let good = 0;
  const bad = [];

  for (const m of receipt.messages) {
    const v = verdictFor(await get(m.id, key), expected);
    if (v.ok) {
      good++;
      process.stdout.write(c.green('.'));
    } else {
      bad.push({ ...m, ...v });
      process.stdout.write(c.red('x'));
    }
  }

  console.log(`\n\n${c.bold('Result')}`);
  console.log(`  scheduled for the expected instant ... ` +
              `${(good === receipt.count ? c.green : c.amber)(String(good).padStart(5))} of ${receipt.count}`);
  console.log(`  not as expected ...................... ` +
              `${(bad.length ? c.red : c.green)(String(bad.length).padStart(5))}`);

  for (const b of bad) {
    console.log(`\n  ${c.red('✗')} ${b.email}  ${c.dim(b.id)}`);
    console.log(`     ${c.dim(`${b.state} — ${b.detail}`)}`);
  }

  if (good === receipt.count && !bad.length) {
    console.log(`\n  ${c.green('All')} ${receipt.count} are scheduled for ${receipt.scheduledAtWAT}.`);
    console.log(`  ${c.dim('Scheduled, not delivered. Check again after that time for delivery.')}\n`);
  } else {
    console.log(`\n  ${c.red('Do not assume the campaign is correctly scheduled.')}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\n${c.red('✗')} ${e.message}`);
    process.exitCode = 1;
  });
}
