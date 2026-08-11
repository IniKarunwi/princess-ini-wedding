-- ============================================================================
--  SCHEMA COMPATIBILITY TEST — writes nothing
--
--  Inserts a representative batch of sheet-created guests and a representative
--  batch of website-created guests, asserts the results, then ROLLS BACK.
--  Nothing survives the run.
--
--  Purpose: fail loudly if a future schema change reintroduces a NOT NULL that
--  either writer would violate, instead of discovering it one failed sync at a
--  time.
--
--  Run in: Supabase dashboard → SQL Editor → New query → Run
--  Expect: "ALL CASES PASSED" and zero rows left behind.
--          Any failure raises an exception naming the case and the column.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  failures text[] := ARRAY[]::text[];
  passes   integer := 0;
  gc       integer;
  sa       text;
BEGIN

  -- ══ SHEET-CREATED GUESTS ═══════════════════════════════════════════════
  -- The sync sends a uniform 12-key payload, padding absences with NULL.

  -- 1. Name only. No contact details, no RSVP, no decision yet.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, plus_one_requested,
                       plus_one_name, plus_one_relationship, plus_one_status,
                       approved_for, main_invite_status, plus_one_approved_for, sheet_key)
    VALUES ('TEST Pastor Chingtok +3', NULL, NULL, NULL, NULL,
            NULL, NULL, 'PENDING', NULL, 'PENDING', NULL, 'test-pastor-chingtok-3');
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('sheet: name only — ' || SQLERRM);
  END;

  -- 2. Name + approved tier, still no contact details or RSVP.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, plus_one_requested,
                       plus_one_name, plus_one_relationship, plus_one_status,
                       approved_for, main_invite_status, plus_one_approved_for, sheet_key)
    VALUES ('TEST Aunty Julie +1', NULL, NULL, NULL, NULL,
            NULL, NULL, 'PENDING', 'JOINING', 'APPROVED', NULL, 'test-aunty-julie-1');
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('sheet: name + tier — ' || SQLERRM);
  END;

  -- 3. Phone but no email — the phone-matched path.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, plus_one_requested,
                       plus_one_name, plus_one_relationship, plus_one_status,
                       approved_for, main_invite_status, plus_one_approved_for, sheet_key)
    VALUES ('TEST Phone Only', NULL, '+2348090000001', NULL, NULL,
            NULL, NULL, 'PENDING', 'RECEPTION', 'APPROVED', NULL, 'test-phone-only');
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('sheet: phone, no email — ' || SQLERRM);
  END;

  -- 4. Rejected invitation: tier cleared, status REJECTED.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, plus_one_requested,
                       plus_one_name, plus_one_relationship, plus_one_status,
                       approved_for, main_invite_status, plus_one_approved_for, sheet_key)
    VALUES ('TEST Rejected Guest', NULL, NULL, true, NULL,
            NULL, NULL, 'PENDING', NULL, 'REJECTED', NULL, 'test-rejected-guest');
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('sheet: rejected — ' || SQLERRM);
  END;

  -- 5. Fully populated sheet guest with an approved +1.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, plus_one_requested,
                       plus_one_name, plus_one_relationship, plus_one_status,
                       approved_for, main_invite_status, plus_one_approved_for, sheet_key)
    VALUES ('TEST Full Sheet Guest', 'test.sheet@example.invalid', '+2348090000002',
            true, true, 'TEST Partner', 'Spouse', 'APPROVED',
            'JOINING', 'APPROVED', 'JOINING', 'test-full-sheet-guest');
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('sheet: fully populated — ' || SQLERRM);
  END;

  -- 6. Bulk insert, uniform keys, mixed nulls — how the sync really writes.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, plus_one_requested,
                       plus_one_name, plus_one_relationship, plus_one_status,
                       approved_for, main_invite_status, plus_one_approved_for, sheet_key)
    VALUES
      ('TEST Bulk A', NULL, NULL, NULL, NULL, NULL, NULL, 'PENDING', NULL, 'PENDING', NULL, 'test-bulk-a'),
      ('TEST Bulk B', 'test.b@example.invalid', NULL, true, false, NULL, NULL, NULL, 'JOINING', 'APPROVED', NULL, 'test-bulk-b'),
      ('TEST Bulk C', NULL, '+2348090000003', NULL, NULL, NULL, NULL, 'APPROVED', 'RECEPTION', 'APPROVED', 'RECEPTION', 'test-bulk-c');
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('sheet: bulk mixed-null — ' || SQLERRM);
  END;

  -- ══ WEBSITE-CREATED GUESTS ═════════════════════════════════════════════
  -- Exactly the columns src/lib/supabase.ts inserts, with its own null
  -- pattern: plus_one_status is NULL when no +1 is requested, and the
  -- planning columns are never set at all.

  -- 7. Attending, no +1 — plus_one_status NULL, phone blank.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, guest_count,
                       plus_one_requested, plus_one_name, plus_one_relationship,
                       plus_one_status, created_at)
    VALUES ('TEST Web No Plus One', 'test.web1@example.invalid', NULL, true, 1,
            false, NULL, NULL, NULL, now());
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('website: attending, no +1 — ' || SQLERRM);
  END;

  -- 8. Attending with a +1 request.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, guest_count,
                       plus_one_requested, plus_one_name, plus_one_relationship,
                       plus_one_status, created_at)
    VALUES ('TEST Web With Plus One', 'test.web2@example.invalid', '+2348090000004', true, 1,
            true, 'TEST Web Partner', 'Friend', 'pending', now());
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('website: attending with +1 — ' || SQLERRM);
  END;

  -- 9. Declining.
  BEGIN
    INSERT INTO rsvps (full_name, email, phone, attending, guest_count,
                       plus_one_requested, plus_one_name, plus_one_relationship,
                       plus_one_status, created_at)
    VALUES ('TEST Web Regrets', 'test.web3@example.invalid', NULL, false, 0,
            false, NULL, NULL, NULL, now());
    passes := passes + 1;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('website: declining — ' || SQLERRM);
  END;

  -- ══ CONSTRAINTS THAT MUST STILL HOLD ═══════════════════════════════════

  -- 10. A row with no identifier must be refused.
  BEGIN
    INSERT INTO rsvps (full_name) VALUES ('TEST No Identifier');
    failures := failures || 'integrity: a row with no identifier was ACCEPTED'::text;
  EXCEPTION WHEN OTHERS THEN
    passes := passes + 1;                       -- rejection is the pass
  END;

  -- 11. A nameless row must be refused (full_name stays NOT NULL).
  BEGIN
    INSERT INTO rsvps (email, sheet_key) VALUES ('test.noname@example.invalid', 'test-noname');
    failures := failures || 'integrity: a row with no full_name was ACCEPTED'::text;
  EXCEPTION WHEN OTHERS THEN
    passes := passes + 1;
  END;

  -- ══ DERIVED COLUMNS ════════════════════════════════════════════════════

  -- 12. Undecided sheet guest → 0 seats.
  SELECT guest_count, seat_allocation INTO gc, sa
    FROM rsvps WHERE sheet_key = 'test-pastor-chingtok-3';
  IF gc = 0 AND sa = 'None' THEN passes := passes + 1;
  ELSE failures := failures || format('derived: undecided guest gave %s/%s, expected 0/None', gc, sa);
  END IF;

  -- 13. Approved, never RSVP'd → 1 seat.
  SELECT guest_count, seat_allocation INTO gc, sa
    FROM rsvps WHERE sheet_key = 'test-aunty-julie-1';
  IF gc = 1 AND sa = 'Main Guest' THEN passes := passes + 1;
  ELSE failures := failures || format('derived: approved guest gave %s/%s, expected 1/Main Guest', gc, sa);
  END IF;

  -- 14. Approved with an approved +1 → 2 seats.
  SELECT guest_count, seat_allocation INTO gc, sa
    FROM rsvps WHERE sheet_key = 'test-full-sheet-guest';
  IF gc = 2 AND sa = 'Main Guest + Plus One' THEN passes := passes + 1;
  ELSE failures := failures || format('derived: approved +1 gave %s/%s, expected 2/Main Guest + Plus One', gc, sa);
  END IF;

  -- 15. Rejected invitation outranks attending = true → 0 seats.
  SELECT guest_count, seat_allocation INTO gc, sa
    FROM rsvps WHERE sheet_key = 'test-rejected-guest';
  IF gc = 0 AND sa = 'None' THEN passes := passes + 1;
  ELSE failures := failures || format('derived: rejected guest gave %s/%s, expected 0/None', gc, sa);
  END IF;

  -- ══ REPORT ═════════════════════════════════════════════════════════════
  IF array_length(failures, 1) > 0 THEN
    RAISE EXCEPTION E'SCHEMA COMPATIBILITY FAILED — % of % cases\n  %',
      array_length(failures, 1), passes + array_length(failures, 1),
      array_to_string(failures, E'\n  ');
  END IF;

  RAISE NOTICE 'ALL CASES PASSED (% checks). Nothing was written.', passes;
END $$;

ROLLBACK;

-- Confirm nothing survived — expect 0.
SELECT count(*) AS leftover_test_rows FROM rsvps WHERE full_name LIKE 'TEST %';
