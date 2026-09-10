#!/usr/bin/env bash
# Three consecutive full journeys (web + mobile) must each score 100/100, plus the
# coach-row measurement and the link review once — the owner's "3 test runs with
# 100% success" bar.   bash scripts/ui-release/tripleRun.sh <baseUrl> <outDir>
set -u
BASE=${1:-http://localhost:4180}; OUT=${2:-data/validation/audit/triple}; mkdir -p "$OUT"
fail=0
for i in 1 2 3; do
  node scripts/ui-release/playSimulation.mjs "$BASE" "$OUT/run-$i" > "$OUT/run-$i.log" 2>&1
  line=$(grep -E "^SCORE" "$OUT/run-$i.log" | tail -n 1); echo "run $i: ${line:-NO SCORE}"
  echo "$line" | grep -q "SCORE 100/100" || { fail=1; grep -E "FAIL" "$OUT/run-$i.log" | head -5; }
done
node scripts/ui-release/coachRowMeasure.mjs "$BASE" "$OUT" > "$OUT/coach-rows.log" 2>&1 && echo "coach rows: PASS" || { echo "coach rows: FAIL"; grep FAIL "$OUT/coach-rows.log" | head -5; fail=1; }
node scripts/ui-release/linkReview.mjs "$BASE" "$OUT" > "$OUT/link-review.log" 2>&1 && echo "link review: PASS" || { echo "link review: FAIL"; tail -n 6 "$OUT/link-review.log"; fail=1; }
[ $fail -eq 0 ] && echo "TRIPLE RUN: 3/3 at 100 · coach rows · link review — PASS" || echo "TRIPLE RUN: FAIL"
exit $fail
