-- ============================================================================
--  verify_0007_compat.sql — READ ONLY. Paste into Supabase → SQL Editor → Run.
--
--  Nothing here writes. There is no INSERT, UPDATE, DELETE, ALTER, CREATE or
--  DROP in this file — you can read it top to bottom and confirm that.
--
--  Companion to `npm run verify:production`, which covers columns, data and
--  RLS behaviour over the REST API. This file covers what REST cannot see:
--  triggers, policies, function bodies and constraints.
--
--  Run this BEFORE 0007. Read section 8 last — it is the verdict.
-- ============================================================================

\echo ''
\echo '=== 1. rsvps columns ==================================================='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'rsvps'
ORDER BY ordinal_position;

\echo ''
\echo '=== 2. Is there a column literally named "main"? ======================='
-- The brief assumed one. If this returns no rows, the tier lives in
-- main_invite_status + approved_for, which is what the code reads.
SELECT count(*) AS main_column_exists
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'main';

\echo ''
\echo '=== 3. Triggers on rsvps =============================================='
-- trg_set_guest_count is the one that matters: it OVERWRITES guest_count on
-- every write and caps it at 2. 0007 does not touch it, which is why
-- admission gets its own column.
SELECT t.tgname AS trigger_name,
       p.proname AS function_name,
       CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
       t.tgenabled AS enabled
FROM pg_trigger t
JOIN pg_class  cl ON cl.oid = t.tgrelid
JOIN pg_proc   p  ON p.oid  = t.tgfoid
WHERE cl.relname = 'rsvps' AND NOT t.tgisinternal
ORDER BY t.tgname;

\echo ''
\echo '=== 4. guest_count ceiling, from the function itself ==================='
-- Confirms from the LIVE function body that 2 really is the maximum, rather
-- than trusting the migration file on disk.
SELECT proname,
       (prosrc LIKE '%RETURN 2;%') AS caps_at_two,
       (prosrc LIKE '%RETURN 1;%') AS has_single_branch
FROM pg_proc
WHERE proname IN ('compute_guest_count', 'set_guest_count');

\echo ''
\echo '=== 5. RLS state and policies ========================================='
-- rowsecurity = false on rsvps means the anon key can read the whole guest
-- list, because that key ships in the browser bundle. 0007 turns it on.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('rsvps','guest_passes','checkin_events','message_queue','message_channels')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

\echo ''
\echo '=== 6. Functions 0007 would define ===================================='
-- 0007 uses CREATE OR REPLACE. If any of these already exist with a DIFFERENT
-- signature, the replace fails — that is the one real conflict to look for.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('guest_has_access','checkin_by_token','correct_checkin','resolve_pass','compute_guest_count')
ORDER BY p.proname;

\echo ''
\echo '=== 7. Tables and constraints 0007 would add =========================='
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('guest_passes','checkin_events','message_queue')
ORDER BY table_name;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.rsvps'::regclass
ORDER BY conname;

\echo ''
\echo '=== 8. VERDICT ========================================================'
SELECT
  -- Blockers
  (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='rsvps' AND column_name='email_status')
    AS blocker_0006_applied_email_columns_gone,

  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='rsvps'
       AND column_name IN ('main_invite_status','approved_for','guest_count','full_name')) <> 4
    AS blocker_required_columns_missing,

  (SELECT count(*) > 0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='checkin_by_token'
       AND pg_get_function_identity_arguments(p.oid) <> 'p_token_hash text, p_event text, p_quantity integer, p_actor text')
    AS blocker_checkin_signature_differs,

  -- Not blockers, but decide the order you do things in
  (SELECT NOT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='rsvps')
    AS note_guest_list_currently_public,

  (SELECT count(*) > 0 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='rsvps' AND column_name='party_size')
    AS note_0007_already_partly_applied;

\echo ''
\echo 'Every blocker_* above must read FALSE before applying 0007.'
\echo 'note_* are informational: true is not an error, but read the section above it.'
\echo ''
