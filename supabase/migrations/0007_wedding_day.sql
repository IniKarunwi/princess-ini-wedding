-- ============================================================================
--  0007_wedding_day.sql — admission, passes and event check-in
--
--  Run this in Supabase → SQL Editor. Safe to run more than once: every
--  statement is guarded and no existing column, trigger or row is dropped.
--
--  ── DO NOT RUN APPLY_ALL.sql ──────────────────────────────────────────────
--  0006_message_queue.sql has never been applied, and it DROPS email_status
--  and last_email_sent — the two columns the live Resend sender writes. This
--  migration deliberately does not depend on 0006 and must be applied on its
--  own.
--
--  ── What this adds ────────────────────────────────────────────────────────
--    rsvps.party_size    how many people the invitation actually admits
--    guest_passes        one opaque token per approved party
--    checkin_events      append-only, signed ledger of arrivals
--    checkin_totals      the view the dashboard reads
--    three RPCs          resolve a pass, check in, correct a check-in
--
--  ── Why party_size is a new column and not guest_count ────────────────────
--  guest_count is computed by a BEFORE trigger (0002) that returns only 0, 1
--  or 2 — it cannot represent "Olakunle +5". Anything written to it is
--  overwritten on the next write. seat_allocation (0003) is GENERATED from it,
--  and the sync's tests assert the trigger owns it.
--
--  So guest_count is left exactly as it is, and admission gets its own column.
--  They answer different questions: guest_count is "did the couple approve a
--  plus one", party_size is "how many bodies may walk through the door". On a
--  normal guest the two agree, and the backfill below starts them equal.
-- ============================================================================


-- ── 1. Admission size ───────────────────────────────────────────────────────

ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS party_size integer;

-- Start every row where it is today, so nothing changes until a party size is
-- deliberately corrected. The +N backfill is a SEPARATE, reviewed step —
-- see scripts/wedding-day/party-size.mjs, which prints every row it would
-- change and writes nothing without --write.
UPDATE rsvps SET party_size = COALESCE(guest_count, 0) WHERE party_size IS NULL;

ALTER TABLE rsvps ALTER COLUMN party_size SET DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE rsvps ADD CONSTRAINT rsvps_party_size_sane CHECK (party_size >= 0 AND party_size <= 50);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN rsvps.party_size IS
  'People this invitation admits. Independent of guest_count, which the 0002 '
  'trigger caps at 2. This is the number the door and the dashboard use.';


-- ── 2. Access tier, in the database ─────────────────────────────────────────
--
-- The same hierarchy as scripts/email/events.mjs, restated here because the
-- check-in RPC has to enforce it inside the transaction — it cannot call out
-- to JavaScript. events.mjs stays the single source of truth for anything
-- rendered; this is the door's copy, and the test suite asserts they agree.

CREATE OR REPLACE FUNCTION guest_has_access(p_approved_for text, p_status text, p_event text)
RETURNS boolean AS $$
DECLARE
  tier  text := upper(regexp_replace(coalesce(p_approved_for, ''), '[^A-Za-z]', '', 'g'));
  ev    text := upper(regexp_replace(coalesce(p_event, ''),        '[^A-Za-z]', '', 'g'));
BEGIN
  -- Rejected or undecided admits nobody, whatever the tier column says.
  IF upper(coalesce(p_status, '')) <> 'APPROVED' THEN
    RETURN false;
  END IF;

  -- JOINING is the whole day. This is the rule most easily got wrong, and
  -- getting it wrong turns a whole-day guest away at the reception door.
  IF tier = 'JOINING' THEN
    RETURN ev IN ('JOINING', 'RECEPTION', 'AFTERPARTY');
  END IF;

  -- Stripping non-letters above is what makes 'AFTER PARTY', 'AFTER-PARTY'
  -- and 'AFTERPARTY' the same tier without touching production data.
  IF tier = 'RECEPTION'  THEN RETURN ev = 'RECEPTION';  END IF;
  IF tier = 'AFTERPARTY' THEN RETURN ev = 'AFTERPARTY'; END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ── 3. Passes ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guest_passes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id     uuid NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,

  -- ONLY the hash. The raw token is returned once at generation, lives in the
  -- pass URL, and is never stored — so a dump of this table yields no working
  -- passes. Lookup is an indexed equality probe on the hash, which is what
  -- keeps resolution fast on venue wifi.
  token_hash  text NOT NULL,

  issued_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  revoked_reason text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_passes_token_hash_key ON guest_passes (token_hash);

