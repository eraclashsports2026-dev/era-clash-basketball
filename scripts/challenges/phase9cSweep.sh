#!/usr/bin/env bash
# Phase 9C final gate sweep — serial, one log. Heavy gates never overlap.
#   bash scripts/challenges/phase9cSweep.sh [deployedOrigin]
# Needs the local harness on 4180 (chaos gates) and starts its own fake-cloud
# harness on 4178 for the challenge gates. Frozen evidence a gate rewrites is
# restored from git afterwards. SKIP_UNIT=1 appends a part-2 section.
set -u
cd "$(git rev-parse --show-toplevel)"
LOG=data/validation/9c/final-gate-sweep.log
DEPLOYED="${1:-}"
HARNESS=http://localhost:4180
FAKE=http://localhost:4178
SKIP_UNIT="${SKIP_UNIT:-0}"
TEE=tee; [ "$SKIP_UNIT" = "1" ] && TEE="tee -a"
mkdir -p data/validation/9c
# the fake-cloud harness for the challenge gates
if ! curl -sf -m 3 "$FAKE/api/health" >/dev/null 2>&1; then
  (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 RL_PROFILE_PER_MIN_IP=500 RL_CHALLENGE_ACTIONS_PER_MIN_IP=500 RL_CHALLENGE_VIEW_PER_MIN_IP=500 node scripts/harness.mjs 4178 > .9c-harness-4178.log 2>&1 &)
  sleep 3; STARTED_FAKE=1
else STARTED_FAKE=0; fi
gate() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then printf '%-34s PASS\n' "$name"; else printf '%-34s FAIL\n' "$name"; fi; }
{
  if [ "$SKIP_UNIT" = "1" ]; then echo "=== PHASE 9C FINAL SWEEP PART 2 $(date -u +%FT%TZ) @ $(git rev-parse --short HEAD) (unit suite: see part 1) ===";
  else echo "=== PHASE 9C FINAL SWEEP $(date -u +%FT%TZ) @ $(git rev-parse --short HEAD) ===";
  echo "--- unit ---"; npx vitest run 2>&1 | grep -E 'Test Files|Tests |FAIL|✗|failed' | head -20; fi
  echo "--- build ---"; npm run build 2>&1 | tail -2
  echo "--- e2e (all projects, incl. challenges-fake-cloud) ---"; npx playwright test 2>&1 | grep -E 'passed|failed|flaky|skipped|Error' | tail -6
  echo "--- preview gates (static) ---"
  for g in preview:preflight preview:security; do gate "$g" npm run -s "$g"; done
  echo "--- repository ui gates ---"
  for g in ui:time-arena-qa ui:result-dock-qa ui:live-intel-qa ui:coach-chaos-qa ui:player-card-theme-qa ui:synchronized-chaos-qa ui:era-membership-qa ui:navigation-qa ui:membership-routing-qa ui:activation-telemetry-qa ui:play-lobby-contracts ui:night-court-contracts ui:play-lobby-polish-qa; do gate "$g" npm run -s "$g"; done
  echo "--- account gates (9B.1 / 9B.2, local harness) ---"
  export ACCOUNT_QA_BASE="$HARNESS"
  for g in account:guest-claim-qa account:cloud-save-qa account:my-eraclash-qa account:saved-rosters-qa account:run-it-back-qa; do gate "$g" npm run -s "$g"; done
  echo "--- 9B.3 chaos gates (harness $HARNESS) ---"
  for g in guided-flow-qa state-machine-qa accessibility-qa performance-qa; do gate "chaos:$g" npm run -s "chaos:$g" -- "$HARNESS"; done
  echo "--- 9C challenge gates (fake-cloud harness $FAKE) ---"
  for g in contract-qa seed-qa rls-qa; do gate "challenge:$g" npm run -s "challenge:$g"; done
  for g in security-qa history-qa responsive-qa accessibility-qa performance-qa; do gate "challenge:$g" npm run -s "challenge:$g" -- "$FAKE"; done
  if [ -n "$DEPLOYED" ]; then
    echo "--- deployed ($DEPLOYED) ---"
    gate "challenge:deployed-qa" npm run -s challenge:deployed-qa -- "$DEPLOYED"
    gate "chaos:deployed-qa" npm run -s chaos:deployed-qa -- "$DEPLOYED"
    node scripts/accounts/liveGuestQa.mjs "$DEPLOYED" 2>&1 | grep -E 'live guest|checks passed|FAIL' | sed 's/^/live-guest-qa /' | tail -3
    node scripts/accounts/deployedQa.mjs "$DEPLOYED" 2>&1 | grep -E 'deployed gates|[0-9]+/[0-9]+ .*passed|FAIL' | sed 's/^/deployed-qa /' | tail -3
  fi
  echo "--- preservation ---"
  echo "api routes: $(ls api/*.js | wc -l | tr -d ' ') + middleware: $([ -f middleware.js ] && echo yes || echo no)"
  for r in wave1 wave2 main; do printf '%-6s %s\n' "$r" "$(git rev-parse --short origin/$r)"; done
  echo "=== DONE $(date -u +%FT%TZ) ==="
} 2>&1 | $TEE "$LOG"
[ "$STARTED_FAKE" = "1" ] && pkill -f "harness.mjs 4178" 2>/dev/null
git checkout -- data/validation/7a data/validation/7b data/validation/8c-time-arena data/validation/8c1 data/validation/9a data/validation/9a1 data/validation/9a3p data/validation/9a2 data/validation/9a3 data/validation/9b1 data/validation/9b1a data/validation/9b2 data/validation/9b3 2>/dev/null || true
git status --short data/validation | grep -v '9c/' | head
