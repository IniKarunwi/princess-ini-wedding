-- ============================================================================
--  0008_guest_photos — "The Wedding Through Your Eyes"
--
--  Storage for photographs guests take at the reception. Private by default,
--  permanently, by construction rather than by convention.
--
--  NUMBERING: 0007 is not present in this repository. Nothing here depends on
--  it; this file is self-contained.
--
--  NOT YET APPLIED. Until it is, guest photo submission fails with a clear
--  message and no photograph is stored anywhere.
--
--  Run in: Supabase dashboard -> SQL Editor -> New query -> Run
--  Safe to run more than once.
--
--  ── Amended before first application ───────────────────────────────────────
--  This file previously granted `anon` INSERT on both the table and the
--  bucket, because the first design had the browser uploading with the anon
--  key. It does not any more: the browser asks /api/photos/sign for a signed
--  upload URL, and the service role — which bypasses RLS — does the writing.
--
--  That removes the need for ANY anonymous policy here, which is the point.
--  The anon key is published in the JavaScript bundle by design, so an anon
--  INSERT policy on this bucket would have been a public write endpoint for
--  the life of the project. There is now no policy under which anon may read,
--  list, write, or delete anything in this feature.
-- ============================================================================

-- ── The private bucket ──────────────────────────────────────────────────────
--
-- public = false is the whole point. A public bucket hands out permanent,
-- unguessable-but-permanent URLs to anyone who ever sees one, and guest
-- photographs from a no-phone wedding must never be one leaked link away from
-- the open internet. Reading is done later, by the couple, through the
-- Supabase dashboard or a signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guest-photos',
  'guest-photos',
  false,
  20971520,                                   -- 20MB/object. The client
                                              -- downscales to roughly 1-2MB;
                                              -- the headroom is for the
                                              -- fallback path, where a photo
                                              -- the browser could not decode
                                              -- is sent as the phone made it
                                              -- rather than discarded.
  array[
    'image/jpeg',                             -- what the client re-encode
                                              -- produces, and so very nearly
                                              -- everything that arrives
    'image/png',
    'image/webp',
    'image/heic',                             -- fallback only: stored exactly
    'image/heif'                              -- as-is, never converted
  ]
)
on conflict (id) do update
  set public             = false,             -- re-assert on every run: this
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Metadata ────────────────────────────────────────────────────────────────
create table if not exists guest_photos (
  id            uuid primary key default gen_random_uuid(),

  -- Groups the photographs from one sitting. Generated client-side and
  -- meaningless on its own: it identifies a SESSION, not a person. Nothing
  -- here fingerprints a device, which the brief explicitly did not want.
  session_id    uuid not null,

  -- Object key inside the private bucket. Never a URL.
  storage_path  text not null unique,

  created_at    timestamptz not null default now(),

  -- Nothing is published without a deliberate human act.
  status        text not null default 'submitted'
                check (status in ('submitted', 'approved', 'hidden')),

  -- Room for the table number later, if single-QR ever becomes per-table.
  table_label   text,

  -- Diagnostics only. No EXIF, no location, no device identifier.
  width         integer,
  height        integer,
  bytes         integer
);

create index if not exists guest_photos_session_idx on guest_photos (session_id);
create index if not exists guest_photos_status_idx  on guest_photos (status, created_at desc);

alter table guest_photos enable row level security;

-- ── Policies: none, deliberately ────────────────────────────────────────────
--
-- RLS is enabled with no policy at all. That is not an oversight, it is the
-- mechanism: RLS with no matching policy denies. So `anon` — the key every
-- guest's browser holds — can do nothing whatsoever with this table.
--
-- Writes come from /api/photos/sign using the service role, which bypasses
-- RLS entirely and never leaves the server.
--
-- These two drops matter on a project where an earlier version of this file
-- was already run. Applying this file must actually REMOVE the anonymous
-- access the old one granted, not merely stop granting it.
drop policy if exists guest_photos_anon_insert on guest_photos;
drop policy if exists guest_photos_upload      on storage.objects;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: one row, public = false, file_size_limit = 20971520.
--   select id, public, file_size_limit from storage.buckets where id = 'guest-photos';
--
-- Expect: NO rows. Anything here is anonymous access that should not exist.
--   select policyname from pg_policies where tablename = 'guest_photos';
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and qual::text || with_check::text like '%guest-photos%';
--
-- Expect: relrowsecurity = true.
--   select relname, relrowsecurity from pg_class where relname = 'guest_photos';
