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
  FOREACH col IN ARRAY ARRAY[
    'full_name',
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
