#!/usr/bin/env bash
# Phase 9F gate sweep — serial, one log. Heavy gates never overlap.
#   bash scripts/competitive/phase9fSweep.sh [deployedOrigin]
# SWEEP_LOG=pre-edit-sweep.log labels a pre-edit run. Starts the 4180 harness
# (chaos/account gates) and the 4178 fake-cloud harness (challenge/progression
# gates) when absent. Gates that do not exist in package.json are skipped and
# said so. Frozen evidence a gate rewrites is restored from git afterwards.
set -u
cd "$(git rev-parse --show-toplevel)"
LOG=data/validation/9f/${SWEEP_LOG:-final-gate-sweep.log}
LABEL="${SWEEP_LABEL:-FINAL}"
DEPLOYED="${1:-}"
HARNESS=http://localhost:4180
FAKE=http://localhost:4178
APPEND="${APPEND:-0}"
TEE=tee; [ "$APPEND" = "1" ] && TEE="tee -a"
mkdir -p data/validation/9f
has() { node -e 'const p=require("./package.json");process.exit(p.scripts[process.argv[1]]?0:1)' "$1"; }
# A fresh fake-cloud harness: the in-memory cloud is per-process, so restarting
# it is the only way to hand a gate an unspent pair.
restart_fake() {
  pkill -f "harness.mjs 4178" 2>/dev/null
  sleep 1
  (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 RL_PROFILE_PER_MIN_IP=500 RL_CHALLENGE_ACTIONS_PER_MIN_IP=500 RL_CHALLENGE_VIEW_PER_MIN_IP=500 RL_PROGRESSION_PER_MIN_IP=500 RL_COMPETITIVE_PER_MIN_IP=500 node scripts/harness.mjs 4178 > .9f-harness-4178.log 2>&1 &)
  for _ in 1 2 3 4 5 6 7 8 9 10; do curl -sf -m 2 "$FAKE/api/health" >/dev/null 2>&1 && break; sleep 1; done
  STARTED_FAKE=1
}
# A gate's output is kept, so a failure in a long serial sweep can be read afterwards
# instead of guessed at: the last lines go into this log and the whole run into
# .9f-gate-<name>.log.
gate() {
  local name="$1"; shift
  if ! has "$name"; then printf '%-40s SKIPPED (no such script)\n' "$name"; return; fi
  local out=".9f-gate-$(echo "$name" | tr ':/' '__').log"
  if "$@" >"$out" 2>&1; then printf '%-40s PASS\n' "$name"; else
    printf '%-40s FAIL\n' "$name"
    sed -n 's/^/      | /p' "$out" | grep -E 'FAIL|Error|error:|throw|at [A-Za-z]|timeout|429' | tail -8
  fi
}
{
  echo "=== PHASE 9F $LABEL SWEEP $(date -u +%FT%TZ) @ $(git rev-parse --short HEAD) ==="
  echo "--- unit ---"; npx vitest run 2>&1 | grep -E 'Test Files|Tests |FAIL|✗|failed' | head -20
  echo "--- build ---"; npm run build 2>&1 | tail -2
  # harnesses serve dist/, so they start after the build
  STARTED_MAIN=0; STARTED_FAKE=0
  if ! curl -sf -m 3 "$HARNESS/api/health" >/dev/null 2>&1; then
    (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview RL_PROFILE_PER_MIN_IP=500 node scripts/harness.mjs 4180 > .9f-harness-4180.log 2>&1 &); sleep 3; STARTED_MAIN=1; fi
  # the fixtures harness (dev-only reference routes) for the progression and competitive UI gates
  STARTED_FIX=0
  if ! curl -sf -m 3 "http://localhost:4179/api/health" >/dev/null 2>&1; then
    npm run -s build:fixtures >/dev/null 2>&1
    (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 ECLASH_DIST=dist-fixtures RL_PROFILE_PER_MIN_IP=500 RL_PROGRESSION_PER_MIN_IP=500 RL_COMPETITIVE_PER_MIN_IP=500 node scripts/harness.mjs 4179 > .9f-harness-4179.log 2>&1 &); sleep 3; STARTED_FIX=1; fi
  if ! curl -sf -m 3 "$FAKE/api/health" >/dev/null 2>&1; then
    (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 RL_PROFILE_PER_MIN_IP=500 RL_CHALLENGE_ACTIONS_PER_MIN_IP=500 RL_CHALLENGE_VIEW_PER_MIN_IP=500 RL_PROGRESSION_PER_MIN_IP=500 RL_COMPETITIVE_PER_MIN_IP=500 node scripts/harness.mjs 4178 > .9f-harness-4178.log 2>&1 &); sleep 3; STARTED_FAKE=1; fi
  echo "--- e2e (all projects) ---"
  npx playwright test > .9f-e2e.out 2>&1; E2E_RC=$?
  grep -E 'passed|failed|flaky|skipped|Error' .9f-e2e.out | tail -6
  # retries stay 0 and workers stay 1 in the shared Playwright config — masking a
  # failure across every phase is not ours to do. Instead, when a spec fails, run
  # THAT spec alone once and record both outcomes, so an intermittent is visible
  # as an intermittent and a real regression is visible as a regression.
  if [ "$E2E_RC" != "0" ]; then
    for spec in $(grep -oE 'e2e/[a-z0-9-]+\.spec\.js' .9f-e2e.out | sort -u); do
      echo "--- rerun alone: $spec ---"
      if npx playwright test "$spec" > ".9f-e2e-rerun.out" 2>&1; then
        printf '%-40s PASS ALONE (intermittent under the full suite, not a regression)\n' "$spec"
      else
        printf '%-40s FAIL ALONE (a real failure)\n' "$spec"
        grep -E 'Error|✘|failed' ".9f-e2e-rerun.out" | head -6 | sed 's/^/      | /'
      fi
    done
  fi
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
  echo "--- 9E competitive gates (fake-cloud harness $FAKE) ---"
  for g in contract-qa rating-qa backfill-qa rls-qa; do gate "competitive:$g" npm run -s "competitive:$g"; done
  for g in concurrency-qa privacy-qa leaderboard-qa; do gate "competitive:$g" npm run -s "competitive:$g" -- "$FAKE"; done
  # The security gate plays a whole account-vs-account Challenge between the
  # harness's only two test accounts, Joseph and Bea. Every 9C, 9D and 9F gate
  # before it completes Challenges for that same pair on this same harness, and
  # each of those now creates a rating event — so by this point the pair has
  # legitimately spent its three rated outcomes in seven days and the completion
  # is refused, correctly, as repeat_opponent_limit. Restart the fake cloud so
  # the gate measures the rating movement rather than the anti-farming rule
  # (which repeat-opponent-qa owns).
  restart_fake
  for g in security-qa responsive-qa accessibility-qa performance-qa; do gate "competitive:$g" npm run -s "competitive:$g" -- "$FAKE"; done
  echo "--- 9F profile gates (fake-cloud harness $FAKE) ---"
  for g in contract-qa identifier-qa visibility-qa projection-qa featured-qa provisional-qa display-name-qa deletion-qa enumeration-qa rls-qa; do gate "profile:$g" npm run -s "profile:$g"; done
  restart_fake
  for g in cross-account-qa leaderboard-qa sharing-qa responsive-qa accessibility-qa performance-qa; do gate "profile:$g" npm run -s "profile:$g" -- "$FAKE"; done
  if [ -n "$DEPLOYED" ]; then
    echo "--- deployed ($DEPLOYED) ---"
    gate "profile:deployed-qa" npm run -s profile:deployed-qa -- "$DEPLOYED"
    gate "competitive:deployed-qa" npm run -s competitive:deployed-qa -- "$DEPLOYED"
    gate "progression:deployed-qa" npm run -s progression:deployed-qa -- "$DEPLOYED"
    gate "challenge:deployed-qa" npm run -s challenge:deployed-qa -- "$DEPLOYED"
    gate "chaos:deployed-qa" npm run -s chaos:deployed-qa -- "$DEPLOYED"
    node scripts/accounts/liveGuestQa.mjs "$DEPLOYED" 2>&1 | grep -E 'live guest|checks passed|FAIL' | sed 's/^/live-guest-qa /' | tail -3
    # the account route allows 20 requests a minute per IP; the deployed gates above spend most of it — let the window pass
    sleep 65
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
git checkout -- data/validation/7a data/validation/7b data/validation/8c-time-arena data/validation/8c1 data/validation/9a data/validation/9a1 data/validation/9a3p data/validation/9a2 data/validation/9a3 data/validation/9b1 data/validation/9b1a data/validation/9b2 data/validation/9b3 data/validation/9c data/validation/9d data/validation/9e 2>/dev/null || true
git status --short data/validation | grep -v '9f/' | head
