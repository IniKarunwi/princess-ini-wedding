-- ============================================================================
--  message_queue — the single source of truth for outbound messaging
--
--  Nothing sends a message directly. Every email, WhatsApp, and future SMS or
--  push notification is ENQUEUED here; a worker claims rows, attempts
--  delivery, and records the outcome. Delivery state, retry history and the
--  full audit trail live in one table rather than being smeared across
--  per-channel columns on rsvps.
--
--  ── Adding a channel later ─────────────────────────────────────────────────
--  channel is a foreign key to a LOOKUP TABLE, not a native enum. Adding SMS
--  or push is one INSERT into message_channels — no ALTER TYPE, no migration,
--  no downtime. A native enum would have made every new channel a schema
--  change, which is exactly what this design is meant to avoid.
--
--  Channel-specific data (subject lines, template ids, media urls, device
--  tokens) lives in the payload jsonb, so a new channel needs no new columns.
--
--  status IS a native enum: the delivery lifecycle is fixed and benefits from
--  the type safety and compact index representation.
--
--  Safe to run more than once.
--  Run in: Supabase dashboard → SQL Editor → New query → Run
--  Requires: 0001-0005
-- ============================================================================

-- ── Delivery lifecycle ──────────────────────────────────────────────────────
--   queued    waiting to be claimed
--   sending   claimed by a worker, attempt in flight
--   sent      accepted by the provider
--   failed    attempt failed, will be retried
--   dead      retries exhausted; needs a human
--   cancelled withdrawn before sending (guest declined, event changed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE message_status AS ENUM
      ('queued', 'sending', 'sent', 'failed', 'dead', 'cancelled');
  END IF;
END $$;

-- ── Channels: data, not schema ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_channels (
  channel      text PRIMARY KEY,
  display_name text    NOT NULL,
  -- Which rsvps column holds the address for this channel. Lets the enqueue
  -- helper resolve a recipient generically instead of branching per channel.
  address_field text   NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO message_channels (channel, display_name, address_field, enabled) VALUES
  ('email',    'Email',    'email', true),
  ('whatsapp', 'WhatsApp', 'phone', true)
ON CONFLICT (channel) DO NOTHING;

-- Adding SMS or push later is exactly this, and nothing else:
--   INSERT INTO message_channels (channel, display_name, address_field)
--   VALUES ('sms', 'SMS', 'phone'), ('push', 'Push Notification', 'push_token');

-- ── The queue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and what -------------------------------------------------------------
  rsvp_id             uuid REFERENCES rsvps(id) ON DELETE CASCADE,
  channel             text NOT NULL REFERENCES message_channels(channel),
  -- The resolved address at enqueue time: an email, an E.164 number, a device
  -- token. Snapshotted deliberately — if a guest later changes their email,
  -- history must still show where the message actually went.
  recipient           text NOT NULL,

  -- Content ------------------------------------------------------------------
  template_key        text NOT NULL,
  -- Template variables plus anything channel-specific. This is what makes a
  -- new channel need no new columns.
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Scheduling ---------------------------------------------------------------
  scheduled_for       timestamptz NOT NULL DEFAULT now(),
  priority            smallint    NOT NULL DEFAULT 100,   -- lower runs first

  -- Delivery state -----------------------------------------------------------
  status              message_status NOT NULL DEFAULT 'queued',
  attempts            integer     NOT NULL DEFAULT 0,
  max_attempts        integer     NOT NULL DEFAULT 5,
  next_attempt_at     timestamptz,

  -- Worker lease: claimed rows carry who holds them and since when, so a
  -- crashed worker's rows can be reclaimed rather than stranded in 'sending'.
  locked_at           timestamptz,
  locked_by           text,

  -- Outcome ------------------------------------------------------------------
  sent_at             timestamptz,
  failed_at           timestamptz,
  last_error          text,
  provider_message_id text,
  provider_response   jsonb,

  -- Idempotency: a natural key for "this exact message to this guest".
  -- Enqueuing twice with the same key is a no-op, so a re-run of a weekly
  -- automation cannot double-send.
  dedupe_key          text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT message_queue_attempts_sane
    CHECK (attempts >= 0 AND max_attempts >= 1 AND attempts <= max_attempts + 1),
  CONSTRAINT message_queue_recipient_present
    CHECK (nullif(btrim(recipient), '') IS NOT NULL)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

-- The claim query: ready work, best-priority first. Partial, so it stays small
-- however much history accumulates.
CREATE INDEX IF NOT EXISTS message_queue_ready_idx
  ON message_queue (priority, scheduled_for, created_at)
  WHERE status IN ('queued', 'failed');

-- Reclaiming leases from crashed workers.
CREATE INDEX IF NOT EXISTS message_queue_locked_idx
  ON message_queue (locked_at)
  WHERE status = 'sending';

-- Per-guest history, and the delivery-status view below.
CREATE INDEX IF NOT EXISTS message_queue_rsvp_idx
  ON message_queue (rsvp_id, channel, created_at DESC);

-- Operational dashboards: "how many failed today", "what is dead".
CREATE INDEX IF NOT EXISTS message_queue_status_idx
  ON message_queue (status, channel, created_at DESC);

-- Idempotent enqueue.
CREATE UNIQUE INDEX IF NOT EXISTS message_queue_dedupe_idx
  ON message_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Provider reconciliation (delivery receipts, webhooks).
CREATE INDEX IF NOT EXISTS message_queue_provider_idx
  ON message_queue (channel, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_message_queue()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_message_queue ON message_queue;
CREATE TRIGGER trg_touch_message_queue
  BEFORE UPDATE ON message_queue
  FOR EACH ROW EXECUTE FUNCTION touch_message_queue();

-- ============================================================================
--  API — the only supported way to interact with the queue
-- ============================================================================

-- ── Enqueue ─────────────────────────────────────────────────────────────────
-- Idempotent when a dedupe_key is supplied: the second call returns the
-- existing id instead of creating a duplicate.
CREATE OR REPLACE FUNCTION enqueue_message(
  p_rsvp_id       uuid,
  p_channel       text,
  p_template_key  text,
  p_recipient     text    DEFAULT NULL,   -- resolved from rsvps when omitted
  p_payload       jsonb   DEFAULT '{}'::jsonb,
  p_scheduled_for timestamptz DEFAULT now(),
  p_priority      smallint DEFAULT 100,
  p_dedupe_key    text    DEFAULT NULL,
  p_max_attempts  integer DEFAULT 5
) RETURNS uuid AS $$
DECLARE
  v_recipient text := nullif(btrim(p_recipient), '');
  v_field     text;
  v_id        uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM message_channels
                  WHERE channel = p_channel AND enabled) THEN
    RAISE EXCEPTION 'Unknown or disabled channel: %', p_channel
      USING HINT = 'Add it with INSERT INTO message_channels (…).';
  END IF;

  -- Resolve the address from the guest record when not given explicitly.
  IF v_recipient IS NULL THEN
    SELECT address_field INTO v_field FROM message_channels WHERE channel = p_channel;
    EXECUTE format('SELECT nullif(btrim(%I::text), '''') FROM rsvps WHERE id = $1', v_field)
      INTO v_recipient USING p_rsvp_id;
  END IF;

  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'No % address for rsvp %', p_channel, p_rsvp_id
      USING HINT = 'Pass p_recipient explicitly, or fill the address on the guest.';
  END IF;

  INSERT INTO message_queue (
    rsvp_id, channel, recipient, template_key, payload,
    scheduled_for, priority, dedupe_key, max_attempts, next_attempt_at
  ) VALUES (
    p_rsvp_id, p_channel, v_recipient, p_template_key, coalesce(p_payload, '{}'::jsonb),
    p_scheduled_for, p_priority, p_dedupe_key, p_max_attempts, p_scheduled_for
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  -- Conflict: return the message that already exists.
  IF v_id IS NULL AND p_dedupe_key IS NOT NULL THEN
    SELECT id INTO v_id FROM message_queue WHERE dedupe_key = p_dedupe_key;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ── Claim ───────────────────────────────────────────────────────────────────
-- FOR UPDATE SKIP LOCKED is what makes this safe to run from several workers
-- at once: each claims a disjoint set without blocking the others.
CREATE OR REPLACE FUNCTION claim_messages(
  p_worker_id  text,
  p_batch_size integer DEFAULT 50,
  p_channel    text    DEFAULT NULL      -- NULL = any channel
) RETURNS SETOF message_queue AS $$
BEGIN
  RETURN QUERY
  WITH ready AS (
    SELECT q.id
      FROM message_queue q
     WHERE q.status IN ('queued', 'failed')
       AND q.scheduled_for <= now()
       AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= now())
       AND q.attempts < q.max_attempts
       AND (p_channel IS NULL OR q.channel = p_channel)
     ORDER BY q.priority, q.scheduled_for, q.created_at
     LIMIT p_batch_size
     FOR UPDATE SKIP LOCKED
  )
  UPDATE message_queue m
     SET status    = 'sending',
         locked_at = now(),
         locked_by = p_worker_id,
         attempts  = m.attempts + 1
    FROM ready
   WHERE m.id = ready.id
  RETURNING m.*;
END;
$$ LANGUAGE plpgsql;

-- ── Record outcomes ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_message_sent(
  p_id                  uuid,
  p_provider_message_id text  DEFAULT NULL,
  p_provider_response   jsonb DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE message_queue
     SET status = 'sent', sent_at = now(),
         locked_at = NULL, locked_by = NULL,
         last_error = NULL,
         provider_message_id = p_provider_message_id,
         provider_response   = p_provider_response
   WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Exponential backoff, capped at an hour: 1m, 2m, 4m, 8m, 16m …
-- A message that exhausts max_attempts becomes 'dead' rather than retrying
-- forever, so a permanently bad address surfaces instead of churning.
CREATE OR REPLACE FUNCTION mark_message_failed(
  p_id                uuid,
  p_error             text,
  p_provider_response jsonb DEFAULT NULL
) RETURNS message_status AS $$
DECLARE
  v_attempts     integer;
  v_max          integer;
  v_next_status  message_status;
  v_backoff      interval;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max
    FROM message_queue WHERE id = p_id;

  IF v_attempts IS NULL THEN
    RAISE EXCEPTION 'No such message: %', p_id;
  END IF;

  IF v_attempts >= v_max THEN
    v_next_status := 'dead';
    v_backoff     := NULL;
  ELSE
    v_next_status := 'failed';
    v_backoff     := least(interval '1 minute' * power(2, v_attempts - 1),
                           interval '1 hour');
  END IF;

  UPDATE message_queue
     SET status          = v_next_status,
         failed_at       = now(),
         last_error      = p_error,
         provider_response = coalesce(p_provider_response, provider_response),
         next_attempt_at = CASE WHEN v_backoff IS NULL THEN NULL
                                ELSE now() + v_backoff END,
         locked_at = NULL, locked_by = NULL
   WHERE id = p_id;

  RETURN v_next_status;
END;
$$ LANGUAGE plpgsql;

-- ── Reclaim stranded leases ─────────────────────────────────────────────────
-- A worker that dies mid-send leaves rows in 'sending' forever. Run this on a
-- schedule; it returns them to the pool without consuming another attempt.
CREATE OR REPLACE FUNCTION reclaim_stalled_messages(
  p_older_than interval DEFAULT interval '15 minutes'
) RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  WITH reclaimed AS (
    UPDATE message_queue
       SET status = 'queued', locked_at = NULL, locked_by = NULL,
           attempts = greatest(attempts - 1, 0),
           last_error = coalesce(last_error, 'reclaimed: worker lease expired')
     WHERE status = 'sending'
       AND locked_at < now() - p_older_than
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM reclaimed;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ── Cancel ──────────────────────────────────────────────────────────────────
-- Withdraw undelivered messages, e.g. when a guest declines. Sent messages are
-- history and are never altered.
CREATE OR REPLACE FUNCTION cancel_messages_for_rsvp(
  p_rsvp_id uuid,
  p_reason  text DEFAULT NULL
) RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  WITH cancelled AS (
    UPDATE message_queue
       SET status = 'cancelled',
           last_error = coalesce(p_reason, 'cancelled'),
           locked_at = NULL, locked_by = NULL
     WHERE rsvp_id = p_rsvp_id
       AND status IN ('queued', 'failed')
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM cancelled;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
--  Per-guest delivery status — DERIVED, never stored
-- ============================================================================
-- This replaces rsvps.email_status / whatsapp_status / last_email_sent /
-- last_whatsapp_sent. Those columns duplicated state the queue already knows
-- and could drift from it; a view cannot.
--
-- Works for any channel, including ones added after this migration.
CREATE OR REPLACE VIEW guest_delivery_status AS
SELECT
  r.id                                        AS rsvp_id,
  r.full_name,
  c.channel,
  count(q.id) FILTER (WHERE q.id IS NOT NULL)       AS total_messages,
  count(q.id) FILTER (WHERE q.status = 'sent')      AS sent_count,
  count(q.id) FILTER (WHERE q.status IN ('queued', 'failed', 'sending')) AS pending_count,
  count(q.id) FILTER (WHERE q.status = 'dead')      AS dead_count,
  max(q.sent_at)                                    AS last_sent_at,
  (array_agg(q.status ORDER BY q.created_at DESC)
     FILTER (WHERE q.id IS NOT NULL))[1]            AS latest_status,
  (array_agg(q.last_error ORDER BY q.created_at DESC)
     FILTER (WHERE q.status IN ('failed', 'dead')))[1] AS latest_error
FROM rsvps r
CROSS JOIN message_channels c
LEFT JOIN message_queue q ON q.rsvp_id = r.id AND q.channel = c.channel
GROUP BY r.id, r.full_name, c.channel;

COMMENT ON VIEW guest_delivery_status IS
  'Per-guest, per-channel delivery state derived from message_queue. Replaces '
  'the former rsvps.email_status / whatsapp_status columns, which could drift.';

-- ============================================================================
--  Retire the per-channel columns on rsvps
-- ============================================================================
-- Dropped only when they hold no data, so this can never silently discard
-- something. If any are populated the migration keeps them and says so.
DO $$
DECLARE
  col       text;
  populated integer;
  dropped   text[] := ARRAY[]::text[];
  kept      text[] := ARRAY[]::text[];
BEGIN
  FOREACH col IN ARRAY ARRAY['email_status', 'whatsapp_status',
                             'last_email_sent', 'last_whatsapp_sent'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'rsvps' AND column_name = col) THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM rsvps WHERE %I IS NOT NULL', col)
      INTO populated;

    IF populated = 0 THEN
      EXECUTE format('ALTER TABLE rsvps DROP COLUMN %I', col);
      dropped := dropped || col;
    ELSE
      kept := kept || format('%s (%s rows)', col, populated);
    END IF;
  END LOOP;

  IF array_length(dropped, 1) > 0 THEN
    RAISE NOTICE 'Dropped from rsvps (message_queue owns this now): %',
      array_to_string(dropped, ', ');
  END IF;
  IF array_length(kept, 1) > 0 THEN
    RAISE NOTICE 'KEPT — these hold data, migrate it into message_queue then '
                 'drop by hand: %', array_to_string(kept, ', ');
  END IF;
END $$;

-- ============================================================================
--  Security
-- ============================================================================
-- The queue holds addresses and message bodies. RLS on with no policies means
-- anon and authenticated see nothing; only the service_role key reaches it.
ALTER TABLE message_queue    ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_channels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE message_queue IS
  'Single source of truth for outbound messaging: delivery, retries, history. '
  'Nothing sends directly — producers call enqueue_message(), workers call '
  'claim_messages() then mark_message_sent() / mark_message_failed().';
COMMENT ON TABLE message_channels IS
  'Open set of delivery channels. Adding SMS or push is an INSERT here, not a '
  'schema change.';
COMMENT ON COLUMN message_queue.payload IS
  'Template variables and channel-specific fields. New channels need no new '
  'columns.';
COMMENT ON COLUMN message_queue.recipient IS
  'Address snapshotted at enqueue time, so history shows where a message '
  'actually went even if the guest record changes later.';
COMMENT ON COLUMN message_queue.dedupe_key IS
  'Natural key for "this message to this guest". Enqueuing twice is a no-op, '
  'so re-running a weekly automation cannot double-send.';

-- ============================================================================
--  VERIFY
-- ============================================================================
-- SELECT channel, display_name, enabled FROM message_channels;
-- SELECT status, count(*) FROM message_queue GROUP BY status;
-- SELECT * FROM guest_delivery_status WHERE total_messages > 0 LIMIT 20;
