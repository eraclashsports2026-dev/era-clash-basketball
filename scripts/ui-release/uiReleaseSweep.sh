#!/usr/bin/env bash
# Unified Light UI release gate sweep — serial, one log. Heavy gates never overlap.
#   bash scripts/ui-release/uiReleaseSweep.sh [deployedOrigin]
# Starts the 4180 harness (chaos/account/ui-release gates), the 4179 fixtures
# harness and the 4178 fake-cloud harness (challenge/progression/competitive/
# profile gates) when absent, and a lab build on 4176 for the 9A.2 gates.
# Frozen evidence a gate rewrites (9a2, 9b3, 9c, 9d, 9e, 9f) is restored from
# git afterwards; this release records into data/validation/ui-release/.
set -u
cd "$(git rev-parse --show-toplevel)"
LOG=data/validation/ui-release/${SWEEP_LOG:-final-gate-sweep.log}
LABEL="${SWEEP_LABEL:-FINAL}"
DEPLOYED="${1:-}"
HARNESS=http://localhost:4180
FAKE=http://localhost:4178
mkdir -p data/validation/ui-release
has() { node -e 'const p=require("./package.json");process.exit(p.scripts[process.argv[1]]?0:1)' "$1"; }
restart_fake() {
  pkill -f "harness.mjs 4178" 2>/dev/null; sleep 1
  (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 RL_PROFILE_PER_MIN_IP=500 RL_CHALLENGE_ACTIONS_PER_MIN_IP=500 RL_CHALLENGE_VIEW_PER_MIN_IP=500 RL_PROGRESSION_PER_MIN_IP=500 RL_COMPETITIVE_PER_MIN_IP=500 RL_PROFILE_PUBLIC_PER_MIN_IP=500 node scripts/harness.mjs 4178 > .uirc-harness-4178.log 2>&1 &)
  for _ in 1 2 3 4 5 6 7 8 9 10; do curl -sf -m 2 "$FAKE/api/health" >/dev/null 2>&1 && break; sleep 1; done
}
gate() {
  local name="$1"; shift
  if ! has "$name"; then printf '%-44s SKIPPED (no such script)\n' "$name"; return; fi
  local out=".uirc-gate-$(echo "$name" | tr ':/' '__').log"
  if "$@" >"$out" 2>&1; then printf '%-44s PASS\n' "$name"; else
    printf '%-44s FAIL\n' "$name"
    sed -n 's/^/      | /p' "$out" | grep -E 'FAIL|Error|error:|throw|timeout|429' | tail -8
  fi
}
{
  echo "=== UI RELEASE $LABEL SWEEP $(date -u +%FT%TZ) @ $(git rev-parse --short HEAD) ==="
  echo "--- unit ---"
  npx vitest run > .uirc-unit.out 2>&1; UNIT_RC=$?
  grep -E 'Test Files|Tests |FAIL|✗|failed' .uirc-unit.out | head -20
  if [ "$UNIT_RC" != "0" ]; then
    for f in $(grep -oE 'tests/[a-zA-Z0-9._-]+\.test\.js' .uirc-unit.out | sort -u); do
      echo "--- rerun alone: $f ---"
      if npx vitest run "$f" > .uirc-unit-rerun.out 2>&1; then printf '%-44s PASS ALONE (intermittent under the full suite)\n' "$f"
      else printf '%-44s FAIL ALONE (a real failure)\n' "$f"; grep -E 'FAIL|✗|AssertionError|expected' .uirc-unit-rerun.out | head -6 | sed 's/^/      | /'; fi
    done
  fi
  echo "--- build ---"; npm run build 2>&1 | tail -2
  npm run -s theme:css -- --check >/dev/null 2>&1 && echo "theme:css --check PASS" || echo "theme:css --check FAIL"
  if ! curl -sf -m 3 "$HARNESS/api/health" >/dev/null 2>&1; then
    (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview RL_PROFILE_PER_MIN_IP=500 node scripts/harness.mjs 4180 > .uirc-harness-4180.log 2>&1 &); sleep 3; fi
  if ! curl -sf -m 3 "http://localhost:4179/api/health" >/dev/null 2>&1; then
    npm run -s build:fixtures >/dev/null 2>&1
    (PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 ECLASH_DIST=dist-fixtures RL_PROFILE_PER_MIN_IP=500 RL_PROGRESSION_PER_MIN_IP=500 RL_COMPETITIVE_PER_MIN_IP=500 RL_PROFILE_PUBLIC_PER_MIN_IP=500 node scripts/harness.mjs 4179 > .uirc-harness-4179.log 2>&1 &); sleep 3; fi
  restart_fake
  if ! curl -sf -m 3 "http://localhost:4176/play" >/dev/null 2>&1; then
    VITE_EC_THEME_LAB=1 VITE_EC_DEV_FIXTURES=1 npx vite build --outDir dist-lab >/dev/null 2>&1
    (npx vite preview --outDir dist-lab --port 4176 --strictPort > .uirc-lab-4176.log 2>&1 &); sleep 3; fi
  echo "--- e2e (all projects) ---"
  npx playwright test > .uirc-e2e.out 2>&1; E2E_RC=$?
  grep -E 'passed|failed|flaky|skipped|Error' .uirc-e2e.out | tail -6
  if [ "$E2E_RC" != "0" ]; then
    for spec in $(grep -E '✘' .uirc-e2e.out | grep -oE 'e2e/[a-z0-9-]+\.spec\.js' | sort -u); do
      echo "--- rerun alone: $spec ---"
      if npx playwright test "$spec" > .uirc-e2e-rerun.out 2>&1; then printf '%-44s PASS ALONE (intermittent)\n' "$spec"
      else printf '%-44s FAIL ALONE (a real failure)\n' "$spec"; grep -E '✘|Error' .uirc-e2e-rerun.out | head -6 | sed 's/^/      | /'; fi
    done
  fi
  echo "--- release gates ---"
  for g in ui-release:challenge-entry-qa ui-release:theme-qa ui-release:responsive-qa ui-release:accessibility-qa ui-release:performance-qa; do gate "$g" npm run -s "$g"; done
  echo "--- preview / ui / theme gates ---"
  for g in preview:preflight preview:security; do gate "$g" npm run -s "$g"; done
  for g in ui:time-arena-qa ui:result-dock-qa ui:live-intel-qa ui:coach-chaos-qa ui:player-card-theme-qa ui:synchronized-chaos-qa ui:era-membership-qa ui:navigation-qa ui:membership-routing-qa ui:activation-telemetry-qa ui:play-lobby-contracts ui:night-court-contracts ui:play-lobby-polish-qa; do gate "$g" npm run -s "$g"; done
  # 9A.2 browser gates against the lab build on 4176 (portrait contrast is enforced; production/fracture/semantic carry pre-existing 9B.3 selector drift — see shared-theme-contract.json)
  for g in ui:portrait-contrast-qa ui:night-court-production-qa ui:era-fracture-qa ui:semantic-color-qa; do gate "$g" npm run -s "$g"; done
  echo "--- accounts / career gates ---"
  for g in account:guest-claim-qa account:cloud-save-qa account:my-eraclash-qa account:saved-rosters-qa account:run-it-back-qa account:career-v2-qa; do gate "$g" npm run -s "$g"; done
  echo "--- chaos flow gates ---"
  for g in guided-flow-qa state-machine-qa accessibility-qa performance-qa responsive-qa coach-draft-qa hold-qa fairness security; do gate "chaos:$g" npm run -s "chaos:$g" -- "$HARNESS"; done
  echo "--- challenge / progression / competitive / profile gates (fake cloud) ---"
  for g in contract-qa seed-qa rls-qa; do gate "challenge:$g" npm run -s "challenge:$g"; done
  for g in security-qa history-qa responsive-qa accessibility-qa performance-qa; do gate "challenge:$g" npm run -s "challenge:$g" -- "$FAKE"; done
  for g in contract-qa xp-qa achievement-qa backfill-qa reconcile-qa rls-qa; do gate "progression:$g" npm run -s "progression:$g"; done
  for g in security-qa concurrency-qa result-qa challenge-qa responsive-qa accessibility-qa performance-qa; do gate "progression:$g" npm run -s "progression:$g" -- "$FAKE"; done
  for g in contract-qa rating-qa backfill-qa rls-qa; do gate "competitive:$g" npm run -s "competitive:$g"; done
  restart_fake
  for g in concurrency-qa privacy-qa leaderboard-qa; do gate "competitive:$g" npm run -s "competitive:$g" -- "$FAKE"; done
  restart_fake
  for g in security-qa responsive-qa accessibility-qa performance-qa; do gate "competitive:$g" npm run -s "competitive:$g" -- "$FAKE"; done
  for g in contract-qa identifier-qa visibility-qa projection-qa featured-qa provisional-qa display-name-qa deletion-qa enumeration-qa rls-qa; do gate "profile:$g" npm run -s "profile:$g"; done
  restart_fake
  for g in cross-account-qa leaderboard-qa sharing-qa responsive-qa accessibility-qa performance-qa; do gate "profile:$g" npm run -s "profile:$g" -- "$FAKE"; done
  if [ -n "$DEPLOYED" ]; then
    echo "--- deployed ($DEPLOYED) ---"
    for g in profile:deployed-qa competitive:deployed-qa progression:deployed-qa challenge:deployed-qa chaos:deployed-qa; do gate "$g" npm run -s "$g" -- "$DEPLOYED"; done
  fi
  echo "--- restore frozen evidence rewritten by gates ---"
  git checkout -q -- data/validation/9a2 data/validation/9b3 data/validation/9c data/validation/9d data/validation/9e data/validation/9f 2>/dev/null; echo restored
  echo "=== END $(date -u +%FT%TZ) ==="
} 2>&1 | tee "$LOG"
