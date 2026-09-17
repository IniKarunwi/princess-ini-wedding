#!/usr/bin/env bash
# =============================================================================
#  Case M — two admins, one remaining seat.
#
#  The other cases run sequentially in one session, where nothing can race.
#  This one cannot: the bug it looks for only appears when two connections read
#  the same total before either has written. So it launches real concurrent
#  psql processes and counts how many the database let through.
#
#    supabase/tests/concurrency.sh
#
#  The invariant: successes == party_size, EXACTLY. Not fewer (a lost check-in
#  is a guest left at the door) and never more (an overbooked event).
# =============================================================================
set -u

PSQL="${PSQL:-psql}"
HOST="${PGHOST:-/var/tmp/pgsock}"
PORT="${PGPORT:-5433}"
USER="${PGUSER:-postgres}"
DB="${PGDATABASE:-wd}"
q() { $PSQL -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -tAq "$@"; }

PARTY_SIZE=5      # seats available
RACERS=16         # concurrent attempts of 1 seat each

echo
echo "Case M — $RACERS concurrent check-ins against $PARTY_SIZE seats"
echo

q -c "DELETE FROM checkin_events WHERE rsvp_id IN (SELECT id FROM rsvps WHERE email = 'race@test.invalid');
      DELETE FROM guest_passes   WHERE rsvp_id IN (SELECT id FROM rsvps WHERE email = 'race@test.invalid');
      DELETE FROM rsvps WHERE email = 'race@test.invalid';" >/dev/null

RSVP=$(q -c "INSERT INTO rsvps (full_name, email, phone, attending, main_invite_status, approved_for, party_size)
             VALUES ('Race Party','race@test.invalid','1',true,'APPROVED','JOINING',$PARTY_SIZE)
             RETURNING id;")
q -c "INSERT INTO guest_passes (rsvp_id, token_hash) VALUES ('$RSVP','race-hash');" >/dev/null

OUT=$(mktemp -d)

# Every racer waits on the same file, so they hit the function together rather
# than in a comfortable stagger that would hide the bug.
GO="$OUT/go"
for i in $(seq 1 "$RACERS"); do
  (
    while [ ! -f "$GO" ]; do :; done
    q -c "SELECT checkin_by_token('race-hash','JOINING',1,'racer-$i')->>'code';" > "$OUT/$i"
  ) &
done

sleep 0.4
touch "$GO"
wait

ok=$(cat "$OUT"/* 2>/dev/null | grep -c '^CHECKED_IN$')
full=$(cat "$OUT"/* 2>/dev/null | grep -c '^ALREADY_FULL$')
other=$(cat "$OUT"/* 2>/dev/null | grep -vcE '^(CHECKED_IN|ALREADY_FULL)$')
total=$(q -c "SELECT COALESCE(SUM(delta),0) FROM checkin_events WHERE rsvp_id='$RSVP' AND event='JOINING';")

echo "  succeeded      : $ok"
echo "  already full   : $full"
echo "  other outcomes : $other"
echo "  ledger total   : $total   (party_size $PARTY_SIZE)"
echo

rc=0
if [ "$total" -gt "$PARTY_SIZE" ]; then
  echo "  FAIL  OVERBOOKED — $total people admitted to $PARTY_SIZE seats"; rc=1
elif [ "$total" -lt "$PARTY_SIZE" ]; then
  echo "  FAIL  UNDER-COUNTED — only $total of $PARTY_SIZE seats used"; rc=1
elif [ "$ok" -ne "$PARTY_SIZE" ]; then
  echo "  FAIL  $ok calls reported success but the ledger says $total"; rc=1
else
  echo "  PASS  exactly $PARTY_SIZE admitted, $full turned away, none lost"
fi

q -c "DELETE FROM checkin_events WHERE rsvp_id='$RSVP';
      DELETE FROM guest_passes WHERE rsvp_id='$RSVP';
      DELETE FROM rsvps WHERE id='$RSVP';" >/dev/null
rm -rf "$OUT"
exit $rc
