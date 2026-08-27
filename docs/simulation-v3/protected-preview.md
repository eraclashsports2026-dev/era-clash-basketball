# Protected preview — Candidate 3

Rendered from `data/validation/6c4d0/` artifacts. Status: **PACKAGE_READY_NOT_DEPLOYED**.

## The candidate

| | |
|---|---|
| Candidate | Candidate 3 (core `6a423d4fedf45bef…`) |
| States | SELECTED · LOCKED · PREVIEW_READY_LOCKED · FORMAL_VALIDATION_INCOMPLETE |
| Calibration identity | possessionCalibration **1.3.0** · actionLibrary **2.1.0** |
| Parent | Candidate 2 (core `3733b648f050a4f5…`) |
| Engine changes | c3-01 INTENT_CARRY; c3-02 postThreat derivation |
| Not claimed | HOLDOUT_VALIDATED, PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY, ACTIVE |

## The integration

- **Flag**: `PREVIEW_SIM_ENGINE_ENABLED` — default **false**. unset or false/0/off/no returns every new request to production; stored preview records stay readable by version.
- **Scope**: single-game only; season/daily/challenge/series stay on production.
- **Fallback**: engine 3.2.0 via computeResultV3, per request, on any preview failure (fallback_invoked).
- **Namespaces**: preview-result, preview-probability, preview-narrative, preview-competition, preview-daily, preview-challenge — result ids carry the `pv_` prefix. Preview records never enter a production namespace.
- **Telemetry**: allowlisted operational events only; token/secret/authorization/cookie/password/email/session keys stripped; only number/string/boolean values pass.

## Verification

| Command | Result |
|---|---|
| `npm run preview:preflight` | 6/6 |
| `npm run preview:smoke` | 5/5 (40 games) |
| `npm run preview:soak` | 5/5 (400 games, p50 2ms, p95 3ms, replay 0 breaks) |
| `npm run preview:security` | 9/9 |
| `npm run preview:browser-qa` | playwright 19/19 |
| `npx vitest run` | 1963/1963 |

## What was NOT done

- no deployment
- no Vercel environment change
- no main merge
- no formal holdout access
- no HOLDOUT_VALIDATED/PRODUCTION_READY/ACTIVE claim
