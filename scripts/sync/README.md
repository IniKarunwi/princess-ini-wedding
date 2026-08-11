# RSVP Sync

One-way sync: **planning spreadsheet → Supabase `rsvps`**. Nothing flows back
to the sheet, and nothing here touches the website.

## Setup (once)

1. **Run the migrations.** Supabase dashboard → SQL Editor → paste
   `supabase/migrations/APPLY_ALL.sql` → Run. It is 0001–0006 concatenated in
   order and is safe to re-run.

   Run it **whole**, top to bottom. 0001 adds the four messaging columns and
   0006 drops them again; that ordering is only guaranteed if the file is run
   in one go, which is why `APPLY_ALL.sql` exists rather than a list of files
   to paste individually.

2. **Create `.env`** from `.env.example` and fill in:

   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   ```

   The **service-role** key is required — the anon key cannot update rows under
   RLS. It bypasses row-level security, so it is server-side only and must never
   reach the browser. `.env` is gitignored.

## Running

Export the sheet to `.xlsx`/`.csv`, then:

```bash
npm run sync:rsvps -- --file ./data/rsvps.xlsx           # preview, writes nothing
npm run sync:rsvps -- --file ./data/rsvps.xlsx --apply   # commit
```

**Dry run is the default.** Always read the preview before `--apply`; it lists
every insert and every field-level change.

Offline check of the pipeline itself, no database needed:

```bash
node scripts/sync/selftest.mjs --file ./data/rsvps.xlsx
```

## How rows are matched

In order — **email → phone → `sheet_key`**. First hit wins.

`sheet_key` is a slug of the guest's name (`Pastor Chingtok +3` →
`pastor-chingtok-3`), used only for the 41 guests who have neither an email nor
a phone. It is what lets such a guest later gain contact details and still
**update in place** instead of splitting into a second row.

Re-running changes nothing: values are compared after normalisation, so
`08031234567` and `+2348031234567`, or `"Joy "` and `"Joy"`, are the same value.
The self-test asserts this across three consecutive runs.

## The `main` / `plus` columns

Each expands into two database columns — the tier and the decision:

| Sheet value  | `approved_for` | `main_invite_status` |
|--------------|----------------|----------------------|
| `JOINING`    | `JOINING`      | `APPROVED`           |
| `RECEPTION`  | `RECEPTION`    | `APPROVED`           |
| `after party`| `AFTERPARTY`   | `APPROVED`           |
| `REJECTED`   | `NULL`         | `REJECTED`           |
| *(blank)*    | `NULL`         | `PENDING`            |

`plus` behaves the same way, into `plus_one_approved_for` / `plus_one_status`.
Casing and spacing are canonicalised, so `Joining`, `JOINING`, `AFTER PARTY` and
`after party` all land correctly.

Where the sheet has its **own** `plus_one_status` column, that value wins;
the tier only fills it in when blank. `ACCEPTED` and `APPROVED` are treated as
the same meaning.

**An assigned tier is itself an approval.** If `plus_one_approved_for` holds a
tier while `plus_one_status` still reads `Pending` or blank, the status is
promoted to `APPROVED` automatically — the decision was made, the status cell
just never caught up. `PENDING` survives only where no tier is assigned. These
promotions appear under **NORMALISED** in the summary; they are not errors and
need no intervention. Only a real disagreement — `REJECTED` against an assigned
tier — is reported as a warning.

## What the sync will never write

| Column | Why |
|---|---|
| `id`, `created_at` | Row identity and original submission time are preserved. |
| `guest_count` | Computed by the database from the approval columns — see below. |
| `seat_allocation` | A `GENERATED` column; Postgres rejects writes to it outright. |
| `email_status`, `whatsapp_status`, `last_email_sent`, `last_whatsapp_sent` | No longer columns on `rsvps` at all — see **Messaging** below. Still listed in `config.mjs` so a sheet column of the same name is stripped rather than sent to a table that has no such column. |

Blank cells are also skipped rather than written, so a partially-filled sheet row
never nulls out data already in the database. The one deliberate exception is the
tier columns: moving a guest to `REJECTED` **does** clear `approved_for`, because
there a null is the answer rather than the absence of one.

## `guest_count` is computed by Supabase

The spreadsheet decides **invitations**, not **seats**. A trigger
(`supabase/migrations/0002_guest_count.sql`) derives the count on every write:

| Condition | Seats |
|---|---|
| `main_invite_status = REJECTED` | `0` |
| `attending = false` | `0` |
| Approved **or** RSVP'd yes | `1` |
| …plus an approved `plus_one_status` | `2` |
| Nobody has decided yet | `0` |

A guest holds a seat when **either** the couple approved them **or** they RSVP'd
yes. Both halves are needed: 11 approved guests were added straight to the sheet
and never used the website, so `attending` is blank for them; conversely someone
may RSVP yes while their invitation is still pending. A rejection overrides both
— one guest has `attending = true` against a rejected invite, and holds no seat.

The trigger also mirrors the approval into `plus_one_approved` so the boolean and
the status can never disagree, and it replaces the earlier
`sync_guest_count_on_approval` trigger, which would otherwise compete for the
same column.

### `seat_allocation`

A readable label for the same fact, for anyone reading the table directly:

| `guest_count` | `seat_allocation` |
|---:|---|
| `0` | `None` |
| `1` | `Main Guest` |
| `2` | `Main Guest + Plus One` |

It is a **`GENERATED ALWAYS ... STORED`** column
(`0003_seat_allocation.sql`), not a trigger field — Postgres computes it and
refuses any attempt to write it, so it can never disagree with `guest_count`.
`BEFORE` triggers run before generated columns are evaluated, so the value is
correct on the same statement that sets `guest_count`.

## Messaging — `message_queue` is the only sender

`supabase/migrations/0006_message_queue.sql`.

`rsvps` **never sends a message and never records that one was sent.** It
describes guests. Everything to do with delivery — what to send, whether it
went, how many times it was tried, what the provider said — lives in
`message_queue`. The four `*_status` / `last_*_sent` columns are dropped from
`rsvps` by 0006; a single status column per channel could not express retries,
scheduling or history, and grew a new column every time a channel was added.

Automation **enqueues**; it does not send inline:

```sql
select enqueue_message(
  p_rsvp_id     => '…'::uuid,
  p_channel     => 'email',
  p_template_key=> 'save_the_date',
  p_payload     => '{"first_name":"Joy"}'::jsonb
);
```

A worker then drains the queue:

| Function | Purpose |
|---|---|
| `enqueue_message(...)` | Queue one message. Returns the row id. |
| `claim_messages(channel, limit, worker)` | Atomically lease due messages (`FOR UPDATE SKIP LOCKED`), so two workers never take the same row. |
| `mark_message_sent(id, provider_message_id, response)` | Terminal success. |
| `mark_message_failed(id, error)` | Reschedules with exponential backoff, capped at one hour; goes `dead` once `max_attempts` is exhausted. |
| `reclaim_stalled_messages(age)` | Returns rows whose worker died mid-send back to `queued`. |
| `cancel_messages_for_rsvp(rsvp_id)` | Cancels anything still pending for a guest who withdrew. |

Status: `queued → sending → sent`, or `→ failed → queued` while retries remain,
`→ dead` when they run out. `cancelled` is terminal and set by hand.

### Adding a channel without a migration

Channels are a **lookup table**, not an enum. `ALTER TYPE … ADD VALUE` is a
schema change; inserting a row is not:

```sql
insert into message_channels (key, label) values ('sms', 'SMS');
```

SMS and push notifications need no migration — one insert, and a worker that
knows how to drain that channel. Per-message content is `payload jsonb`, so a
channel with different fields needs no new columns either.

### Reading delivery state per guest

The `guest_delivery_status` view rolls the queue back up per guest — one row
per guest per channel with the latest status and timestamp — which is what the
retired `rsvps` columns used to approximate.

### Safety

- `dedupe_key` has a unique index, so a retried enqueue cannot double-send.
- `recipient` is **snapshotted** at enqueue time, so editing a guest's email
  never redirects a message that was already queued to them.
- RLS is enabled on both tables with **no policies** — reachable only by the
  service role, never from the browser.

Test: `supabase/tests/message_queue.sql`. Expect
`ALL CASES PASSED (20 checks)` and `leftover_guests | leftover_channels = 0 | 0`.

## Reports

Every run prints a summary — inserted, updated, unchanged, duplicates skipped,
missing identifiers, normalised, errors — and writes the full untruncated detail to
`scripts/sync/logs/sync-<timestamp>.json` (gitignored).

## Changing the sheet

`config.mjs` is the only file that names spreadsheet columns. Add a column
there and the pipeline picks it up; nothing else changes.

## Swapping in the live Google Sheets API

`sources/` isolates where rows come from behind one contract
(`sources/types.mjs`). The engine, matcher and transform never learn the origin.
`sources/google-sheets-source.mjs` holds a complete reference implementation and
the four steps to enable it — install `googleapis`, create a service account,
share the sheet with it, set the env vars. Then `--sheet <id>` replaces
`--file <path>`; the sync logic is untouched.

## Schema compatibility test

`supabase/tests/schema_compatibility.sql` — paste into the Supabase SQL Editor
and Run — or against a local database, see
`supabase/fixtures/0000_baseline_rsvps.sql`. It inserts a representative batch of sheet-created guests and a
representative batch of website-created guests, checks the derived
`guest_count` / `seat_allocation`, confirms the integrity constraints still
bite, then **rolls back**. Nothing is written.

Expect `ALL CASES PASSED (15 checks)` and `leftover_test_rows = 0`.

Run it after any schema change. A reintroduced `NOT NULL` fails with the case
and the offending column named, e.g.

```
SCHEMA COMPATIBILITY FAILED — 3 of 15 cases
  sheet: bulk mixed-null — null value in column "plus_one_status" …
  website: attending, no +1 — null value in column "plus_one_status" …
```

It covers **both writers**, which matters: the website inserts
`plus_one_status` as NULL when no +1 is requested and never sets the planning
columns at all, so a constraint can break the site without the sync noticing,
or the reverse.

### Known limitation — atomic inserts

Inserts are sent as one batch, so a single bad row fails all of them. A
fallback that retries individually and reports only the genuinely bad rows is
the planned next step.
