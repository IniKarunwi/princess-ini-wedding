-- ════════════════════════════════════════════════════════════════════════════
-- 0009 · The seating plan, on the server
--
-- GENERATED FILE. Edit scripts/seating/0009.template.sql and re-run
--   node scripts/seating/make-migration.mjs
--
-- Until now the hall layout lived in one browser's localStorage: a planner
-- editing on a laptop could not be seen by a planner on a phone, and a
-- cleared browser lost the room. This migration moves both the draft and the
-- published layout into Postgres so every planner shares one plan and guests
-- see exactly what was published.
--
-- ── What a guest may read ───────────────────────────────────────────────────
-- RLS is on and the ONLY policy is a SELECT on the published row. There is no
-- policy for the draft and no policy for insert, update or delete, so under
-- RLS those are denied by default — a guest holding the anon key (which is
-- public by design) can read the published room and nothing else. Every write
-- goes through the service-role key, which lives on the server and is never
-- part of a browser bundle.
--
-- ── Initialization is additive, never destructive ───────────────────────────
-- `status` as the primary key guarantees AT MOST one draft row and one
-- published row. It does not guarantee either exists, so this migration seeds
-- both from the canonical seating document. Both inserts are
-- `on conflict (status) do nothing`: applying this to a project that already
-- has rows changes nothing. It also cannot touch a planner's browser-local
-- draft — that recovery path is handled in the application, which offers to
-- upload it rather than discarding it.
--
-- Seed: __TABLES__ tables, __SEATS__ seats, straight from buildInitialLayout().
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.seating_layouts (
  -- One row per state. Not a uuid id: there is no such thing as a second
  -- draft, and a surrogate key would make "two drafts" representable.
  status      text primary key check (status in ('draft', 'published')),
  -- Bumped on every accepted write. The client sends the version it loaded
  -- and a mismatch is refused, which is what stops two planners on two
  -- devices silently overwriting each other.
  version     integer not null default 1,
  -- The Layout, minus version and status — those are the columns above.
  payload     jsonb not null,
  updated_at  timestamptz not null default now(),
  -- The display name the planner gave at sign-in. Audit, not identity.
  updated_by  text
);

comment on table public.seating_layouts is
  'The reception hall layout. Exactly two rows: the shared planner draft and the published plan guests see.';

alter table public.seating_layouts enable row level security;

-- Guests read the published row. Nothing else is granted to anyone holding
-- the anon key, so the draft is genuinely private rather than merely unlinked.
drop policy if exists "published seating is public" on public.seating_layouts;
create policy "published seating is public"
  on public.seating_layouts
  for select
  to anon, authenticated
  using (status = 'published');

-- Deliberately no insert/update/delete policies. Writes are service-role only.

-- ── Session revocation ──────────────────────────────────────────────────────
-- Signed planner cookies last seven days. If the PIN is rotated or a device is
-- lost, bumping session_epoch invalidates every cookie ever issued, without
-- building an account system:
--   update public.planner_settings set session_epoch = session_epoch + 1;
create table if not exists public.planner_settings (
  id            boolean primary key default true check (id),
  session_epoch integer not null default 1,
  updated_at    timestamptz not null default now()
);

alter table public.planner_settings enable row level security;
-- No policies at all: unreadable and unwritable with the anon key.

insert into public.planner_settings (id) values (true)
  on conflict (id) do nothing;

-- ── Publishing, in one transaction ──────────────────────────────────────────
-- Publishing is copy-draft-to-published plus a version bump. Done as two
-- round trips from the API it has a window in which a guest could load a
-- half-published room, or two planners could both believe they published.
-- Here it is one statement block under row locks, and it refuses outright if
-- the caller's draft version is not the current one.
create or replace function public.publish_seating(expected_version integer, actor text)
returns public.seating_layouts
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d public.seating_layouts;
  p public.seating_layouts;
begin
  select * into d from public.seating_layouts where status = 'draft' for update;
  if not found then
    raise exception 'no draft to publish' using errcode = 'P0002';
  end if;

  if d.version <> expected_version then
    -- 40001 is serialization_failure; the API turns it into a 409 so the
    -- planner is told to reload rather than shown a generic error.
    raise exception 'draft is at version %, caller held %', d.version, expected_version
      using errcode = '40001';
  end if;

  select * into p from public.seating_layouts where status = 'published' for update;

  update public.seating_layouts
     set payload = d.payload,
         version = coalesce(p.version, 0) + 1,
         updated_at = now(),
         updated_by = actor
   where status = 'published'
  returning * into p;

  -- The draft moves with it, so the next edit starts from what is live and a
  -- planner is never shown "unpublished changes" for work already published.
  update public.seating_layouts
     set payload = p.payload,
         version = d.version + 1,
         updated_at = now(),
         updated_by = actor
   where status = 'draft';

  return p;
end;
$fn$;

revoke all on function public.publish_seating(integer, text) from public;
revoke all on function public.publish_seating(integer, text) from anon;
revoke all on function public.publish_seating(integer, text) from authenticated;
-- service_role reaches it as the owner; no grant is needed and none is given.

-- ── Seed ────────────────────────────────────────────────────────────────────
insert into public.seating_layouts (status, version, payload, updated_by)
values ('published', 1, $seed$__PAYLOAD__$seed$::jsonb, 'canonical import')
  on conflict (status) do nothing;

insert into public.seating_layouts (status, version, payload, updated_by)
values ('draft', 1, $seed$__PAYLOAD__$seed$::jsonb, 'canonical import')
  on conflict (status) do nothing;
