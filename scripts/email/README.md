# Wedding Confirmation & Information Pack

Sends the confirmation pack to **guests who have already RSVP'd**, via
[Resend](https://resend.com), then records the send on the guest's row.

This is not an invitation. It thanks them for replying and answers every
question they would otherwise message about: which parts of the day they are
invited to, what time, where, whether their plus one is confirmed, what to
wear, and how to give.

## The rule that governs everything

**A guest is shown only the events they are invited to.** Not greyed out, not
marked unavailable — absent from the HTML and from the plain text. Someone
invited to the Reception alone must finish the email unaware that an After
Party exists.

Every section is built from that guest's own event list, so an uninvited part
of the day cannot leak into the markup. Four tests assert it, including one
that greps the rendered output of a Reception pack for any mention of the
other two events.

## Before the first run

1. **Upload the five artwork files** to `public/email/` — `joining.png`,
   `reception.png`, `after-party.png`, `venue.png`, `dress-guide.png`. See
   `public/email/README.md` for sizes. Email clients cannot render embedded
   images, so these must be reachable at a public URL; serving them from the
   site's own domain is the least moving parts.

2. **Verify the sending domain in Resend.** Domains → Add Domain → add the DNS
   records. Resend rejects unverified senders outright, so this is not
   optional, and DNS can take a while to propagate — do it early.

3. **Fill in `.env`** (see `.env.example`):

   ```
   RESEND_API_KEY=re_…
   INVITE_SITE_URL=https://…      # the link inside the email
   INVITE_FROM=…                  # optional, must be on the verified domain
   ```

   Plus the `SUPABASE_*` values the sync already uses. The **service-role** key
   is required — the anon key cannot update rows under RLS. `.env` is
   gitignored.

4. **Confirm all five images load** in a browser at
   `https://<your-site>/email/joining.png` and so on. A missing hero renders as
   nothing at all rather than a broken box — deliberate, but it means a typo is
   silent.

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
npm run email:pack
```

Sends nothing, writes nothing. Read the eligible count and the **approved but
unreachable** list. If the count is wildly wrong, the problem is in the
spreadsheet, not here.

### 2. One email to yourself

```bash
npm run email:pack -- --to you@example.com --send
```

By default that renders the **Joining** pack, the widest one. Add
`--preview-tier RECEPTION` or `--preview-tier AFTERPARTY` to see the others.
`--to` takes any address and touches no guest row — nothing is marked Sent, and
your own address does not need to be in the guest list. Then check, in the
actual inbox:

- Does it arrive at all, and in the **inbox** rather than spam? If it is in
  spam, the domain's DNS is not fully verified in Resend; fix that before
  going further, because a spam-filed invitation is worse than none.
- Does the sender name read the way you want it to?
- Does it look right on a **phone**? That is where most guests will open it.
- **Do all five images load?** This is the most likely thing to be wrong.
- Do the times, venue and dress guide read correctly?
- Does **View Our Wedding Registry** open the Ouish page?
- Does the map link open the right venue?

Send it to a second address on a different provider — a Gmail and an Outlook,
say. Rendering differs more than you would expect.

### 3. One real guest

```bash
npm run email:pack -- --guest "Their Name" --send
```

The first send that marks somebody `Sent`. Pick someone who will tell you
honestly whether it looked right. `--guest` chooses *who*, not *whether*: a
guest who is not approved is still refused.

### 4. A pilot group

```bash
npm run email:pack -- --limit 5 --send
```

Five people, typed confirmation. Wait a day. Watch for bounces in the Resend
dashboard and for RSVPs arriving in Supabase — if five invitations produce zero
RSVPs, something is wrong that the previous steps could not have shown you.

### 5. Everyone

```bash
npm run email:pack -- --confirm-send-all --send
```

Only after step 4 has actually produced RSVPs.

## Tiers → events

One object in `events.mjs` decides this, and correcting it is a one-line change
there:

| `approved_for` | Sees | Hero artwork |
|---|---|---|
| `JOINING` | Wedding Service 12:00, Wedding Reception 14:00, After Party 18:00 | `joining.png` |
| `RECEPTION` | Wedding Reception 14:00 | `reception.png` |
| `AFTERPARTY` | After Party 18:00 | `after-party.png` |

The tiers are **nested downward, never upward**: `JOINING` is the whole day,
and each narrower tier must never learn what it is missing. That asymmetry is
the whole design — a Reception guest seeing the After Party is the failure
this module exists to prevent.

The key stays `JOINING` because that is what the planning sheet writes; only
the guest-facing name is *Wedding Service*. Existing rows keep working.

### Combinations

A guest is not always one tier. One cell can name several, and the events are
unioned — no schema change, no new tier value:

| `approved_for` | Sees |
|---|---|
| `RECEPTION, AFTERPARTY` | Reception + After Party |
| `Reception + After Party` | the same |
| `reception and after party` | the same |

Comma, `+`, `&`, `/` and the word "and" all separate. Order does not matter —
events always come out in running order. An unrecognised fragment is dropped
rather than failing the whole cell, so a stray note cannot silently strip a
guest of a real tier; if *nothing* parses, the guest is held back instead.

### Everything personalised follows from this

The badges, the schedule timeline, the hero artwork and the plain text all
read from one list. There is no second source anywhere, which is what makes
"a guest never sees an event they are not invited to" a property of the code
rather than something to remember. A Reception-only guest gets one timeline
stop; Reception + After Party gets two; the whole day gets three.

## The update series

Every email is numbered. The masthead reads:

```
WEDDING UPDATE #1
47 Days to Go
Your Invitation Has Been Confirmed
```

The number is the point: it tells a guest who has already RSVP'd that this is
not another invitation and that more will follow. The subject line carries it
too, so the series is visible in the inbox before it is opened.

**Sending the next one** is `number` and `title` in `config.mjs → UPDATE`, and
nothing else. The countdown is computed at send time, so it is right on the day
it goes out rather than the day it was written, and it degrades to *One Day to
Go* and *Today's the Day* on its own. Planned:

| # | Title |
|---|---|
| 2 | One Week To Go |
| 3 | Tomorrow's the Day |
| 4 | Thank You for Celebrating With Us |

## Previewing the design

```bash
npm run email:preview -- --placeholder   # stand-in artwork, before upload
npm run email:preview                    # the real hosted artwork
```

Writes all six variants to `scratch/email-preview/` as `.html` and `.txt`.
Open `reception-*.html` and confirm it says nothing about the other events.

## Who gets one

A guest is emailed when **all** of these hold:

| Condition | Column |
|---|---|
| Approved by the couple | `main_invite_status = 'APPROVED'` |
| **Has actually RSVP'd** | `attending = true` |
| Invited to at least one event | `approved_for` names a known tier |
| Plus one decided, if requested | `plus_one_status` |
| Not emailed yet | `email_status` is `NULL` or `'Not Sent'` |
| Has a usable address | `email` |

### Why "has RSVP'd" matters

The pack opens with *Thank you for RSVPing*. An approved guest who never
replied has nothing to be thanked for — and eleven such guests were entered
straight into the planning sheet, so `attending` is blank for them. They are
skipped and counted separately as the chase list.

### Why an undecided plus one holds the guest back

Telling someone their plus one cannot be accommodated when the couple has not
actually decided is not a mistake you can walk back. So `plus_one_requested`
with no decision is a **hold**, listed under *Waiting on you*, not a guess.

A guest who never asked for a plus one sees nothing about plus ones at all —
not a card, not a comment in the source.

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

134 checks, no network and no API key — a fake Resend that can be told to fail
on demand. It covers the **send guards** (that `--send` alone is refused, that
two scopes are refused, that `y` confirms nothing, that a batch phrase cannot
approve a full send), selection (which is what emails the wrong people if it is
wrong) and batch resilience (which is the requirement most likely to be quietly
broken by a later edit): that a failure mid-batch does not stop the run, that
guests after it still receive theirs, and that a failed guest is not marked
`Sent`.

## The design

Ported from the Banani export (`WeddingNewsletter.jsx`) — palette, spacing,
alternating cream bands, gold eyebrow labels, ✦ ◆ ✦ dividers and the dark
green footer all follow it.

Three constructs in the export cannot survive an email client and were
**rebuilt rather than copied**. Each is now asserted absent by a test, because
each fails silently rather than loudly:

| In the export | Why it breaks | Rebuilt as |
|---|---|---|
| `display:flex` rows | Outlook renders through Word — no flexbox | nested tables |
| the winding SVG timeline | Gmail strips inline `<svg>`; its labels were absolutely positioned, which Outlook ignores | a centre rule with times alternating left and right |
| the rotated teardrop date marker | `transform:rotate()` does not exist in email | a filled circle |

The calendar week is **derived from the wedding date**, not typed in, so it
cannot drift out of step with the real September 2026.

PT Serif and DM Sans load via a font link that Apple Mail honours and Gmail and
Outlook strip. Both stacks fall back to Georgia and Helvetica, which carry the
design on their own.

## What is still assumed

- The four artwork files are not in the repo yet.
- Event times (12:00 / 14:00 / 18:00) come from the invitation artwork.

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
