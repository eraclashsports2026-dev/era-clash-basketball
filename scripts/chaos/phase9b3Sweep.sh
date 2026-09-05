#!/usr/bin/env bash
# Phase 9B.3 final gate sweep — serial, one log. Heavy gates never overlap.
#   bash scripts/chaos/phase9b3Sweep.sh [deployedOrigin]
# Frozen evidence directories a gate may rewrite are restored from git after.
set -u
cd "$(git rev-parse --show-toplevel)"
LOG=data/validation/9b3/final-gate-sweep.log
DEPLOYED="${1:-}"
SKIP_UNIT="${SKIP_UNIT:-0}"     # SKIP_UNIT=1: the unit suite already passed at this head; append a part-2 section
TEE=tee; [ "$SKIP_UNIT" = "1" ] && TEE="tee -a"
HARNESS=http://localhost:4180
{
  if [ "$SKIP_UNIT" = "1" ]; then echo "=== PHASE 9B.3 FINAL SWEEP PART 2 $(date -u +%FT%TZ) @ $(git rev-parse --short HEAD) (unit suite: see part 1) ===";
  else echo "=== PHASE 9B.3 FINAL SWEEP $(date -u +%FT%TZ) @ $(git rev-parse --short HEAD) ===";
  echo "--- unit ---";            npx vitest run 2>&1 | grep -E 'Test Files|Tests |FAIL|✗|failed' | head -20; fi
  echo "--- build ---";           npm run build 2>&1 | tail -2
  echo "--- e2e ---";             npx playwright test 2>&1 | grep -E 'passed|failed|flaky|skipped|Error' | tail -6
  echo "--- repository ui gates ---"
  for g in ui:time-arena-qa ui:result-dock-qa ui:live-intel-qa ui:coach-chaos-qa ui:player-card-theme-qa ui:synchronized-chaos-qa ui:era-membership-qa ui:navigation-qa ui:membership-routing-qa ui:activation-telemetry-qa ui:play-lobby-contracts ui:night-court-contracts ui:play-lobby-polish-qa; do
    if npm run -s "$g" >/dev/null 2>&1; then printf '%-34s PASS\n' "$g"; else printf '%-34s FAIL\n' "$g"; fi
  done
  echo "--- account gates (9B.1 / 9B.2, local harness) ---"
  export ACCOUNT_QA_BASE="$HARNESS"
  for g in account:guest-claim-qa account:cloud-save-qa account:my-eraclash-qa account:saved-rosters-qa account:run-it-back-qa; do
    out=$(npm run -s "$g" 2>&1); code=$?
    line=$(echo "$out" | grep -E 'checks passed|passed|FAIL' | tail -1)
    printf '%-34s %s %s\n' "$g" "$([ $code -eq 0 ] && echo PASS || echo FAIL)" "$line"
  done
  echo "--- 9B.3 gates (harness $HARNESS) ---"
  for g in guided-flow-qa state-machine-qa era-reveal-qa coach-flow-qa result-flow-qa accessibility-qa performance-qa contact-sheets; do
    if npm run -s "chaos:$g" -- "$HARNESS" >/dev/null 2>&1; then printf '%-34s PASS\n' "chaos:$g"; else printf '%-34s FAIL\n' "chaos:$g"; fi
  done
  if [ -n "$DEPLOYED" ]; then
    echo "--- deployed ($DEPLOYED) ---"
    if npm run -s chaos:deployed-qa -- "$DEPLOYED" >/dev/null 2>&1; then printf '%-34s PASS\n' "chaos:deployed-qa"; else printf '%-34s FAIL\n' "chaos:deployed-qa"; fi
    node scripts/accounts/liveGuestQa.mjs "$DEPLOYED" 2>&1 | grep -E 'live guest|passed|FAIL' | sed 's/^/live-guest-qa /' | tail -3
    node scripts/accounts/deployedQa.mjs "$DEPLOYED" 2>&1 | grep -E 'deployed gates|passed|FAIL' | sed 's/^/deployed-qa /' | tail -3
  fi
  echo "--- preservation ---"
  echo "api routes: $(ls api/*.js | wc -l | tr -d ' ') + middleware: $([ -f middleware.js ] && echo yes || echo no)"
  for r in wave1 wave2 main; do printf '%-6s %s\n' "$r" "$(git rev-parse --short origin/$r)"; done
  echo "=== DONE $(date -u +%FT%TZ) ==="
} 2>&1 | $TEE "$LOG"
# Frozen evidence must not carry this run's rewrites.
git checkout -- data/validation/7a data/validation/7b data/validation/8c1 data/validation/9a data/validation/9a1 data/validation/9a3p data/validation/9a2 data/validation/9a3 data/validation/9b1 data/validation/9b1a data/validation/9b2 2>/dev/null || true
git status --short data/validation | head
