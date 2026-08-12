# Invitation emails

Sends the wedding invitation to **approved guests who have not been emailed
yet**, via [Resend](https://resend.com), then records the send on the guest's
row.

## Before the first run

1. **Verify the sending domain in Resend.** Domains → Add Domain → add the DNS
   records. Resend rejects unverified senders outright, so this is not
   optional, and DNS can take a while to propagate — do it early.

2. **Fill in `.env`** (see `.env.example`):

   ```
   RESEND_API_KEY=re_…
   INVITE_SITE_URL=https://…      # the link inside the email
   INVITE_FROM=…                  # optional, must be on the verified domain
   ```

   Plus the `SUPABASE_*` values the sync already uses. The **service-role** key
   is required — the anon key cannot update rows under RLS. `.env` is
   gitignored.

3. **Check the site link in a browser.** The RSVP button is the entire purpose
   of the email.

## Sending is deliberately hard to do by accident

An email that has gone out cannot be recalled, so **no single flag sends to
the whole guest list.** `--send` on its own is refused:

```
--send needs a scope. On its own it would email the entire guest list.
```

Every run needs exactly one scope, and the widest one costs the most
keystrokes:

| Scope | Reaches | Confirmation |
|---|---|---|
| *(none)* | nobody — dry run, the default | — |
| `--to <email>` | one address, **not** a guest; nothing is written | none |
| `--guest <id\|email\|name>` | one real guest | typed |
| `--limit <n>` | the first n eligible guests | typed |
| `--confirm-send-all` | everyone eligible | typed, distinct phrase |

Two scopes at once is refused rather than resolved — guessing there means
guessing how many people get an email.

### The recipient list is printed before every send

Not only in dry run. Then the run stops and waits for you to type a phrase
that **contains the recipient count**:

```
About to email the 5 guest(s) listed above.
Type SEND 5 to proceed, or anything else to abort.
> 
```

`y` does not work. Neither does `SEND 4`. The count cannot be right unless the
list above it was actually read. A full send needs `SEND ALL 187`, a phrase a
narrower run never uses, so approving a batch can never approve everyone.

`--yes` skips the prompt for narrow scopes. It is **refused for a full send** —
that one is always typed by hand.

If stdin is not a terminal the run refuses to send at all. That is deliberate:
it means a cron job or a piped command can never trigger a batch.

## The rollout, in order

Each step answers a question the next one depends on. Do not skip ahead.

### 1. Preview — who would get one

```bash
npm run email:invites
```

Sends nothing, writes nothing. Read the eligible count and the **approved but
unreachable** list. If the count is wildly wrong, the problem is in the
spreadsheet, not here.

### 2. One email to yourself

```bash
npm run email:invites -- --to you@example.com --send
```

`--to` takes any address and touches no guest row — nothing is marked Sent, and
your own address does not need to be in the guest list. Then check, in the
actual inbox:

- Does it arrive at all, and in the **inbox** rather than spam? If it is in
  spam, the domain's DNS is not fully verified in Resend; fix that before
  going further, because a spam-filed invitation is worse than none.
- Does the sender name read the way you want it to?
- Does it look right on a **phone**? That is where most guests will open it.
- Does the **RSVP button** open the live site?
- Complete an RSVP end to end. Does it land in Supabase?
- Does **Add to calendar** open the right date, 26 September 2026?

Send it to a second address on a different provider — a Gmail and an Outlook,
say. Rendering differs more than you would expect.

### 3. One real guest

```bash
npm run email:invites -- --guest "Their Name" --send
```

The first send that marks somebody `Sent`. Pick someone who will tell you
honestly whether it looked right. `--guest` chooses *who*, not *whether*: a
guest who is not approved is still refused.

### 4. A pilot group

```bash
npm run email:invites -- --limit 5 --send
```

Five people, typed confirmation. Wait a day. Watch for bounces in the Resend
dashboard and for RSVPs arriving in Supabase — if five invitations produce zero
RSVPs, something is wrong that the previous steps could not have shown you.

### 5. Everyone

```bash
npm run email:invites -- --confirm-send-all --send
```

Only after step 4 has actually produced RSVPs.

## Who gets one

A guest is emailed when **all** of these hold:

| Condition | Column |
|---|---|
| Approved by the couple | `main_invite_status = 'APPROVED'` |
| Not emailed yet | `email_status` is `NULL` or `'Not Sent'` |
| Has a usable address | `email` |

Everyone else is skipped **with a printed reason**, because "why did 40 of my
187 guests get nothing" is the first question anyone asks.

### `NULL` counts as "Not Sent"

`email_status` was added nullable with no default, so almost every row holds
`NULL` rather than the sheet's literal `Not Sent`. Matching only the literal
would have selected **nobody at all**. Both are treated as unsent, and the
comparison ignores case and spacing — the value has two authors, this script
and whoever is typing in the planning sheet.

### Unusable addresses

Not full RFC validation, which is not worth attempting. It catches the shapes
that actually turn up in a hand-maintained spreadsheet: a phone number in the
email column, a bare name, a trailing comma from a paste, two addresses in one
cell. These are listed under **Approved but unreachable** — they are the rows
someone can go and fix, unlike "not approved yet".

## What happens when one fails

The batch continues. Each guest is independent:

| Outcome | `email_status` | Next run |
|---|---|---|
| Sent | `Sent`, with `last_email_sent` | skipped |
| Send failed | untouched | **retried** |
| Sent, but the row update failed | untouched | retried — harmless, see below |

Failures are collected and printed at the end with the guest, the address and
the provider's reason, and the run exits non-zero. Because a failure leaves
the status untouched, **re-running retries exactly the guests that failed** and
nobody else.

Transient failures (429, 5xx, dropped connections) are retried in place, twice,
with backoff. A rejected address is *not* retried — it will be rejected again,
and retrying only burns rate limit.

### Sending twice is prevented at the provider

Every send carries `Idempotency-Key: invitation:<guest id>`. If a send reaches
Resend but the response is lost, the retry returns the original message instead
of delivering a second copy. This is also why the third row above is harmless.

The "sent, not recorded" case is still reported separately and loudly, with the
exact `UPDATE` needed to fix it by hand — the guest *has* been emailed, and
that should never be silent.

## Pacing

One at a time, ~600ms apart, staying under Resend's default 2 requests/second.
Serial rather than parallel: the list is dozens of guests, the run is not
time-critical, and it makes every failure exactly attributable.

## Tests

```bash
npm run test:email
```

70 checks, no network and no API key — a fake Resend that can be told to fail
on demand. It covers the **send guards** (that `--send` alone is refused, that
two scopes are refused, that `y` confirms nothing, that a batch phrase cannot
approve a full send), selection (which is what emails the wrong people if it is
wrong) and batch resilience (which is the requirement most likely to be quietly
broken by a later edit): that a failure mid-batch does not stop the run, that
guests after it still receive theirs, and that a failed guest is not marked
`Sent`.

## Relationship to `message_queue`

Migration **0006 drops `email_status` and `last_email_sent`** from `rsvps`,
moving delivery state into `message_queue`. This script depends on those two
columns, so **the two cannot both be live.**

`0006 has not been applied.` Hold it back until the invitations are out. The
script checks at startup and stops with an explanation rather than failing
later with an unreadable PostgREST column error.

When the queue does go live, this script's producer half becomes a call to
`enqueue_message(rsvp_id, 'email', 'invitation', …)`, and the sending half
becomes the worker that drains it. The selection rules in `recipients.mjs` and
the template in `template.mjs` carry over untouched — they are pure and know
nothing about where state is stored.
