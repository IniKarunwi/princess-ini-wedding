-- ============================================================================
--  APPLY ALL PENDING MIGRATIONS  —  paste into Supabase → SQL Editor → Run
--
--    0001_sync_layer.sql                 sync identity + planning + messaging columns
--    0002_guest_count.sql                guest_count computed by trigger
--    0003_seat_allocation.sql            seat_allocation generated column
--    0004_nullable_email.sql             email nullable + identifier check
--    0005_sheet_guest_compatibility.sql  remaining sync-written columns nullable
--    0006_message_queue.sql              message_queue owns delivery; messaging
--                                        columns dropped from rsvps
--
--  0005 reads information_schema at run time and only alters columns that are
--  currently NOT NULL; it never tightens one. full_name is deliberately left
--  alone. Safe to run more than once.
--
--  0006 must run last: it drops the four messaging columns 0001 added, so
--  re-running 0001 afterwards would recreate them. Run this file top to
--  bottom in one go and that ordering is guaranteed.
-- ============================================================================



-- ========== 0001_sync_layer.sql ==========

-- ============================================================================
--  RSVP sync layer — schema additions
--
--  Safe to run more than once: every statement is guarded.
--  Adds only columns; nothing existing is altered or dropped, so the live
--  website behaviour is untouched.
--
--  Run in: Supabase dashboard → SQL Editor → New query → Run
-- ============================================================================

-- ── Sync identity ───────────────────────────────────────────────────────────
-- Stable key derived from the guest's name, used only to match rows that have
-- neither an email nor a phone. Lets a name-only guest later gain contact
-- details without splitting into a second record.
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS sheet_key text;

-- Partial unique index: enforced only where a key exists, so the many rows
-- without one do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS rsvps_sheet_key_unique
  ON rsvps (sheet_key)
  WHERE sheet_key IS NOT NULL;

