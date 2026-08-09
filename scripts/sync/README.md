# RSVP Sync

One-way sync: **planning spreadsheet → Supabase `rsvps`**. Nothing flows back
to the sheet, and nothing here touches the website.

## Setup (once)

1. **Run the migration.** Supabase dashboard → SQL Editor → paste
   `supabase/migrations/` in order (0001, then 0002) → Run. Safe to
   re-run.

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
| `email_status`, `whatsapp_status`, `last_email_sent`, `last_whatsapp_sent` | Owned by the future messaging automation. Written only if the column genuinely exists in the source sheet, so a sync can never clobber delivery state. |

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
