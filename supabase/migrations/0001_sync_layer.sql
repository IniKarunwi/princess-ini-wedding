-- ============================================================================
--  RSVP sync layer — schema additions
--
--  Safe to run more than once: every statement is guarded.
--  Adds only columns; nothing existing is altered or dropped, so the live
--  website behaviour is untouched.
--
--  Run in: Supabase dashboard → SQL Editor → New query → Run
-- ============================================================================

-- ── Sync identity ───────────────────────────────────────────────────────────
-- Stable key derived from the guest's name, used only to match rows that have
-- neither an email nor a phone. Lets a name-only guest later gain contact
-- details without splitting into a second record.
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS sheet_key text;

-- Partial unique index: enforced only where a key exists, so the many rows
-- without one do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS rsvps_sheet_key_unique
  ON rsvps (sheet_key)
  WHERE sheet_key IS NOT NULL;

-- Matching lookups.
CREATE INDEX IF NOT EXISTS rsvps_email_idx ON rsvps (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS rsvps_phone_idx ON rsvps (phone)        WHERE phone IS NOT NULL;

-- ── Invitation planning ─────────────────────────────────────────────────────
-- approved_for / plus_one_approved_for hold WHICH part of the event the guest
-- is approved for; the *_status columns hold the decision itself. Both are
-- derived from the sheet's `main` and `plus` columns by the sync.
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS main_invite_status    text;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS approved_for          text;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS plus_one_approved_for text;

-- ── Messaging automation (Phase 3) ──────────────────────────────────────────
-- Owned by the future email/WhatsApp automation, NOT by the spreadsheet.
-- The sync refuses to write these unless the column is physically present in
-- the source sheet, so a sync can never clobber delivery state.
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS email_status        text;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS whatsapp_status     text;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS last_email_sent     timestamptz;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS last_whatsapp_sent  timestamptz;

-- Weekly automations will scan for guests still awaiting contact.
CREATE INDEX IF NOT EXISTS rsvps_email_status_idx    ON rsvps (email_status);
CREATE INDEX IF NOT EXISTS rsvps_whatsapp_status_idx ON rsvps (whatsapp_status);

-- ── Audit ───────────────────────────────────────────────────────────────────
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS synced_at timestamptz;

COMMENT ON COLUMN rsvps.sheet_key             IS 'Name-derived sync key; matches sheet rows lacking email and phone.';
COMMENT ON COLUMN rsvps.main_invite_status    IS 'APPROVED | REJECTED | PENDING — derived from sheet column "main".';
COMMENT ON COLUMN rsvps.approved_for          IS 'JOINING | RECEPTION | AFTERPARTY — tier from sheet column "main".';
COMMENT ON COLUMN rsvps.plus_one_approved_for IS 'JOINING | RECEPTION | AFTERPARTY — tier from sheet column "plus".';
COMMENT ON COLUMN rsvps.email_status          IS 'Owned by messaging automation. Never written by the spreadsheet sync.';
COMMENT ON COLUMN rsvps.whatsapp_status       IS 'Owned by messaging automation. Never written by the spreadsheet sync.';