-- Matching lookups.
CREATE INDEX IF NOT EXISTS rsvps_email_idx ON rsvps (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS rsvps_phone_idx ON rsvps (phone)        WHERE phone IS NOT NULL;

-- ── Invitation planning ─────────────────────────────────────────────────────
-- approved_for / plus_one_approved_for hold WHICH part of the event the guest
-- is approved for; the *_status columns hold the decision itself. Both are
-- derived from the sheet's `main` and `plus` columns by the sync.
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS main_invite_status    text;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS approved_for          text;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS plus_one_approved_for text;

-- ── Messaging automation (Phase 3) ──────────────────────────────────────────
-- Owned by the future email/WhatsApp automation, NOT by the spreadsheet.
-- The sync refuses to write these unless the column is physically present in
-- the source sheet, so a sync can never clobber delivery state.
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS email_status        text;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS whatsapp_status     text;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS last_email_sent     timestamptz;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS last_whatsapp_sent  timestamptz;

-- Weekly automations will scan for guests still awaiting contact.
CREATE INDEX IF NOT EXISTS rsvps_email_status_idx    ON rsvps (email_status);
CREATE INDEX IF NOT EXISTS rsvps_whatsapp_status_idx ON rsvps (whatsapp_status);

-- ── Audit ───────────────────────────────────────────────────────────────────
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS synced_at timestamptz;

COMMENT ON COLUMN rsvps.sheet_key             IS 'Name-derived sync key; matches sheet rows lacking email and phone.';
COMMENT ON COLUMN rsvps.main_invite_status    IS 'APPROVED | REJECTED | PENDING — derived from sheet column "main".';
COMMENT ON COLUMN rsvps.approved_for          IS 'JOINING | RECEPTION | AFTERPARTY — tier from sheet column "main".';
COMMENT ON COLUMN rsvps.plus_one_approved_for IS 'JOINING | RECEPTION | AFTERPARTY — tier from sheet column "plus".';
COMMENT ON COLUMN rsvps.email_status          IS 'Owned by messaging automation. Never written by the spreadsheet sync.';
COMMENT ON COLUMN rsvps.whatsapp_status       IS 'Owned by messaging automation. Never written by the spreadsheet sync.';


-- ========== 0002_guest_count.sql ==========

-- ============================================================================
--  guest_count — computed by the database, never by the spreadsheet
--
--  The sheet is the source of truth for invitation DECISIONS
--  (main_invite_status, approved_for, plus_one_status, plus_one_approved_for).
--  Seat count is derived from those decisions here, so the two can never drift.
--
--  Safe to run more than once.
--  Run in: Supabase dashboard → SQL Editor → New query → Run
-- ============================================================================

-- Supersedes the earlier plus_one_approved-only trigger, which would otherwise
-- fight this one for control of guest_count.
DROP TRIGGER  IF EXISTS trg_sync_guest_count       ON rsvps;
DROP FUNCTION IF EXISTS sync_guest_count_on_approval();

-- ── Seat rule ───────────────────────────────────────────────────────────────
--   0  couple rejected the invitation      (main_invite_status = 'REJECTED')
--   0  guest declined                      (attending = false)
--   0  nobody has decided yet              (not approved, no RSVP)
--   1  main guest holds a seat
--   2  main guest + an approved plus one
--
-- A guest holds a seat when EITHER the couple approved them OR they RSVP'd
-- yes. Both are needed: 11 approved guests were added straight to the sheet and
-- never used the website, so `attending` is blank for them; conversely a guest
-- may RSVP yes while their invitation is still pending. A rejection always
-- wins over both.
CREATE OR REPLACE FUNCTION compute_guest_count(
  p_attending          boolean,
  p_main_invite_status text,
  p_plus_one_status    text
) RETURNS integer AS $$
BEGIN
  IF upper(coalesce(p_main_invite_status, '')) = 'REJECTED' THEN
    RETURN 0;
  END IF;

  IF p_attending IS FALSE THEN
    RETURN 0;
  END IF;

  IF upper(coalesce(p_main_invite_status, '')) = 'APPROVED' OR p_attending IS TRUE THEN
    IF upper(coalesce(p_plus_one_status, '')) IN ('APPROVED', 'ACCEPTED') THEN
      RETURN 2;
    END IF;
    RETURN 1;
  END IF;

  RETURN 0;   -- undecided
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Keep it current on every write ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_guest_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.guest_count := compute_guest_count(
    NEW.attending, NEW.main_invite_status, NEW.plus_one_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: deliberately no plus_one_approved boolean. That column does not exist
-- on this table, and adding one would be a third place the same fact lives —
-- plus_one_status already records the decision, and guest_count /
-- seat_allocation derive from it. Whether a plus one is approved is
--   upper(plus_one_status) IN ('APPROVED', 'ACCEPTED')
-- which is what compute_guest_count() uses.

DROP TRIGGER IF EXISTS trg_set_guest_count ON rsvps;
CREATE TRIGGER trg_set_guest_count
  BEFORE INSERT OR UPDATE ON rsvps
  FOR EACH ROW
  EXECUTE FUNCTION set_guest_count();

-- ── Backfill existing rows ──────────────────────────────────────────────────
-- A self-assignment is enough: the BEFORE UPDATE trigger recomputes the value.
UPDATE rsvps SET guest_count = guest_count;

-- Verify:
--   SELECT attending, main_invite_status, plus_one_status, guest_count, count(*)
--   FROM rsvps GROUP BY 1,2,3,4 ORDER BY 5 DESC;


-- ========== 0003_seat_allocation.sql ==========

-- ============================================================================
--  seat_allocation — human-readable label for guest_count
--
--    guest_count │ seat_allocation
--    ────────────┼────────────────────────
--        0       │ None
--        1       │ Main Guest
--        2       │ Main Guest + Plus One
--
--  Implemented as a STORED GENERATED column rather than a trigger field, so
--  Postgres itself guarantees it always agrees with guest_count. It cannot be
--  written to — any attempt is rejected by the database — which means it can
--  never drift, and no application code has to remember to maintain it.
--
--  Ordering note: BEFORE triggers run before generated columns are computed,
--  so trg_set_guest_count has already produced guest_count by the time this
--  expression is evaluated. Both stay correct on every insert and update.
--
--  Safe to run more than once.
--  Run in: Supabase dashboard → SQL Editor → New query → Run
--  Requires: 0002_guest_count.sql
-- ============================================================================

ALTER TABLE rsvps DROP COLUMN IF EXISTS seat_allocation;

ALTER TABLE rsvps
  ADD COLUMN seat_allocation text
  GENERATED ALWAYS AS (
    CASE guest_count
      WHEN 0 THEN 'None'
      WHEN 1 THEN 'Main Guest'
      WHEN 2 THEN 'Main Guest + Plus One'
      ELSE CASE
             WHEN guest_count IS NULL THEN 'None'
             -- Defensive: the trigger only ever yields 0-2, but a future rule
             -- change should degrade to a sensible label rather than NULL.
             ELSE 'Main Guest + ' || (guest_count - 1)::text || ' Guests'
           END
    END
  ) STORED;

COMMENT ON COLUMN rsvps.seat_allocation IS
  'Generated from guest_count. Read-only — Postgres computes and enforces it.';

-- Reporting: group by seat_allocation without a sequential scan.
CREATE INDEX IF NOT EXISTS rsvps_seat_allocation_idx ON rsvps (seat_allocation);

-- Verify:
--   SELECT guest_count, seat_allocation, count(*)
--   FROM rsvps GROUP BY 1, 2 ORDER BY 1;
--
-- Expected for the current sheet:
--   0 │ None                    │  32
--   1 │ Main Guest              │ 131
--   2 │ Main Guest + Plus One   │  24


-- ========== 0004_nullable_email.sql ==========

-- ============================================================================
--  email becomes nullable — guests may be identified by phone or sheet_key
--
--  Not a correction of an earlier migration: nothing in 0001-0003 alters
--  email. The NOT NULL came from the original table, where it was right —
--  every row arrived through the website form, which requires an email.
--
--  The planning sheet introduced guests who have neither an email nor a
--  phone ("Pastor Chingtok +3", "Aunty Julie +1"), identified by a
--  name-derived sheet_key. Those rows cannot satisfy NOT NULL.
--
--  Rather than simply dropping the guard, the weaker column constraint is
--  replaced with the one the data model actually requires: every row must
--  carry at least one identifier. A row with none could never be matched
--  again by any sync, and would silently duplicate on the next run.
--
--  The website is unaffected — it always sends an email.
--
--  Safe to run more than once.
--  Run in: Supabase dashboard → SQL Editor → New query → Run
-- ============================================================================

-- ── Allow email to be absent ────────────────────────────────────────────────
ALTER TABLE rsvps ALTER COLUMN email DROP NOT NULL;

-- phone is already nullable; assert it rather than assume.
ALTER TABLE rsvps ALTER COLUMN phone DROP NOT NULL;

-- ── Require at least one identifier ─────────────────────────────────────────
-- Added only when no existing row would violate it, so the migration can
-- never fail halfway through on unexpected data. If rows do violate it, the
-- notice names them and the constraint is skipped — nothing else is undone.
DO $$
DECLARE
  offending integer;
BEGIN
  SELECT count(*) INTO offending
  FROM rsvps
  WHERE coalesce(nullif(btrim(email),     ''), NULL) IS NULL
    AND coalesce(nullif(btrim(phone),     ''), NULL) IS NULL
    AND coalesce(nullif(btrim(sheet_key), ''), NULL) IS NULL;

  IF offending > 0 THEN
    RAISE NOTICE
      'Skipping rsvps_has_identifier: % row(s) have no email, phone or sheet_key. '
      'Find them with:  SELECT id, full_name FROM rsvps WHERE email IS NULL AND '
      'phone IS NULL AND sheet_key IS NULL;', offending;
  ELSE
    ALTER TABLE rsvps DROP CONSTRAINT IF EXISTS rsvps_has_identifier;
    ALTER TABLE rsvps ADD CONSTRAINT rsvps_has_identifier CHECK (
      nullif(btrim(email),     '') IS NOT NULL OR
      nullif(btrim(phone),     '') IS NOT NULL OR
      nullif(btrim(sheet_key), '') IS NOT NULL
    );
    RAISE NOTICE 'Added constraint rsvps_has_identifier.';
  END IF;
END $$;

COMMENT ON COLUMN rsvps.email IS
  'Nullable. Website submissions always carry one; sheet-only guests may not. '
  'Every row must still have at least one of email, phone or sheet_key '
  '(constraint rsvps_has_identifier).';

-- Verify:
--   SELECT column_name, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'rsvps' AND column_name IN ('email','phone');
--   -- expect both YES
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'rsvps'::regclass AND contype = 'c';
--   -- expect rsvps_has_identifier


-- ========== 0005_sheet_guest_compatibility.sql ==========

-- ============================================================================
--  Final schema migration — make rsvps compatible with sheet-created guests
--
--  Supersedes 0004 in scope and is safe to run whether or not 0004 was applied.
--  Run this INSTEAD of discovering constraints one failed sync at a time.
--
--  ── The problem ────────────────────────────────────────────────────────────
--  The table was built for website submissions, where a validated form
--  guarantees a value for every field. Guests entered directly in the planning
--  sheet have no such guarantee: a name may be recorded months before anyone
--  knows their email, whether they are attending, or whether they want a +1.
--
--  The sync also sends a uniform key set on bulk insert (PostgREST requires
--  it), padding absent fields with NULL. So EVERY column the sync writes must
--  accept NULL — not merely the ones that happened to fail first.
--
--  ── What changes ───────────────────────────────────────────────────────────
--  NOT NULL is dropped from exactly the twelve columns the sync writes.
--  The list is derived from the sync's own configuration (FIELD_MAP, TIER_MAP
--  and sheet_key in scripts/sync/config.mjs), not from guesswork.
--
--  ── What deliberately does NOT change ──────────────────────────────────────
--    id               primary key
--    created_at       defaulted; the sync never writes it
--    guest_count      NOT NULL, set by trg_set_guest_count on every write
--    seat_allocation  GENERATED from guest_count
--    unique indexes   untouched (NULLs do not collide in Postgres)
--    rsvps_has_identifier   every row still needs email, phone or sheet_key
--
--  Safe to run more than once.
--  Run in: Supabase dashboard → SQL Editor → New query → Run
-- ============================================================================

-- ── 1. Every sync-writable column becomes nullable ──────────────────────────
DO $$
DECLARE
  col          text;
  relaxed      text[] := ARRAY[]::text[];
  already      text[] := ARRAY[]::text[];
  absent       text[] := ARRAY[]::text[];
  is_nullable  text;
BEGIN
  -- full_name is deliberately absent from this list. It is the one column
  -- neither writer ever leaves empty: the website form requires it, and every
  -- row in the planning sheet has one (0 of 187). sheet_key is derived from
  -- it, so a nameless sheet-only guest could not be identified at all. If it
  -- is currently NOT NULL it stays that way; this migration never tightens a
  -- column, so an already-nullable full_name is left as it is.
  --
  -- The residual case: a sheet row carrying an email but a blank name would
  -- produce full_name = NULL and, because inserts are one atomic batch, would
  -- fail the entire sync. See the note in scripts/sync/README.md.
  FOREACH col IN ARRAY ARRAY[
    'email',
    'phone',
    'attending',
    'plus_one_requested',
    'plus_one_name',
    'plus_one_relationship',
    'plus_one_status',
    'approved_for',
    'main_invite_status',
    'plus_one_approved_for',
    'sheet_key'
  ] LOOP
    SELECT c.is_nullable INTO is_nullable
      FROM information_schema.columns c
     WHERE c.table_name = 'rsvps' AND c.column_name = col;

    IF is_nullable IS NULL THEN
      absent := absent || col;                       -- column not in this table
    ELSIF is_nullable = 'NO' THEN
      EXECUTE format('ALTER TABLE rsvps ALTER COLUMN %I DROP NOT NULL', col);
      relaxed := relaxed || col;
    ELSE
      already := already || col;
    END IF;
  END LOOP;

  RAISE NOTICE 'Relaxed to nullable : %', coalesce(array_to_string(relaxed, ', '), '(none)');
  RAISE NOTICE 'Already nullable    : %', coalesce(array_to_string(already, ', '), '(none)');
  IF array_length(absent, 1) > 0 THEN
    RAISE NOTICE 'Not present in table: %  (run 0001 first)', array_to_string(absent, ', ');
  END IF;
END $$;

-- ── 2. Integrity that must survive ──────────────────────────────────────────
-- A row with no identifier could never be matched by a later sync and would
-- duplicate on every run. Re-asserted here so this migration alone is
-- sufficient, whether or not 0004 was applied.
DO $$
DECLARE
  offending integer;
BEGIN
  SELECT count(*) INTO offending
    FROM rsvps
   WHERE nullif(btrim(email),     '') IS NULL
     AND nullif(btrim(phone),     '') IS NULL
     AND nullif(btrim(sheet_key), '') IS NULL;

  IF offending > 0 THEN
    RAISE NOTICE
      'Skipping rsvps_has_identifier: % row(s) have no email, phone or sheet_key.',
      offending;
  ELSE
    ALTER TABLE rsvps DROP CONSTRAINT IF EXISTS rsvps_has_identifier;
    ALTER TABLE rsvps ADD CONSTRAINT rsvps_has_identifier CHECK (
      nullif(btrim(email),     '') IS NOT NULL OR
      nullif(btrim(phone),     '') IS NOT NULL OR
      nullif(btrim(sheet_key), '') IS NOT NULL
    );
    RAISE NOTICE 'Constraint rsvps_has_identifier in place.';
  END IF;
END $$;

-- guest_count is written by the trigger on every insert and update, so it
-- stays NOT NULL. Restore that if an earlier hand-edit relaxed it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'rsvps' AND column_name = 'guest_count'
                AND is_nullable = 'YES') THEN
    UPDATE rsvps SET guest_count = coalesce(guest_count, 0) WHERE guest_count IS NULL;
    ALTER TABLE rsvps ALTER COLUMN guest_count SET NOT NULL;
    RAISE NOTICE 'Restored NOT NULL on guest_count.';
  END IF;
