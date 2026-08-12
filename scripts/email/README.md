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

## Running

```bash
npm run email:invites                          # preview — sends nothing
npm run email:invites -- --to you@example.com --send   # one, to yourself
npm run email:invites -- --limit 5 --send      # cautious first batch
npm run email:invites -- --send                # everyone eligible
```

**Dry run is the default.** Unlike the sync, this is not correctable on the
next run: an email that has gone out cannot be recalled. Work up through the
three steps above rather than starting at the last one.

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

41 checks, no network and no API key — a fake Resend that can be told to fail
on demand. It covers selection (which is what emails the wrong people if it is
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
