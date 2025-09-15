#!/usr/bin/env bash
# scripts/soak-test.sh
# Soak test 1 jam: 80% fixed query + 20% random queries
# Requires: autocannon, shuf (coreutils)

set -euo pipefail

BASE_URL=${1:-"http://localhost:3000"}   # override: ./soak-test.sh https://api.example.com
DURATION=${DURATION:-3600}                # total durasi detik (default 3600 = 1 jam)
FIXED_QUERY=${FIXED_QUERY:-"iphone"}

RANDOM_SET=("macbook" "ps5" "samsung" "nike" "chair" "lamp")

echo "🚀 Soak test ke $BASE_URL"
echo "   Duration         : ${DURATION}s"
echo "   Fixed query load : 80%  (~20 connections)"
echo "   Random load      : 20%  (~3 + 2 connections in 60s slices)"
echo

LOG_DIR=${LOG_DIR:-"."}
FIXED_LOG="$LOG_DIR/soak-fixed.log"
RAND1_LOG="$LOG_DIR/soak-random1.log"
RAND2_LOG="$LOG_DIR/soak-random2.log"

# cleanup on exit/ctrl+c
pids=()
cleanup() {
  echo -e "\n🧹 stopping background jobs..."
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "✅ done."
}
trap cleanup EXIT INT TERM

SECONDS=0
END=$((SECONDS + DURATION))

# ---- Terminal A (80% load): fixed query for full duration ----
autocannon -d "$DURATION" -c 20 \
  "$BASE_URL/naver?query=$FIXED_QUERY" > "$FIXED_LOG" 2>&1 &
pids+=($!)

# helper: pick random element safely (works without shuf)
pick_q() {
  local i=$((RANDOM % ${#RANDOM_SET[@]}))
  echo "${RANDOM_SET[$i]}"
}

# ---- Terminal B (10% load): random query in 60s slices until END ----
(
  while [ "$SECONDS" -lt "$END" ]; do
    q=$(pick_q)
    remain=$(( END - SECONDS ))
    slice=$(( remain < 60 ? remain : 60 ))   # jangan lewat END
    [ "$slice" -le 0 ] && break
    autocannon -d "$slice" -c 3 \
      "$BASE_URL/naver?query=$q" >> "$RAND1_LOG" 2>&1
  done
) &
pids+=($!)

# ---- Terminal C (10% load): random query in 60s slices until END ----
(
  while [ "$SECONDS" -lt "$END" ]; do
    q=$(pick_q)
    remain=$(( END - SECONDS ))
    slice=$(( remain < 60 ? remain : 60 ))
    [ "$slice" -le 0 ] && break
    autocannon -d "$slice" -c 2 \
      "$BASE_URL/naver?query=$q" >> "$RAND2_LOG" 2>&1
  done
) &
pids+=($!)

# wait for all
wait

echo
echo "📦 Logs:"
echo "  - $FIXED_LOG"
echo "  - $RAND1_LOG"
echo "  - $RAND2_LOG"
echo "💡 contoh ringkas hasil (tail 5 baris/log):"
tail -n 5 "$FIXED_LOG" || true
tail -n 5 "$RAND1_LOG" || true
tail -n 5 "$RAND2_LOG" || true