END $$;

COMMENT ON TABLE rsvps IS
  'Website RSVPs and sheet-planned guests share this table. Sheet-created rows '
  'may leave most fields NULL until known; every row must still carry at least '
  'one of email, phone or sheet_key.';

-- ============================================================================
--  VERIFY — run this after the above; every sync-written column must say YES
-- ============================================================================
-- SELECT column_name, is_nullable, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'rsvps'
--  ORDER BY (is_nullable = 'NO') DESC, column_name;
--   -- expect NO only for: id, guest_count  (created_at may be either)
--
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'rsvps'::regclass AND contype = 'c';
--   -- expect rsvps_has_identifier


-- ========== 0006_message_queue.sql ==========

-- ============================================================================
--  message_queue — the single source of truth for outbound messaging
--
--  Nothing sends a message directly. Every email, WhatsApp, and future SMS or
--  push notification is ENQUEUED here; a worker claims rows, attempts
--  delivery, and records the outcome. Delivery state, retry history and the
--  full audit trail live in one table rather than being smeared across
--  per-channel columns on rsvps.
--
--  ── Adding a channel later ─────────────────────────────────────────────────
--  channel is a foreign key to a LOOKUP TABLE, not a native enum. Adding SMS
--  or push is one INSERT into message_channels — no ALTER TYPE, no migration,
--  no downtime. A native enum would have made every new channel a schema
--  change, which is exactly what this design is meant to avoid.
--
--  Channel-specific data (subject lines, template ids, media urls, device
--  tokens) lives in the payload jsonb, so a new channel needs no new columns.
--
--  status IS a native enum: the delivery lifecycle is fixed and benefits from
--  the type safety and compact index representation.
--
--  Safe to run more than once.
--  Run in: Supabase dashboard → SQL Editor → New query → Run
--  Requires: 0001-0005
-- ============================================================================

