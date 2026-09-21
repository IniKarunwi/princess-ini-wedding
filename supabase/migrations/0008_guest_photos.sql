-- ============================================================================
--  0008_guest_photos — "The Wedding Through Your Eyes"
--
--  Storage for photographs guests take at the reception. Private by default,
--  permanently, by construction rather than by convention.
--
--  NUMBERING: 0007_wedding_day.sql is owned by feature/wedding-day-backend and
--  is NOT applied by this branch. This file is 0008 so the two never collide.
--  Apply 0007 first if it has not been applied; nothing here depends on it.
--
--  NOT YET APPLIED. Until it is, guest photo submission fails with a clear
--  message and no photograph is stored anywhere.
--
--  Run in: Supabase dashboard -> SQL Editor -> New query -> Run
--  Safe to run more than once.
-- ============================================================================

-- ── The private bucket ──────────────────────────────────────────────────────
--
-- public = false is the whole point. A public bucket hands out permanent,
-- unguessable-but-permanent URLs to anyone who ever sees one, and guest
-- photographs from a no-phone wedding must never be one leaked link away from
-- the open internet. Reading is done later, by an admin, through a signed URL
-- or the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guest-photos',
  'guest-photos',
  false,
  15728640,                                   -- 15 MB/object: generous for a
                                              -- client-downscaled JPEG, mean
                                              -- enough to stop a video.
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = false,             -- re-assert on every run: this
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Metadata ────────────────────────────────────────────────────────────────
create table if not exists guest_photos (
  id            uuid primary key default gen_random_uuid(),

  -- Groups the handful of photos from one sitting. Generated client-side and
  -- meaningless on its own: it identifies a SESSION, not a person. Nothing
  -- here fingerprints a device, which the brief explicitly did not want.
  session_id    uuid not null,

  -- Object key inside the private bucket. Never a URL.
  storage_path  text not null unique,

  created_at    timestamptz not null default now(),

  -- Nothing is published without a deliberate human act. 'submitted' is the
  -- only value the guest client can ever write; see the insert policy below.
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

-- ── Policies ────────────────────────────────────────────────────────────────
--
-- RLS with no matching policy denies. So the absence of a SELECT policy for
-- anon below is not an oversight — it is the mechanism. A guest cannot read
-- back their own submission, cannot list anyone else's, and cannot discover
-- that any other photograph exists.

drop policy if exists guest_photos_anon_insert on guest_photos;
create policy guest_photos_anon_insert
  on guest_photos for insert to anon
  -- A guest may only ever create a row in the submitted state. Writing
  -- 'approved' directly is refused by the database, not by the UI, so a
  -- forged client cannot publish itself into a gallery that may exist later.
  with check (status = 'submitted');

-- Deliberately absent for anon: select, update, delete.
-- Admin access is via the service role, which bypasses RLS entirely.

-- ── Bucket policies ─────────────────────────────────────────────────────────
drop policy if exists guest_photos_upload on storage.objects;
create policy guest_photos_upload
  on storage.objects for insert to anon
  with check (bucket_id = 'guest-photos');

-- Again, no select/update/delete policy for anon on this bucket. Uploading is
-- a one-way slot: a guest can post a photograph in and can never read one out,
-- including the one they just sent.

-- ── Verify ──────────────────────────────────────────────────────────────────
-- select id, public from storage.buckets where id = 'guest-photos';   -- false
-- select polname, polcmd from pg_policies where tablename = 'guest_photos';
