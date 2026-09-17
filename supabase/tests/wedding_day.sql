-- ============================================================================
--  wedding_day.sql — the cases from the brief, run against a real database.
--
--    createdb wd
--    psql -d wd -f supabase/fixtures/0000_baseline_rsvps.sql
--    psql -d wd -f supabase/migrations/0001..0005
--    psql -d wd -f supabase/migrations/0007_wedding_day.sql
--    psql -d wd -f supabase/tests/wedding_day.sql
--
--  Cases A-E (access hierarchy) are also covered in JavaScript by
--  scripts/email/selftest.mjs against events.mjs. They are repeated here
--  because the DOOR uses the SQL copy: if the two ever disagree, a guest is
--  turned away by one and admitted by the other, and only this file would
--  notice.
-- ============================================================================

\set ON_ERROR_STOP on
-- NOTICE is how this file reports; anything higher silences its own output.
SET client_min_messages TO NOTICE;

CREATE OR REPLACE FUNCTION t_check(p_name text, p_cond boolean, p_detail text DEFAULT NULL)
RETURNS void AS $$
BEGIN
  IF p_cond THEN
    RAISE NOTICE '  PASS  %', p_name;
  ELSE
    RAISE EXCEPTION 'FAIL  % %', p_name, coalesce(' — ' || p_detail, '');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fresh slate for the fixtures this file creates. Only ever touches its own rows.
DELETE FROM checkin_events WHERE rsvp_id IN (SELECT id FROM rsvps WHERE email LIKE '%@test.invalid');
DELETE FROM guest_passes   WHERE rsvp_id IN (SELECT id FROM rsvps WHERE email LIKE '%@test.invalid');
DELETE FROM rsvps WHERE email LIKE '%@test.invalid';

DO $$
DECLARE
  v_joining   uuid; v_reception uuid; v_after uuid; v_afterAlt uuid;
  v_rejected  uuid; v_party6    uuid;
  v_tok6      text := 'hash-party6'; v_tokRec text := 'hash-reception';
  v_r         jsonb;
  v_n         integer;
