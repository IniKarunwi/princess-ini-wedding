-- ============================================================================
--  Baseline `rsvps` — the table as it existed BEFORE any migration in
--  supabase/migrations/ was written.
--
--  This is NOT a migration. Do not run it against production; the real table
--  already exists. It is here so the migrations and the two test suites can be
--  verified against a faithful empty database locally:
--
--      createdb rsvp_check
--      psql -d rsvp_check -f supabase/fixtures/0000_baseline_rsvps.sql
--      psql -d rsvp_check -f supabase/migrations/APPLY_ALL.sql
--      psql -d rsvp_check -f supabase/tests/schema_compatibility.sql
--      psql -d rsvp_check -f supabase/tests/message_queue.sql
--
--  Column set and nullability mirror the live schema: the table was built for
--  website submissions, where a validated form guarantees every field, so
--  almost everything is NOT NULL. That is precisely the assumption 0005 has
--  to relax for sheet-created guests.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rsvps (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  full_name             text        NOT NULL,
  email                 text        NOT NULL,
  phone                 text        NOT NULL,
  attending             boolean     NOT NULL,
  guest_count           integer     NOT NULL DEFAULT 0,
  plus_one_requested    boolean     NOT NULL DEFAULT false,
  plus_one_name         text,
  plus_one_relationship text,
  plus_one_status       text
);
