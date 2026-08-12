/**
 * Send guards — pure decision logic, no I/O.
 *
 * The rule this file exists to enforce: **no single flag can send to the whole
 * guest list.** Sending is the one action here that cannot be undone, so the
 * scope of a run has to be stated deliberately, and the widest scope costs the
 * most keystrokes.
 *
 * Kept separate from the CLI so every branch can be tested without a network,
 * a database, or an API key. A guard that is only exercised by running the
 * real thing is a guard nobody trusts.
 */

/** The four ways a run can be scoped, narrowest first. */
export const MODE = {
  DRY_RUN:  'dry-run',   // default — nothing sent, nothing written
  SAMPLE:   'sample',    // --to <address>: one email, not a real guest
  GUEST:    'guest',     // --guest <id|email|name>: one real guest
  LIMITED:  'limited',   // --limit <n>: first n eligible guests
  ALL:      'all',       // --confirm-send-all: everyone eligible
};

/**
 * Decides what a set of flags means, or why it is refused.
 *
 * Returns { ok: true, mode, … } or { ok: false, error, hint }.
 * The caller never re-derives any of this; if it is not decided here, it is
 * not decided.
 */
export function resolveMode(args) {
  const scopes = [
    args.to           !== undefined && '--to',
    args.guest        !== undefined && '--guest',
    args.limit        !== undefined && '--limit',
    args.confirmSendAll            && '--confirm-send-all',
  ].filter(Boolean);

  // More than one scope is ambiguous. Refuse rather than pick — guessing here
  // means guessing how many people get an email.
  if (scopes.length > 1) {
    return {
      ok: false,
      error: `Conflicting scope flags: ${scopes.join(' and ')}.`,
      hint: 'Pass exactly one of --to, --guest, --limit or --confirm-send-all.',
    };
  }

  // Without --send nothing leaves the machine, so any scope is safe to preview.
  if (!args.send) {
    return { ok: true, mode: MODE.DRY_RUN, requiresConfirmation: false };
  }

  if (args.to    !== undefined) return { ok: true, mode: MODE.SAMPLE,  requiresConfirmation: false };
  if (args.guest !== undefined) return { ok: true, mode: MODE.GUEST,   requiresConfirmation: true };
  if (args.limit !== undefined) return { ok: true, mode: MODE.LIMITED, requiresConfirmation: true };

  if (args.confirmSendAll) {
    return { ok: true, mode: MODE.ALL, requiresConfirmation: true };
  }

  // --send on its own. This is the case the whole file exists for.
  return {
    ok: false,
    error: '--send needs a scope. On its own it would email the entire guest list.',
    hint: [
      'Narrowest first:',
      '  --to you@example.com --send      one sample to yourself, no guest touched',
      '  --guest "Ada Obi" --send         one real guest',
      '  --limit 5 --send                 the first 5 eligible guests',
      '  --confirm-send-all --send        everyone (asks for confirmation)',
    ].join('\n'),
  };
}

/**
 * Finds one guest by id, email or name.
 *
 * Ambiguity is refused rather than resolved: two guests named "Grace" means
 * the operator has to say which, not that we pick the first one.
 */
export function findGuest(rows, needle) {
  const q = String(needle).trim().toLowerCase();
  if (!q) return { ok: false, error: '--guest needs an id, email or name.' };

  const byId = rows.filter(r => String(r.id).toLowerCase() === q);
  if (byId.length === 1) return { ok: true, row: byId[0] };

  const byEmail = rows.filter(r => String(r.email ?? '').trim().toLowerCase() === q);
  if (byEmail.length === 1) return { ok: true, row: byEmail[0] };

  const byName = rows.filter(r => String(r.full_name ?? '').trim().toLowerCase() === q);
  if (byName.length === 1) return { ok: true, row: byName[0] };

  const partial = rows.filter(r => String(r.full_name ?? '').toLowerCase().includes(q));
  if (partial.length === 1) return { ok: true, row: partial[0] };

  if (partial.length > 1) {
    return {
      ok: false,
      error: `"${needle}" matches ${partial.length} guests.`,
      hint: 'Use the full name or the email address:\n' +
        partial.slice(0, 10)
          .map(r => `  ${(r.full_name || '(no name)').padEnd(30)} ${r.email ?? '(no email)'}`)
          .join('\n'),
    };
  }
  return { ok: false, error: `No guest matches "${needle}".` };
}

/**
 * The phrase the operator must type to proceed.
 *
 * Deliberately not "y". It embeds the recipient count, so it cannot be typed
 * from muscle memory and cannot be right unless the list above it was actually
 * read. A full send additionally requires the word ALL, so the widest action
 * never shares a confirmation phrase with a narrow one.
 */
export function confirmationPhrase(mode, count) {
  return mode === MODE.ALL ? `SEND ALL ${count}` : `SEND ${count}`;
}

/** Compares what was typed against the phrase. Case-insensitive, space-tolerant. */
export function matchesPhrase(typed, phrase) {
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return norm(typed) === norm(phrase) && norm(typed) !== '';
}