BEGIN
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  INSERT INTO rsvps (full_name, email, phone, attending, main_invite_status, approved_for, party_size)
  VALUES ('A Joining',     'a@test.invalid', '1', true,  'APPROVED', 'JOINING',     1) RETURNING id INTO v_joining;
  INSERT INTO rsvps (full_name, email, phone, attending, main_invite_status, approved_for, party_size)
  VALUES ('B Reception',   'b@test.invalid', '1', true,  'APPROVED', 'RECEPTION',   2) RETURNING id INTO v_reception;
  INSERT INTO rsvps (full_name, email, phone, attending, main_invite_status, approved_for, party_size)
  VALUES ('C After Party', 'c@test.invalid', '1', true,  'APPROVED', 'AFTER PARTY', 1) RETURNING id INTO v_after;
  INSERT INTO rsvps (full_name, email, phone, attending, main_invite_status, approved_for, party_size)
  VALUES ('D Afterparty',  'd@test.invalid', '1', true,  'APPROVED', 'AFTERPARTY',  1) RETURNING id INTO v_afterAlt;
  INSERT INTO rsvps (full_name, email, phone, attending, main_invite_status, approved_for, party_size)
  VALUES ('E Rejected',    'e@test.invalid', '1', true,  'REJECTED', 'REJECTED',    0) RETURNING id INTO v_rejected;
  INSERT INTO rsvps (full_name, email, phone, attending, main_invite_status, approved_for, party_size)
  VALUES ('F Party Six',   'f@test.invalid', '1', true,  'APPROVED', 'JOINING',     6) RETURNING id INTO v_party6;

  INSERT INTO guest_passes (rsvp_id, token_hash) VALUES (v_party6,    v_tok6);
  INSERT INTO guest_passes (rsvp_id, token_hash) VALUES (v_reception, v_tokRec);

  RAISE NOTICE '';
  RAISE NOTICE 'ACCESS HIERARCHY';

  -- CASE A — JOINING is the whole day.
  PERFORM t_check('A  JOINING -> joining',     guest_has_access('JOINING','APPROVED','JOINING'));
  PERFORM t_check('A  JOINING -> reception',   guest_has_access('JOINING','APPROVED','RECEPTION'));
  PERFORM t_check('A  JOINING -> after party', guest_has_access('JOINING','APPROVED','AFTERPARTY'));

  -- CASE B — RECEPTION is reception only.
  PERFORM t_check('B  RECEPTION -> joining is NO',     NOT guest_has_access('RECEPTION','APPROVED','JOINING'));
  PERFORM t_check('B  RECEPTION -> reception',             guest_has_access('RECEPTION','APPROVED','RECEPTION'));
  PERFORM t_check('B  RECEPTION -> after party is NO', NOT guest_has_access('RECEPTION','APPROVED','AFTERPARTY'));

  -- CASE C / D — the two spellings must be one tier.
  PERFORM t_check('C  AFTER PARTY -> after party',          guest_has_access('AFTER PARTY','APPROVED','AFTERPARTY'));
  PERFORM t_check('C  AFTER PARTY -> reception is NO',  NOT guest_has_access('AFTER PARTY','APPROVED','RECEPTION'));
  PERFORM t_check('D  AFTERPARTY behaves identically',
    guest_has_access('AFTERPARTY','APPROVED','AFTERPARTY') = guest_has_access('AFTER PARTY','APPROVED','AFTERPARTY')
    AND guest_has_access('AFTERPARTY','APPROVED','JOINING') = guest_has_access('AFTER PARTY','APPROVED','JOINING'));
  PERFORM t_check('D  and so does AFTER-PARTY', guest_has_access('AFTER-PARTY','APPROVED','AFTERPARTY'));

  -- CASE E — rejected admits nobody, whatever the tier column holds.
  PERFORM t_check('E  REJECTED -> nothing',
    NOT guest_has_access('JOINING','REJECTED','JOINING')
    AND NOT guest_has_access('JOINING','REJECTED','RECEPTION')
    AND NOT guest_has_access('JOINING','REJECTED','AFTERPARTY'));
  PERFORM t_check('E  PENDING -> nothing', NOT guest_has_access('JOINING','PENDING','JOINING'));

  RAISE NOTICE '';
  RAISE NOTICE 'PARTIAL PARTY CHECK-IN';

  -- CASE F — 4 of 6 into Joining.
  v_r := checkin_by_token(v_tok6, 'JOINING', 4, 'test');
  PERFORM t_check('F  4 of 6 checked into Joining',
    (v_r->>'ok')::boolean AND (v_r->>'checked_in')::int = 4 AND (v_r->>'remaining')::int = 2, v_r::text);
  PERFORM t_check('F  Reception untouched: 0 in, 6 remaining',
    (SELECT checked_in = 0 AND remaining = 6 FROM checkin_totals WHERE rsvp_id = v_party6 AND event = 'RECEPTION'));
  PERFORM t_check('F  After Party untouched: 0 in, 6 remaining',
    (SELECT checked_in = 0 AND remaining = 6 FROM checkin_totals WHERE rsvp_id = v_party6 AND event = 'AFTERPARTY'));

  -- CASE G — 3 more when only 2 remain must be refused outright, not clamped.
  v_r := checkin_by_token(v_tok6, 'JOINING', 3, 'test');
  PERFORM t_check('G  3 more with 2 remaining is REFUSED',
    NOT (v_r->>'ok')::boolean AND v_r->>'code' = 'EXCEEDS_PARTY', v_r::text);
  PERFORM t_check('G  and nothing was written',
    (SELECT checked_in FROM checkin_totals WHERE rsvp_id = v_party6 AND event = 'JOINING') = 4);

  -- CASE H — the remaining 2 complete the party.
  v_r := checkin_by_token(v_tok6, 'JOINING', 2, 'test');
  PERFORM t_check('H  final 2 accepted -> 6 of 6',
    (v_r->>'ok')::boolean AND (v_r->>'checked_in')::int = 6 AND (v_r->>'remaining')::int = 0, v_r::text);

  -- CASE I — a full party scanned again must not increment.
  v_r := checkin_by_token(v_tok6, 'JOINING', 1, 'test');
  PERFORM t_check('I  re-scan when full returns ALREADY_FULL',
    NOT (v_r->>'ok')::boolean AND v_r->>'code' = 'ALREADY_FULL', v_r::text);
  PERFORM t_check('I  count did not move',
    (SELECT checked_in FROM checkin_totals WHERE rsvp_id = v_party6 AND event = 'JOINING') = 6);

  -- CASE J — the SAME token still works for a different event. This is the
  -- whole reason check-in is per-event rather than one global boolean.
  v_r := checkin_by_token(v_tok6, 'RECEPTION', 6, 'test');
  PERFORM t_check('J  same QR works at Reception',
    (v_r->>'ok')::boolean AND (v_r->>'checked_in')::int = 6, v_r::text);

  -- CASE K — reception-only guest at the wedding service.
  v_r := checkin_by_token(v_tokRec, 'JOINING', 1, 'test');
  PERFORM t_check('K  reception-only at Joining -> NO_ACCESS_TO_EVENT',
    NOT (v_r->>'ok')::boolean AND v_r->>'code' = 'NO_ACCESS_TO_EVENT', v_r::text);
  PERFORM t_check('K  no check-in row was created',
    (SELECT count(*) FROM checkin_events WHERE rsvp_id = v_reception AND event = 'JOINING') = 0);
  PERFORM t_check('K  but Reception still works for them',
    (checkin_by_token(v_tokRec, 'RECEPTION', 1, 'test')->>'ok')::boolean);

  -- CASE L — an unknown token must not distinguish itself from a known one.
  v_r := checkin_by_token('hash-that-does-not-exist', 'JOINING', 1, 'test');
  PERFORM t_check('L  unknown token -> INVALID_PASS',
    NOT (v_r->>'ok')::boolean AND v_r->>'code' = 'INVALID_PASS', v_r::text);
  PERFORM t_check('L  and leaks no guest fields',
    NOT (v_r ? 'full_name') AND NOT (v_r ? 'party_size'), v_r::text);
  PERFORM t_check('L  resolve_pass says the same for unknown tokens',
    resolve_pass('hash-that-does-not-exist')->>'code' = 'INVALID_PASS');

  RAISE NOTICE '';
  RAISE NOTICE 'CORRECTIONS';

  -- CASE N — +6 then -2 nets 4, and both rows survive.
  v_r := checkin_by_token(v_tok6, 'AFTERPARTY', 6, 'staff-1');
  PERFORM t_check('N  staff records 6 by mistake', (v_r->>'ok')::boolean);
  v_r := correct_checkin(v_party6, 'AFTERPARTY', -2, 'miscounted at the door', 'staff-1');
  PERFORM t_check('N  correction of -2 accepted', (v_r->>'ok')::boolean, v_r::text);
  PERFORM t_check('N  net checked in is 4',
    (SELECT checked_in FROM checkin_totals WHERE rsvp_id = v_party6 AND event = 'AFTERPARTY') = 4);
  SELECT count(*) INTO v_n FROM checkin_events WHERE rsvp_id = v_party6 AND event = 'AFTERPARTY';
  PERFORM t_check('N  BOTH operations remain in the ledger', v_n = 2, 'rows: ' || v_n);
  PERFORM t_check('N  the reason is recorded',
    EXISTS (SELECT 1 FROM checkin_events WHERE rsvp_id = v_party6 AND delta = -2 AND reason = 'miscounted at the door'));

  -- A correction with no reason is refused: an unexplained adjustment is
  -- indistinguishable from an error when someone reads this tomorrow.
  PERFORM t_check('N  correction without a reason is refused',
    correct_checkin(v_party6, 'AFTERPARTY', -1, '  ', 'staff-1')->>'code' = 'REASON_REQUIRED');
  PERFORM t_check('N  a correction cannot drive the count below zero',
    correct_checkin(v_party6, 'AFTERPARTY', -99, 'typo', 'staff-1')->>'code' = 'WOULD_GO_NEGATIVE');

  RAISE NOTICE '';
  RAISE NOTICE 'GUARDS';

  PERFORM t_check('zero quantity is refused',
    checkin_by_token(v_tok6, 'JOINING', 0, 'test')->>'code' = 'BAD_QUANTITY');
  PERFORM t_check('negative quantity is refused',
    checkin_by_token(v_tok6, 'JOINING', -3, 'test')->>'code' = 'BAD_QUANTITY');
  PERFORM t_check('an unknown event name is refused',
    checkin_by_token(v_tok6, 'COCKTAILS', 1, 'test')->>'code' = 'BAD_EVENT');

  -- A revoked pass must behave exactly like a token that never existed.
  UPDATE guest_passes SET revoked_at = now(), revoked_reason = 'test' WHERE token_hash = v_tokRec;
  PERFORM t_check('a revoked pass is INVALID_PASS',
    checkin_by_token(v_tokRec, 'RECEPTION', 1, 'test')->>'code' = 'INVALID_PASS');

  -- One active pass per party — the index is what makes generation idempotent.
  BEGIN
    INSERT INTO guest_passes (rsvp_id, token_hash) VALUES (v_party6, 'another-hash');
    PERFORM t_check('a second ACTIVE pass is rejected', false, 'the insert succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM t_check('a second ACTIVE pass is rejected', true);
  END;

  -- But a replacement after revocation is allowed.
  UPDATE guest_passes SET revoked_at = now() WHERE rsvp_id = v_party6 AND revoked_at IS NULL;
  INSERT INTO guest_passes (rsvp_id, token_hash) VALUES (v_party6, 'rotated-hash');
  PERFORM t_check('a replacement pass after revocation is allowed', true);

  RAISE NOTICE '';
  RAISE NOTICE 'DASHBOARD';

  -- Expected headcount must use party_size, never a row count.
  PERFORM t_check('expected headcount counts PEOPLE, not rows',
    (SELECT SUM(party_size)::int FROM checkin_totals WHERE event = 'JOINING' AND has_access) = 7,
    'joining-eligible seats: ' ||
    (SELECT SUM(party_size)::int FROM checkin_totals WHERE event = 'JOINING' AND has_access)::text);

  PERFORM t_check('the rejected guest is in no event list',
    (SELECT count(*) FROM checkin_totals WHERE rsvp_id = v_rejected AND has_access) = 0);

  RAISE NOTICE '';
  RAISE NOTICE 'All wedding-day checks passed.';
END $$;

-- Tidy up after ourselves.
DELETE FROM checkin_events WHERE rsvp_id IN (SELECT id FROM rsvps WHERE email LIKE '%@test.invalid');
DELETE FROM guest_passes   WHERE rsvp_id IN (SELECT id FROM rsvps WHERE email LIKE '%@test.invalid');
DELETE FROM rsvps WHERE email LIKE '%@test.invalid';
DROP FUNCTION IF EXISTS t_check(text, boolean, text);
