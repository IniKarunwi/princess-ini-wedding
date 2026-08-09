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
