-- ============================================================================
--  APPLY ALL PENDING MIGRATIONS  —  paste this whole file into
--  Supabase → SQL Editor → New query → Run
--
--  Contains, in order:
--    0001_sync_layer.sql       sync identity + planning + messaging columns
--    0002_guest_count.sql      guest_count computed by trigger
--    0003_seat_allocation.sql  seat_allocation generated column
--    0004_nullable_email.sql   email nullable + at-least-one-identifier check
--
--  Safe to run more than once. Verified end-to-end against PostgreSQL 16
--  seeded with this table's actual schema.
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

-- ============================================================================
--  VERIFY  (run after the above)
-- ============================================================================
-- SELECT column_name, is_nullable FROM information_schema.columns
--  WHERE table_name = 'rsvps' AND column_name IN ('email','phone');
--   -- expect both YES
--
-- SELECT guest_count, seat_allocation, count(*)
--   FROM rsvps GROUP BY 1,2 ORDER BY 1;
