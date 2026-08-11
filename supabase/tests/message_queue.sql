-- ============================================================================
--  MESSAGE QUEUE TEST — writes nothing
--
--  Exercises the full lifecycle against the live schema inside a transaction
--  that rolls back: enqueue, dedupe, claim, send, fail, backoff, death,
--  reclaim, cancel, and the derived per-guest view. Also proves a brand-new
--  channel works with no schema change at all.
--
--  Run in: Supabase dashboard → SQL Editor → New query → Run
--  Expect: "ALL CASES PASSED" and zero rows left behind.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  failures text[] := ARRAY[]::text[];
  passes   integer := 0;
  guest    uuid;
  noaddr   uuid;
  m1       uuid;
  m2       uuid;
  m3       uuid;
  claimed  integer;
  st       message_status;
  nxt      timestamptz;
  n        integer;
  rec      record;
BEGIN
  -- A guest to send to, and one with no contact details at all.
  INSERT INTO rsvps (full_name, email, phone, sheet_key)
  VALUES ('TEST Queue Guest', 'test.queue@example.invalid', '+2348090001111', 'test-queue-guest')
  RETURNING id INTO guest;

  INSERT INTO rsvps (full_name, sheet_key)
  VALUES ('TEST No Address', 'test-no-address')
  RETURNING id INTO noaddr;

  -- ══ ENQUEUE ════════════════════════════════════════════════════════════

  -- 1. Address resolved from the guest record.
  BEGIN
    m1 := enqueue_message(guest, 'email', 'invitation');
    SELECT recipient INTO rec FROM message_queue WHERE id = m1;
    IF (SELECT recipient FROM message_queue WHERE id = m1) = 'test.queue@example.invalid'
      THEN passes := passes + 1;
      ELSE failures := failures || 'enqueue: email address not resolved from rsvps'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('enqueue: resolve email — ' || SQLERRM);
  END;

  -- 2. WhatsApp resolves the phone instead — same call, different channel.
  BEGIN
    m2 := enqueue_message(guest, 'whatsapp', 'invitation');
    IF (SELECT recipient FROM message_queue WHERE id = m2) = '+2348090001111'
      THEN passes := passes + 1;
      ELSE failures := failures || 'enqueue: whatsapp did not resolve phone'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('enqueue: resolve phone — ' || SQLERRM);
  END;

  -- 3. Unknown channel is refused.
  BEGIN
    PERFORM enqueue_message(guest, 'carrier-pigeon', 'invitation');
    failures := failures || 'enqueue: unknown channel was ACCEPTED'::text;
  EXCEPTION WHEN OTHERS THEN
    passes := passes + 1;
  END;

  -- 4. A guest with no address for the channel is refused.
  BEGIN
    PERFORM enqueue_message(noaddr, 'email', 'invitation');
    failures := failures || 'enqueue: guest with no email was ACCEPTED'::text;
  EXCEPTION WHEN OTHERS THEN
    passes := passes + 1;
  END;

  -- 5. Dedupe: the same key twice yields one row and the same id.
  BEGIN
    m1 := enqueue_message(guest, 'email', 'reminder', NULL, '{}'::jsonb,
                          now(), 100::smallint, 'test-dedupe-key');
    m2 := enqueue_message(guest, 'email', 'reminder', NULL, '{}'::jsonb,
                          now(), 100::smallint, 'test-dedupe-key');
    SELECT count(*) INTO n FROM message_queue WHERE dedupe_key = 'test-dedupe-key';
    IF n = 1 AND m1 = m2 THEN passes := passes + 1;
    ELSE failures := failures || format('dedupe: %s rows, ids %s / %s', n, m1, m2);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('dedupe — ' || SQLERRM);
  END;

  -- 6. Payload carries channel-specific data without new columns.
  BEGIN
    PERFORM enqueue_message(guest, 'email', 'invitation', NULL,
      '{"subject":"You are invited","cta_url":"https://example.invalid"}'::jsonb,
      now(), 50::smallint, 'test-payload-key');
    IF (SELECT payload->>'subject' FROM message_queue WHERE dedupe_key = 'test-payload-key')
       = 'You are invited'
      THEN passes := passes + 1;
      ELSE failures := failures || 'payload: jsonb not stored'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('payload — ' || SQLERRM);
  END;

  -- ══ CLAIM ══════════════════════════════════════════════════════════════

  -- 7. Claiming moves rows to 'sending' and stamps the lease.
  BEGIN
    SELECT count(*) INTO claimed FROM claim_messages('test-worker-1', 10);
    IF claimed > 0
       AND NOT EXISTS (SELECT 1 FROM message_queue
                        WHERE status = 'sending' AND (locked_by IS NULL OR attempts < 1))
      THEN passes := passes + 1;
      ELSE failures := failures || format('claim: %s claimed, lease not stamped', claimed);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('claim — ' || SQLERRM);
  END;

  -- 8. A second worker claims nothing — the first holds them all.
  BEGIN
    SELECT count(*) INTO n FROM claim_messages('test-worker-2', 10);
    IF n = 0 THEN passes := passes + 1;
    ELSE failures := failures || format('claim: worker 2 stole %s already-claimed rows', n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('claim: second worker — ' || SQLERRM);
  END;

  -- ══ OUTCOMES ═══════════════════════════════════════════════════════════

  -- Specifically an email, so the per-channel assertions below are meaningful.
  SELECT id INTO m1 FROM message_queue
   WHERE status = 'sending' AND channel = 'email' LIMIT 1;

  -- 9. Success clears the lease and records the provider id.
  BEGIN
    PERFORM mark_message_sent(m1, 'provider-abc-123', '{"ok":true}'::jsonb);
    IF (SELECT status = 'sent' AND sent_at IS NOT NULL AND locked_by IS NULL
               AND provider_message_id = 'provider-abc-123'
          FROM message_queue WHERE id = m1)
      THEN passes := passes + 1;
      ELSE failures := failures || 'mark_sent: state not recorded correctly'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('mark_sent — ' || SQLERRM);
  END;

  -- 10. Failure schedules a retry with backoff rather than dying immediately.
  BEGIN
    SELECT id INTO m2 FROM message_queue WHERE status = 'sending' LIMIT 1;
    st := mark_message_failed(m2, 'smtp timeout');
    SELECT next_attempt_at INTO nxt FROM message_queue WHERE id = m2;
    IF st = 'failed' AND nxt > now() THEN passes := passes + 1;
    ELSE failures := failures || format('mark_failed: status %s, next_attempt %s', st, nxt);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('mark_failed — ' || SQLERRM);
  END;

  -- 11. A backed-off message is not claimable yet.
  BEGIN
    SELECT count(*) INTO n FROM claim_messages('test-worker-3', 10, 'email');
    IF NOT EXISTS (SELECT 1 FROM message_queue WHERE id = m2 AND status = 'sending')
      THEN passes := passes + 1;
      ELSE failures := failures || 'backoff: a message in backoff was claimed early'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('backoff — ' || SQLERRM);
  END;

  -- 12. Exhausting max_attempts marks it dead, not endlessly retried.
  BEGIN
    UPDATE message_queue SET attempts = max_attempts WHERE id = m2;
    st := mark_message_failed(m2, 'permanent bounce');
    IF st = 'dead' AND (SELECT next_attempt_at IS NULL FROM message_queue WHERE id = m2)
      THEN passes := passes + 1;
      ELSE failures := failures || format('death: status %s after exhausting attempts', st);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('death — ' || SQLERRM);
  END;

  -- ══ RECOVERY ═══════════════════════════════════════════════════════════

  -- 13. A stranded lease is reclaimed without consuming an attempt.
  BEGIN
    -- Its own message: reusing the one marked sent above would rewrite
    -- history the later assertions depend on.
    m3 := enqueue_message(guest, 'email', 'stalled', NULL, '{}'::jsonb,
                          now(), 100::smallint, 'test-stall-key');
    UPDATE message_queue
       SET status = 'sending', locked_at = now() - interval '1 hour',
           locked_by = 'crashed-worker', attempts = 2
     WHERE id = m3;
    n := reclaim_stalled_messages(interval '15 minutes');
    IF n >= 1 AND (SELECT status = 'queued' AND attempts = 1 FROM message_queue WHERE id = m3)
      THEN passes := passes + 1;
      ELSE failures := failures || format('reclaim: %s reclaimed, state wrong', n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('reclaim — ' || SQLERRM);
  END;

  -- 14. Cancelling withdraws undelivered messages but never rewrites history.
  BEGIN
    n := cancel_messages_for_rsvp(guest, 'guest declined');
    IF NOT EXISTS (SELECT 1 FROM message_queue
                    WHERE rsvp_id = guest AND status IN ('queued', 'failed'))
       AND EXISTS (SELECT 1 FROM message_queue WHERE rsvp_id = guest AND status = 'sent')
      THEN passes := passes + 1;
      ELSE failures := failures || 'cancel: pending not withdrawn, or sent history altered'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('cancel — ' || SQLERRM);
  END;

  -- ══ A NEW CHANNEL, WITH NO SCHEMA CHANGE ═══════════════════════════════

  -- 15. Add SMS as pure data and send through it immediately.
  BEGIN
    INSERT INTO message_channels (channel, display_name, address_field)
    VALUES ('sms', 'SMS', 'phone') ON CONFLICT DO NOTHING;

    m1 := enqueue_message(guest, 'sms', 'reminder', NULL,
                          '{"body":"See you Saturday"}'::jsonb,
                          now(), 100::smallint, 'test-sms-key');
    IF (SELECT recipient = '+2348090001111' AND channel = 'sms'
          FROM message_queue WHERE id = m1)
      THEN passes := passes + 1;
      ELSE failures := failures || 'new channel: sms enqueue did not resolve correctly'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('new channel: sms — ' || SQLERRM);
  END;

  -- 16. And a push channel addressed by a field rsvps does not even have,
  --     supplying the recipient explicitly.
  BEGIN
    INSERT INTO message_channels (channel, display_name, address_field)
    VALUES ('push', 'Push Notification', 'push_token') ON CONFLICT DO NOTHING;

    m1 := enqueue_message(guest, 'push', 'reminder', 'device-token-xyz',
                          '{"title":"Tomorrow!"}'::jsonb,
                          now(), 100::smallint, 'test-push-key');
    IF (SELECT recipient = 'device-token-xyz' FROM message_queue WHERE id = m1)
      THEN passes := passes + 1;
      ELSE failures := failures || 'new channel: push did not accept an explicit recipient'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('new channel: push — ' || SQLERRM);
  END;

  -- ══ DERIVED VIEW ═══════════════════════════════════════════════════════

  -- 17. The view reports the guest's per-channel state, new channels included.
  BEGIN
    SELECT count(*) INTO n FROM guest_delivery_status
     WHERE rsvp_id = guest AND total_messages > 0;
    IF n >= 3 THEN passes := passes + 1;   -- email, whatsapp, sms at least
    ELSE failures := failures || format('view: only %s channels reported for the guest', n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('view — ' || SQLERRM);
  END;

  -- 18. Sent counts are visible per channel.
  BEGIN
    IF EXISTS (SELECT 1 FROM guest_delivery_status
                WHERE rsvp_id = guest AND channel = 'email' AND sent_count >= 1)
      THEN passes := passes + 1;
      ELSE failures := failures || 'view: email sent_count did not reflect the sent message'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failures := failures || ('view: sent_count — ' || SQLERRM);
  END;

  -- ══ INTEGRITY ══════════════════════════════════════════════════════════

  -- 19. A blank recipient is refused.
  BEGIN
    INSERT INTO message_queue (rsvp_id, channel, recipient, template_key)
    VALUES (guest, 'email', '   ', 'invitation');
    failures := failures || 'integrity: blank recipient was ACCEPTED'::text;
  EXCEPTION WHEN OTHERS THEN
    passes := passes + 1;
  END;

  -- 20. An unknown channel cannot be inserted directly either.
  BEGIN
    INSERT INTO message_queue (rsvp_id, channel, recipient, template_key)
    VALUES (guest, 'telepathy', 'x', 'invitation');
    failures := failures || 'integrity: unknown channel accepted by direct insert'::text;
  EXCEPTION WHEN OTHERS THEN
    passes := passes + 1;
  END;

  -- ══ REPORT ═════════════════════════════════════════════════════════════
  IF array_length(failures, 1) > 0 THEN
    RAISE EXCEPTION E'MESSAGE QUEUE TEST FAILED — % of % cases\n  %',
      array_length(failures, 1), passes + array_length(failures, 1),
      array_to_string(failures, E'\n  ');
  END IF;

  RAISE NOTICE 'ALL CASES PASSED (% checks). Nothing was written.', passes;
END $$;

ROLLBACK;

-- Confirm nothing survived — both must be 0.
SELECT
  (SELECT count(*) FROM rsvps WHERE full_name LIKE 'TEST %')          AS leftover_guests,
  (SELECT count(*) FROM message_channels WHERE channel IN ('sms','push')) AS leftover_channels;
