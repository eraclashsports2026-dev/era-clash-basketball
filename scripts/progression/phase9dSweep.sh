#!/usr/bin/env bash
# Phase 9D gate sweep — serial, one log. Heavy gates never overlap.
#   bash scripts/progression/phase9dSweep.sh [deployedOrigin]
# SWEEP_LOG=pre-edit-sweep.log labels a pre-edit run. Starts the 4180 harness
# (chaos/account gates) and the 4178 fake-cloud harness (challenge/progression
# gates) when absent. Gates that do not exist in package.json are skipped and
# said so. Frozen evidence a gate rewrites is restored from git afterwards.
set -u
cd "$(git rev-parse --show-toplevel)"
LOG=data/validation/9d/${SWEEP_LOG:-final-gate-sweep.log}
LABEL="${SWEEP_LABEL:-FINAL}"
DEPLOYED="${1:-}"
HARNESS=http://localhost:4180
FAKE=http://localhost:4178
APPEND="${APPEND:-0}"
TEE=tee; [ "$APPEND" = "1" ] && TEE="tee -a"
mkdir -p data/validation/9d
has() { node -e 'const p=require("./package.json");process.exit(p.scripts[process.argv[1]]?0:1)' "$1"; }
gate() { local name="$1"; shift; if ! has "$name"; then printf '%-40s SKIPPED (no such script)\n' "$name"; return; fi; if "$@" >/dev/null 2>&1; then printf '%-40s PASS\n' "$name"; else printf '%-40s FAIL\n' "$name"; fi; }
{
  echo "=== PHASE 9D $LABEL SWEEP $(date -u +%FT%TZ) @ $(git rev-parse --short HEAD) ==="
  echo "--- unit ---"; npx vitest run 2>&1 | grep -E 'Test Files|Tests |FAIL|✗|failed' | head -20
  echo "--- build ---"; npm run build 2>&1 | tail -2
  # harnesses serve dist/, so they start after the build
  STARTED_MAIN=0; STARTED_FAKE=0
  if ! curl -sf -m 3 "$HARNESS/api/health" >/dev/null 2>&1; then
    (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview RL_PROFILE_PER_MIN_IP=500 node scripts/harness.mjs 4180 > .9d-harness-4180.log 2>&1 &); sleep 3; STARTED_MAIN=1; fi
  # the fixtures harness (dev-only reference route) for the progression UI gates
  STARTED_FIX=0
  if ! curl -sf -m 3 "http://localhost:4179/api/health" >/dev/null 2>&1; then
    npm run -s build:fixtures >/dev/null 2>&1
    (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 ECLASH_DIST=dist-fixtures RL_PROFILE_PER_MIN_IP=500 RL_PROGRESSION_PER_MIN_IP=500 node scripts/harness.mjs 4179 > .9d-harness-4179.log 2>&1 &); sleep 3; STARTED_FIX=1; fi
  if ! curl -sf -m 3 "$FAKE/api/health" >/dev/null 2>&1; then
    (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 RL_PROFILE_PER_MIN_IP=500 RL_CHALLENGE_ACTIONS_PER_MIN_IP=500 RL_CHALLENGE_VIEW_PER_MIN_IP=500 RL_PROGRESSION_PER_MIN_IP=500 node scripts/harness.mjs 4178 > .9d-harness-4178.log 2>&1 &); sleep 3; STARTED_FAKE=1; fi
  echo "--- e2e (all projects) ---"; npx playwright test 2>&1 | grep -E 'passed|failed|flaky|skipped|Error' | tail -6
  echo "--- preview gates (static) ---"
  for g in preview:preflight preview:security; do gate "$g" npm run -s "$g"; done
  echo "--- repository ui gates ---"
  for g in ui:time-arena-qa ui:result-dock-qa ui:live-intel-qa ui:coach-chaos-qa ui:player-card-theme-qa ui:synchronized-chaos-qa ui:era-membership-qa ui:navigation-qa ui:membership-routing-qa ui:activation-telemetry-qa ui:play-lobby-contracts ui:night-court-contracts ui:play-lobby-polish-qa; do gate "$g" npm run -s "$g"; done
  echo "--- account gates (9B.1 / 9B.2, harness $HARNESS) ---"
  export ACCOUNT_QA_BASE="$HARNESS"
  for g in account:guest-claim-qa account:cloud-save-qa account:my-eraclash-qa account:saved-rosters-qa account:run-it-back-qa account:career-v2-qa; do gate "$g" npm run -s "$g"; done
  echo "--- 9B.3 chaos gates (harness $HARNESS) ---"
  for g in guided-flow-qa state-machine-qa accessibility-qa performance-qa; do gate "chaos:$g" npm run -s "chaos:$g" -- "$HARNESS"; done
  echo "--- 9C challenge gates (fake-cloud harness $FAKE) ---"
  for g in contract-qa seed-qa rls-qa; do gate "challenge:$g" npm run -s "challenge:$g"; done
  for g in security-qa history-qa responsive-qa accessibility-qa performance-qa; do gate "challenge:$g" npm run -s "challenge:$g" -- "$FAKE"; done
  echo "--- 9D progression gates (fake-cloud harness $FAKE) ---"
  for g in contract-qa xp-qa achievement-qa backfill-qa reconcile-qa rls-qa; do gate "progression:$g" npm run -s "progression:$g"; done
  for g in security-qa concurrency-qa result-qa challenge-qa responsive-qa accessibility-qa performance-qa; do gate "progression:$g" npm run -s "progression:$g" -- "$FAKE"; done
  if [ -n "$DEPLOYED" ]; then
    echo "--- deployed ($DEPLOYED) ---"
    gate "progression:deployed-qa" npm run -s progression:deployed-qa -- "$DEPLOYED"
    gate "challenge:deployed-qa" npm run -s challenge:deployed-qa -- "$DEPLOYED"
    gate "chaos:deployed-qa" npm run -s chaos:deployed-qa -- "$DEPLOYED"
    node scripts/accounts/liveGuestQa.mjs "$DEPLOYED" 2>&1 | grep -E 'live guest|checks passed|FAIL' | sed 's/^/live-guest-qa /' | tail -3
    node scripts/accounts/deployedQa.mjs "$DEPLOYED" 2>&1 | grep -E 'deployed gates|[0-9]+/[0-9]+ .*passed|FAIL' | sed 's/^/deployed-qa /' | tail -3
  fi
  echo "--- preservation ---"
  echo "api routes: $(ls api/*.js | wc -l | tr -d ' ') + middleware: $([ -f middleware.js ] && echo yes || echo no)"
  for r in wave1 wave2 main; do printf '%-6s %s\n' "$r" "$(git rev-parse --short origin/$r)"; done
  echo "=== DONE $(date -u +%FT%TZ) ==="
  [ "$STARTED_FAKE" = "1" ] && pkill -f "harness.mjs 4178" 2>/dev/null
  [ "$STARTED_FIX" = "1" ] && pkill -f "harness.mjs 4179" 2>/dev/null
  [ "$STARTED_MAIN" = "1" ] && pkill -f "harness.mjs 4180" 2>/dev/null
} 2>&1 | $TEE "$LOG"
git checkout -- data/validation/7a data/validation/7b data/validation/8c-time-arena data/validation/8c1 data/validation/9a data/validation/9a1 data/validation/9a3p data/validation/9a2 data/validation/9a3 data/validation/9b1 data/validation/9b1a data/validation/9b2 data/validation/9b3 data/validation/9c 2>/dev/null || true
git status --short data/validation | grep -v '9d/' | head
