# Production rollback runbook

**State: PREPARED, NOT EXERCISED.** No production change was made in Phase 6C2C2,
so none of these paths has been executed against production.

The frozen policy requires rollback to be **tested before activation**. That test
has not happened and is a precondition of any future activation.

## Order of escalation

Fastest and least destructive first. Do not reach for a deployment rollback when a
flag will do.

### 1. Flag rollback — seconds, no deploy

```
POSSESSION_ENGINE_EMERGENCY_OFF=true
POSSESSION_ENGINE_ROLLOUT_PERCENT=0
POSSESSION_ENGINE_SHADOW_PERCENT=0
```

New games resolve on engine 3.2.0 immediately. Existing results are untouched and
stay replayable on the engine recorded in their own manifest.

### 2. Mode rollback — keeps working modes live

Remove the affected mode from `POSSESSION_ENGINE_MODE_ALLOWLIST`. Use when one
mode misbehaves and the rest are clean. In-flight competitions keep the engine
they locked at creation, so no series or season is split.

### 3. Probability rollback — display only

```
MONTE_CARLO_PROBABILITY_ENABLED=false
```

Removes probability display without touching game simulation. Probability has no
influence on any result, so this is always safe and never changes an outcome.

### 4. Deployment rollback — promote the prior known-good deployment

Use when the problem is in code rather than in a flag. Record the deployment id
being promoted and the one being replaced.

### 5. PWA rollback — for a stale client bundle

Bump the service-worker cache identity and deploy. Clients pick up the new
identity on next load. A stale bundle serving a removed API shape is the failure
this addresses.

## What must never be done

- **Do not delete calibrated results.** They carry their own version manifest and
  remain valid records of what the engine did at that version.
- **Do not make old results unreplayable.** Retained production result parsers
  stay in the bundle.
- **Do not alter the current day's Daily.** Rollback affects the next UTC-day
  boundary, not a Daily already in flight.
- **Do not switch the engine inside a live competition object.** A series that
  started on the calibrated engine finishes on it, or is abandoned whole.
- **Do not delete engine 3.2.0.** It is the fallback.

## Rollback verification checklist

After any rollback, confirm:

- `/api/health` reports the expected engine and calibration versions
- a new Single Game resolves and persists
- an **old** result still replays to its original fingerprint
- a **calibrated-engine** result from before the rollback still replays
- a challenge created before the rollback still opens and still resolves
- the Daily for the current UTC day is unchanged
- no invariant failures, no final ties
- security headers intact
- logs contain no secrets and no calibration-only player ids

## Pre-activation rollback test — required, not yet done

Before any future activation, exercise each path on the preview environment and
record: the trigger, wall-clock time to effect, what users saw during the
transition, and confirmation that every checklist item above passed. A rollback
path that has never been run is a plan, not a capability.
