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