-- One ACTIVE pass per party. Partial, so a revoked pass stays for the audit
-- trail and a replacement can be issued without deleting history. This is
-- also what makes generation idempotent: the second run finds this row.
CREATE UNIQUE INDEX IF NOT EXISTS guest_passes_one_active_per_rsvp
  ON guest_passes (rsvp_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS guest_passes_rsvp_idx ON guest_passes (rsvp_id);


-- ── 4. Check-in ledger ──────────────────────────────────────────────────────
--
-- Append-only and signed. A correction is a new row with a negative delta, so
-- "+6 then -2" reads as 4 while both operations remain visible. Nothing is
-- ever updated or deleted, which is what makes the audit trail trustworthy.

CREATE TABLE IF NOT EXISTS checkin_events (
  id          bigserial PRIMARY KEY,
  rsvp_id     uuid NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  event       text NOT NULL CHECK (event IN ('JOINING', 'RECEPTION', 'AFTERPARTY')),
  delta       integer NOT NULL CHECK (delta <> 0),
  actor       text,          -- which staff device/name performed it
  reason      text,          -- set on corrections
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkin_events_rsvp_event_idx ON checkin_events (rsvp_id, event);
CREATE INDEX IF NOT EXISTS checkin_events_event_idx      ON checkin_events (event);
CREATE INDEX IF NOT EXISTS checkin_events_created_idx    ON checkin_events (created_at DESC);

COMMENT ON TABLE checkin_events IS
  'Append-only. Never UPDATE or DELETE a row here — record a compensating '
  'negative delta instead, so the history of what staff actually did survives.';


-- ── 5. Totals ───────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW checkin_totals AS
SELECT
  r.id                                   AS rsvp_id,
  r.full_name,
  r.approved_for,
  r.main_invite_status,
  COALESCE(r.party_size, 0)              AS party_size,
  e.event,
  COALESCE(SUM(c.delta), 0)::int         AS checked_in,
  COALESCE(r.party_size, 0) - COALESCE(SUM(c.delta), 0)::int AS remaining,
  guest_has_access(r.approved_for, r.main_invite_status, e.event) AS has_access,
  MAX(c.created_at)                      AS last_checkin_at
FROM rsvps r
CROSS JOIN (VALUES ('JOINING'), ('RECEPTION'), ('AFTERPARTY')) AS e(event)
LEFT JOIN checkin_events c ON c.rsvp_id = r.id AND c.event = e.event
GROUP BY r.id, r.full_name, r.approved_for, r.main_invite_status, r.party_size, e.event;

COMMENT ON VIEW checkin_totals IS
  'One row per rsvp per event. checked_in is the SUM of the signed ledger, so '
  'corrections are already applied.';


-- ── 6. Check-in, atomically ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION checkin_by_token(
  p_token_hash text,
  p_event      text,
  p_quantity   integer,
  p_actor      text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_rsvp     rsvps%ROWTYPE;
  v_pass     guest_passes%ROWTYPE;
  v_already  integer;
  v_size     integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_QUANTITY');
  END IF;
  IF upper(coalesce(p_event,'')) NOT IN ('JOINING','RECEPTION','AFTERPARTY') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_EVENT');
  END IF;

  SELECT * INTO v_pass FROM guest_passes
   WHERE token_hash = p_token_hash AND revoked_at IS NULL;

  -- Deliberately the SAME answer for "no such token" and "revoked token", and
  -- it reveals nothing about whether any rsvp exists. Case L.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PASS');
  END IF;

  -- THE LOCK. Everything below reads and then writes a count, so two admins
  -- scanning the last seat at the same moment must not both pass the check.
  -- Taking the row lock first serialises them: the second waits here, then
  -- re-reads a total that already includes the first. Case M.
  SELECT * INTO v_rsvp FROM rsvps WHERE id = v_pass.rsvp_id FOR UPDATE;

  IF NOT guest_has_access(v_rsvp.approved_for, v_rsvp.main_invite_status, p_event) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'NO_ACCESS_TO_EVENT',
      'full_name', v_rsvp.full_name,
      'approved_for', v_rsvp.approved_for);
  END IF;

  v_size := COALESCE(v_rsvp.party_size, 0);
  SELECT COALESCE(SUM(delta), 0) INTO v_already
    FROM checkin_events WHERE rsvp_id = v_rsvp.id AND event = upper(p_event);

  IF v_already >= v_size THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'ALREADY_FULL',
      'full_name', v_rsvp.full_name,
      'party_size', v_size, 'checked_in', v_already, 'remaining', 0);
  END IF;

  IF v_already + p_quantity > v_size THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'EXCEEDS_PARTY',
      'full_name', v_rsvp.full_name,
      'party_size', v_size, 'checked_in', v_already,
      'remaining', v_size - v_already, 'requested', p_quantity);
  END IF;

  INSERT INTO checkin_events (rsvp_id, event, delta, actor)
  VALUES (v_rsvp.id, upper(p_event), p_quantity, p_actor);

  RETURN jsonb_build_object(
    'ok', true, 'code', 'CHECKED_IN',
    'full_name', v_rsvp.full_name,
    'party_size', v_size,
    'checked_in', v_already + p_quantity,
    'remaining', v_size - v_already - p_quantity);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 7. Corrections ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION correct_checkin(
  p_rsvp_id uuid,
  p_event   text,
  p_delta   integer,       -- negative to reverse, positive to add
  p_reason  text,
  p_actor   text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_rsvp    rsvps%ROWTYPE;
  v_already integer;
  v_size    integer;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_DELTA');
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    -- A correction without a reason is indistinguishable from a mistake when
    -- someone reads the ledger tomorrow.
    RETURN jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  END IF;

  SELECT * INTO v_rsvp FROM rsvps WHERE id = p_rsvp_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  v_size := COALESCE(v_rsvp.party_size, 0);
  SELECT COALESCE(SUM(delta), 0) INTO v_already
    FROM checkin_events WHERE rsvp_id = p_rsvp_id AND event = upper(p_event);

  IF v_already + p_delta < 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WOULD_GO_NEGATIVE',
      'checked_in', v_already, 'delta', p_delta);
  END IF;
  IF v_already + p_delta > v_size THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXCEEDS_PARTY',
      'checked_in', v_already, 'party_size', v_size, 'delta', p_delta);
  END IF;

  INSERT INTO checkin_events (rsvp_id, event, delta, actor, reason)
  VALUES (p_rsvp_id, upper(p_event), p_delta, p_actor, p_reason);

  RETURN jsonb_build_object('ok', true, 'code', 'CORRECTED',
    'checked_in', v_already + p_delta,
    'remaining', v_size - v_already - p_delta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 8. Reading a pass ───────────────────────────────────────────────────────
--
-- What /pass/:token is allowed to show. Deliberately narrow: no email, no
-- phone, no id. A guest holding a token learns their own name, party size and
-- access — nothing that helps them reach anyone else's record.

CREATE OR REPLACE FUNCTION resolve_pass(p_token_hash text)
RETURNS jsonb AS $$
DECLARE
  v_rsvp rsvps%ROWTYPE;
  v_pass guest_passes%ROWTYPE;
BEGIN
  SELECT * INTO v_pass FROM guest_passes
   WHERE token_hash = p_token_hash AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PASS');
  END IF;

  SELECT * INTO v_rsvp FROM rsvps WHERE id = v_pass.rsvp_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PASS');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'full_name',  v_rsvp.full_name,
    'party_size', COALESCE(v_rsvp.party_size, 0),
    'plus_one_name', v_rsvp.plus_one_name,
    'access', jsonb_build_object(
      'joining',    guest_has_access(v_rsvp.approved_for, v_rsvp.main_invite_status, 'JOINING'),
      'reception',  guest_has_access(v_rsvp.approved_for, v_rsvp.main_invite_status, 'RECEPTION'),
      'afterParty', guest_has_access(v_rsvp.approved_for, v_rsvp.main_invite_status, 'AFTERPARTY')));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 9. Row level security ───────────────────────────────────────────────────