-- ── Delivery lifecycle ──────────────────────────────────────────────────────
--   queued    waiting to be claimed
--   sending   claimed by a worker, attempt in flight
--   sent      accepted by the provider
--   failed    attempt failed, will be retried
--   dead      retries exhausted; needs a human
--   cancelled withdrawn before sending (guest declined, event changed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE message_status AS ENUM
      ('queued', 'sending', 'sent', 'failed', 'dead', 'cancelled');
  END IF;
END $$;

-- ── Channels: data, not schema ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_channels (
  channel      text PRIMARY KEY,
  display_name text    NOT NULL,
  -- Which rsvps column holds the address for this channel. Lets the enqueue
  -- helper resolve a recipient generically instead of branching per channel.
  address_field text   NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO message_channels (channel, display_name, address_field, enabled) VALUES
  ('email',    'Email',    'email', true),
  ('whatsapp', 'WhatsApp', 'phone', true)
ON CONFLICT (channel) DO NOTHING;

-- Adding SMS or push later is exactly this, and nothing else:
--   INSERT INTO message_channels (channel, display_name, address_field)
--   VALUES ('sms', 'SMS', 'phone'), ('push', 'Push Notification', 'push_token');

-- ── The queue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and what -------------------------------------------------------------
  rsvp_id             uuid REFERENCES rsvps(id) ON DELETE CASCADE,
  channel             text NOT NULL REFERENCES message_channels(channel),
  -- The resolved address at enqueue time: an email, an E.164 number, a device
  -- token. Snapshotted deliberately — if a guest later changes their email,
  -- history must still show where the message actually went.
  recipient           text NOT NULL,

  -- Content ------------------------------------------------------------------
  template_key        text NOT NULL,
  -- Template variables plus anything channel-specific. This is what makes a
  -- new channel need no new columns.
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Scheduling ---------------------------------------------------------------
  scheduled_for       timestamptz NOT NULL DEFAULT now(),
  priority            smallint    NOT NULL DEFAULT 100,   -- lower runs first

  -- Delivery state -----------------------------------------------------------
  status              message_status NOT NULL DEFAULT 'queued',
  attempts            integer     NOT NULL DEFAULT 0,
  max_attempts        integer     NOT NULL DEFAULT 5,
  next_attempt_at     timestamptz,

  -- Worker lease: claimed rows carry who holds them and since when, so a
  -- crashed worker's rows can be reclaimed rather than stranded in 'sending'.
  locked_at           timestamptz,
  locked_by           text,

  -- Outcome ------------------------------------------------------------------
  sent_at             timestamptz,
  failed_at           timestamptz,
  last_error          text,
  provider_message_id text,
  provider_response   jsonb,

  -- Idempotency: a natural key for "this exact message to this guest".
  -- Enqueuing twice with the same key is a no-op, so a re-run of a weekly
  -- automation cannot double-send.
  dedupe_key          text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT message_queue_attempts_sane
    CHECK (attempts >= 0 AND max_attempts >= 1 AND attempts <= max_attempts + 1),
  CONSTRAINT message_queue_recipient_present
    CHECK (nullif(btrim(recipient), '') IS NOT NULL)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

-- The claim query: ready work, best-priority first. Partial, so it stays small
-- however much history accumulates.
CREATE INDEX IF NOT EXISTS message_queue_ready_idx
  ON message_queue (priority, scheduled_for, created_at)
  WHERE status IN ('queued', 'failed');

-- Reclaiming leases from crashed workers.
CREATE INDEX IF NOT EXISTS message_queue_locked_idx
  ON message_queue (locked_at)
  WHERE status = 'sending';

-- Per-guest history, and the delivery-status view below.
CREATE INDEX IF NOT EXISTS message_queue_rsvp_idx
  ON message_queue (rsvp_id, channel, created_at DESC);

-- Operational dashboards: "how many failed today", "what is dead".
CREATE INDEX IF NOT EXISTS message_queue_status_idx
  ON message_queue (status, channel, created_at DESC);

-- Idempotent enqueue.
CREATE UNIQUE INDEX IF NOT EXISTS message_queue_dedupe_idx
  ON message_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Provider reconciliation (delivery receipts, webhooks).
CREATE INDEX IF NOT EXISTS message_queue_provider_idx
  ON message_queue (channel, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_message_queue()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_message_queue ON message_queue;
CREATE TRIGGER trg_touch_message_queue
  BEFORE UPDATE ON message_queue
  FOR EACH ROW EXECUTE FUNCTION touch_message_queue();

-- ============================================================================
--  API — the only supported way to interact with the queue
-- ============================================================================

-- ── Enqueue ─────────────────────────────────────────────────────────────────
-- Idempotent when a dedupe_key is supplied: the second call returns the
-- existing id instead of creating a duplicate.
CREATE OR REPLACE FUNCTION enqueue_message(
  p_rsvp_id       uuid,
  p_channel       text,
  p_template_key  text,
  p_recipient     text    DEFAULT NULL,   -- resolved from rsvps when omitted
  p_payload       jsonb   DEFAULT '{}'::jsonb,
  p_scheduled_for timestamptz DEFAULT now(),
  p_priority      smallint DEFAULT 100,
  p_dedupe_key    text    DEFAULT NULL,
  p_max_attempts  integer DEFAULT 5
) RETURNS uuid AS $$
DECLARE
  v_recipient text := nullif(btrim(p_recipient), '');
  v_field     text;
  v_id        uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM message_channels
                  WHERE channel = p_channel AND enabled) THEN
    RAISE EXCEPTION 'Unknown or disabled channel: %', p_channel
      USING HINT = 'Add it with INSERT INTO message_channels (…).';
  END IF;

  -- Resolve the address from the guest record when not given explicitly.
  IF v_recipient IS NULL THEN
    SELECT address_field INTO v_field FROM message_channels WHERE channel = p_channel;
    EXECUTE format('SELECT nullif(btrim(%I::text), '''') FROM rsvps WHERE id = $1', v_field)
      INTO v_recipient USING p_rsvp_id;
  END IF;

  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'No % address for rsvp %', p_channel, p_rsvp_id
      USING HINT = 'Pass p_recipient explicitly, or fill the address on the guest.';
  END IF;

  INSERT INTO message_queue (
    rsvp_id, channel, recipient, template_key, payload,
    scheduled_for, priority, dedupe_key, max_attempts, next_attempt_at
  ) VALUES (
    p_rsvp_id, p_channel, v_recipient, p_template_key, coalesce(p_payload, '{}'::jsonb),
    p_scheduled_for, p_priority, p_dedupe_key, p_max_attempts, p_scheduled_for
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  -- Conflict: return the message that already exists.
  IF v_id IS NULL AND p_dedupe_key IS NOT NULL THEN
    SELECT id INTO v_id FROM message_queue WHERE dedupe_key = p_dedupe_key;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ── Claim ───────────────────────────────────────────────────────────────────
-- FOR UPDATE SKIP LOCKED is what makes this safe to run from several workers
-- at once: each claims a disjoint set without blocking the others.
CREATE OR REPLACE FUNCTION claim_messages(
  p_worker_id  text,
  p_batch_size integer DEFAULT 50,
  p_channel    text    DEFAULT NULL      -- NULL = any channel
) RETURNS SETOF message_queue AS $$
BEGIN
  RETURN QUERY
  WITH ready AS (
    SELECT q.id
      FROM message_queue q
     WHERE q.status IN ('queued', 'failed')
       AND q.scheduled_for <= now()
       AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= now())
       AND q.attempts < q.max_attempts
       AND (p_channel IS NULL OR q.channel = p_channel)
     ORDER BY q.priority, q.scheduled_for, q.created_at
     LIMIT p_batch_size
     FOR UPDATE SKIP LOCKED
  )
  UPDATE message_queue m
     SET status    = 'sending',
         locked_at = now(),
         locked_by = p_worker_id,
         attempts  = m.attempts + 1
    FROM ready
   WHERE m.id = ready.id
  RETURNING m.*;
END;
$$ LANGUAGE plpgsql;

-- ── Record outcomes ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_message_sent(
  p_id                  uuid,
  p_provider_message_id text  DEFAULT NULL,
  p_provider_response   jsonb DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE message_queue
     SET status = 'sent', sent_at = now(),
         locked_at = NULL, locked_by = NULL,
         last_error = NULL,
         provider_message_id = p_provider_message_id,
         provider_response   = p_provider_response
   WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Exponential backoff, capped at an hour: 1m, 2m, 4m, 8m, 16m …
-- A message that exhausts max_attempts becomes 'dead' rather than retrying
-- forever, so a permanently bad address surfaces instead of churning.
CREATE OR REPLACE FUNCTION mark_message_failed(
  p_id                uuid,
  p_error             text,
  p_provider_response jsonb DEFAULT NULL
) RETURNS message_status AS $$
DECLARE
  v_attempts     integer;
  v_max          integer;
  v_next_status  message_status;
  v_backoff      interval;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max
    FROM message_queue WHERE id = p_id;

  IF v_attempts IS NULL THEN
    RAISE EXCEPTION 'No such message: %', p_id;
  END IF;

  IF v_attempts >= v_max THEN
    v_next_status := 'dead';
    v_backoff     := NULL;
  ELSE
    v_next_status := 'failed';
    v_backoff     := least(interval '1 minute' * power(2, v_attempts - 1),
                           interval '1 hour');
  END IF;

  UPDATE message_queue
     SET status          = v_next_status,
         failed_at       = now(),
         last_error      = p_error,
         provider_response = coalesce(p_provider_response, provider_response),
         next_attempt_at = CASE WHEN v_backoff IS NULL THEN NULL
                                ELSE now() + v_backoff END,
         locked_at = NULL, locked_by = NULL
   WHERE id = p_id;

  RETURN v_next_status;
END;
$$ LANGUAGE plpgsql;

-- ── Reclaim stranded leases ─────────────────────────────────────────────────
-- A worker that dies mid-send leaves rows in 'sending' forever. Run this on a
-- schedule; it returns them to the pool without consuming another attempt.
CREATE OR REPLACE FUNCTION reclaim_stalled_messages(
  p_older_than interval DEFAULT interval '15 minutes'
) RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  WITH reclaimed AS (
    UPDATE message_queue
       SET status = 'queued', locked_at = NULL, locked_by = NULL,
           attempts = greatest(attempts - 1, 0),
           last_error = coalesce(last_error, 'reclaimed: worker lease expired')
     WHERE status = 'sending'
       AND locked_at < now() - p_older_than
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM reclaimed;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ── Cancel ──────────────────────────────────────────────────────────────────
-- Withdraw undelivered messages, e.g. when a guest declines. Sent messages are
-- history and are never altered.
CREATE OR REPLACE FUNCTION cancel_messages_for_rsvp(
  p_rsvp_id uuid,
  p_reason  text DEFAULT NULL
) RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  WITH cancelled AS (
    UPDATE message_queue
       SET status = 'cancelled',
           last_error = coalesce(p_reason, 'cancelled'),
           locked_at = NULL, locked_by = NULL
     WHERE rsvp_id = p_rsvp_id
       AND status IN ('queued', 'failed')
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM cancelled;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
--  Per-guest delivery status — DERIVED, never stored
-- ============================================================================
-- This replaces rsvps.email_status / whatsapp_status / last_email_sent /
-- last_whatsapp_sent. Those columns duplicated state the queue already knows
-- and could drift from it; a view cannot.
--
-- Works for any channel, including ones added after this migration.
CREATE OR REPLACE VIEW guest_delivery_status AS
SELECT
  r.id                                        AS rsvp_id,
  r.full_name,
  c.channel,
  count(q.id) FILTER (WHERE q.id IS NOT NULL)       AS total_messages,
  count(q.id) FILTER (WHERE q.status = 'sent')      AS sent_count,
  count(q.id) FILTER (WHERE q.status IN ('queued', 'failed', 'sending')) AS pending_count,
  count(q.id) FILTER (WHERE q.status = 'dead')      AS dead_count,
  max(q.sent_at)                                    AS last_sent_at,
  (array_agg(q.status ORDER BY q.created_at DESC)
     FILTER (WHERE q.id IS NOT NULL))[1]            AS latest_status,
  (array_agg(q.last_error ORDER BY q.created_at DESC)
     FILTER (WHERE q.status IN ('failed', 'dead')))[1] AS latest_error
FROM rsvps r
CROSS JOIN message_channels c
LEFT JOIN message_queue q ON q.rsvp_id = r.id AND q.channel = c.channel
GROUP BY r.id, r.full_name, c.channel;

COMMENT ON VIEW guest_delivery_status IS
  'Per-guest, per-channel delivery state derived from message_queue. Replaces '
  'the former rsvps.email_status / whatsapp_status columns, which could drift.';

-- ============================================================================
--  Retire the per-channel columns on rsvps
-- ============================================================================
-- Dropped only when they hold no data, so this can never silently discard
-- something. If any are populated the migration keeps them and says so.
DO $$
DECLARE
  col       text;
  populated integer;
  dropped   text[] := ARRAY[]::text[];
  kept      text[] := ARRAY[]::text[];
BEGIN
  FOREACH col IN ARRAY ARRAY['email_status', 'whatsapp_status',
                             'last_email_sent', 'last_whatsapp_sent'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'rsvps' AND column_name = col) THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM rsvps WHERE %I IS NOT NULL', col)
      INTO populated;

    IF populated = 0 THEN
      EXECUTE format('ALTER TABLE rsvps DROP COLUMN %I', col);
      dropped := dropped || col;
    ELSE
      kept := kept || format('%s (%s rows)', col, populated);
    END IF;
  END LOOP;

  IF array_length(dropped, 1) > 0 THEN
    RAISE NOTICE 'Dropped from rsvps (message_queue owns this now): %',
      array_to_string(dropped, ', ');
  END IF;
  IF array_length(kept, 1) > 0 THEN
    RAISE NOTICE 'KEPT — these hold data, migrate it into message_queue then '
                 'drop by hand: %', array_to_string(kept, ', ');
  END IF;
END $$;

-- ============================================================================
--  Security
-- ============================================================================
-- The queue holds addresses and message bodies. RLS on with no policies means
-- anon and authenticated see nothing; only the service_role key reaches it.
ALTER TABLE message_queue    ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_channels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE message_queue IS
  'Single source of truth for outbound messaging: delivery, retries, history. '
  'Nothing sends directly — producers call enqueue_message(), workers call '
  'claim_messages() then mark_message_sent() / mark_message_failed().';
COMMENT ON TABLE message_channels IS
  'Open set of delivery channels. Adding SMS or push is an INSERT here, not a '
  'schema change.';
COMMENT ON COLUMN message_queue.payload IS
  'Template variables and channel-specific fields. New channels need no new '
  'columns.';
COMMENT ON COLUMN message_queue.recipient IS
  'Address snapshotted at enqueue time, so history shows where a message '
  'actually went even if the guest record changes later.';
COMMENT ON COLUMN message_queue.dedupe_key IS
  'Natural key for "this message to this guest". Enqueuing twice is a no-op, '
  'so re-running a weekly automation cannot double-send.';

-- ============================================================================
--  VERIFY
-- ============================================================================
-- SELECT channel, display_name, enabled FROM message_channels;
-- SELECT status, count(*) FROM message_queue GROUP BY status;
-- SELECT * FROM guest_delivery_status WHERE total_messages > 0 LIMIT 20;
