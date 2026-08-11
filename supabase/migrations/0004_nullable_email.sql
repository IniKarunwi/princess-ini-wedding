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