--
-- THIS IS THE SECTION THAT CLOSES RSVP SUBMISSION, and it does something else
-- worth stating plainly: until now `rsvps` had no RLS at all. The browser
-- holds the anon key, so the whole guest list — names, emails, phones, tiers —
-- was readable by anyone who opened the site. Enabling RLS with no anon policy
-- closes both at once.
--
-- service_role bypasses RLS entirely, so the sync, the email sender and the
-- admin Edge Functions keep working untouched.

ALTER TABLE rsvps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_passes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_events ENABLE ROW LEVEL SECURITY;

-- No policies are created on purpose. RLS on with zero policies = deny all for
-- anon and authenticated; service_role is unaffected. If you later need the
-- site to read something public, add a narrow SELECT policy for that column
-- set — never a blanket one.

-- Belt and braces on top of RLS: these are SECURITY DEFINER, so they run with
-- the owner's rights and must not be callable by the public roles. Guarded by
-- a role check so the file also runs on a plain Postgres, where `anon` and
-- `authenticated` are Supabase-specific and do not exist.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION checkin_by_token(text, text, integer, text) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION correct_checkin(uuid, text, integer, text, text) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION resolve_pass(text) FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
--  AFTER RUNNING THIS
--
--  The public RSVP form will stop being able to insert. That is intended —
--  registrations are closed. If you need to reopen it, add an INSERT policy
--  for anon rather than disabling RLS.
--
--  Verify with:
--    select count(*) from rsvps;                       -- as service_role: works
--    select party_size, count(*) from rsvps group by 1 order by 1;
--    select * from checkin_totals limit 5;
-- ============================================================================
