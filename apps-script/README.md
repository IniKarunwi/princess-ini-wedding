# RSVP Sync — Google Apps Script

Reads the live Google Sheet and syncs it to Supabase over the REST API. No
Google Cloud project, no service account, no OAuth consent screen — the script
is bound to the spreadsheet and runs as you.

## Why this exists

Google's service-account policy blocked the Sheets API route. Apps Script sits
*inside* the spreadsheet, so it needs no external credentials to read it.

## The logic is not rewritten

**`Core.gs` is generated, not hand-written.** It is built from the same modules
the Node runner uses:

```
scripts/sync/config.mjs  normalize.mjs  transform.mjs  matcher.mjs  engine.mjs
                              │
                    npm run build:appsscript
                              ▼
                     apps-script/Core.gs
```

Apps Script has no ES modules, so the build strips `import`/`export` and
concatenates. Matching, normalisation, tier derivation, the promotion rule, the
protected-column guards — all identical, because it is literally the same code.

**Never edit `Core.gs`.** Edit the source module and rebuild; the next build
overwrites it. A harness verifies the two paths produce byte-identical records:

```bash
npm run build:appsscript      # regenerate Core.gs
npm run test:appsscript       # run the .gs files against an emulated Google runtime
```

Only three files are Apps Script-specific: `SheetSource.gs` (reads the sheet),
`SupabaseClient.gs` (REST via `UrlFetchApp`), `Sync.gs` (orchestration).

## Setup

**1. Open the script editor.** In your Google Sheet: **Extensions → Apps Script**.

**2. Add the files.** Create each of these and paste in the contents. Delete the
default `Code.gs`.

| File | Purpose |
|---|---|
| `Core.gs` | Generated logic — do not edit |
| `Config.gs` | Credentials and sheet names |
| `SheetSource.gs` | Reads the sheet |
| `SupabaseClient.gs` | Supabase REST |
| `Sync.gs` | Orchestration and logging |
| `Menu.gs` | The **RSVP Sync** menu |

**3. Add credentials.** **Project Settings → Script Properties → Add property**:

| Property | Value |
|---|---|
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | your **service_role** key |

The service_role key is required — the anon key cannot update rows under RLS.

> **Who can see this key:** anyone with **edit** access to the spreadsheet can
> open Apps Script and read Script Properties. The service_role key bypasses
> row-level security entirely. If the planning sheet is shared with editors who
> shouldn't have full database access, keep the script in a copy only you can
> edit. Rotate the key in Supabase if it is ever exposed.

**4. Set the tab name** in `Config.gs` if the guest list is not the first tab:

```js
var SYNC_SHEET_NAME_ = 'Guests';   // '' = first tab
```

**5. Reload the spreadsheet.** An **RSVP Sync** menu appears.

**6. Authorise.** The first run prompts for permission — reading the sheet and
making external requests. "Google hasn't verified this app" is expected for a
script you wrote: **Advanced → Go to … (unsafe)**.

## Using it

| Menu item | Effect |
|---|---|
| **Test connection** | Confirms credentials and reaches the table |
| **Preview (dry run)** | Full plan, **writes nothing** |
| **Sync Now** | Shows counts, asks to confirm, then writes |

Start with **Test connection**, then **Preview**. Read the numbers before
syncing.

Every run appends to a **Sync Log** tab — timestamp, mode, counts, errors —
created automatically on first use.

## What it will not touch

| Column | Why |
|---|---|
| `id`, `created_at` | Row identity and submission time preserved |
| `guest_count` | Computed by the `trg_set_guest_count` trigger |
| `seat_allocation` | `GENERATED` column; Postgres rejects writes |
| `email_status`, `whatsapp_status`, `last_email_sent`, `last_whatsapp_sent` | Owned by the messaging automation; written only if those columns exist in the sheet |

The triggers and generated column continue to work untouched: the sync sends
only the invitation-decision columns, and the database derives the rest.

## Matching

Same rule as before — **email → phone → `sheet_key`**. Re-running changes
nothing, because values are compared after normalisation. Verified across
repeated runs by the harness.

## Performance

187 rows: one paged read, **one batched POST** for all inserts, and updates
issued through `UrlFetchApp.fetchAll()` in parallel batches of 50 — comfortably
inside the 6-minute execution limit.

## Next: sync on sheet change

Not yet enabled, by design — get the manual button working first. When ready,
an installable `onChange` trigger calling `runSync` is the natural next step. It
will need a non-interactive variant: `runSync` opens dialogs, which a
trigger-run script cannot do.
