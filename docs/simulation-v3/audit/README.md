# V3 Foundation Audit — recovered 2026-08-24

The original Phase 1 audit was written on a different machine and lost before it
was ever pushed. This set was **re-derived from the repository itself**, not
reconstructed from the handoff summary — every claim below was checked against
code at commit `b02c45f`+ on branch `phase-3-team-intelligence`.

It lives under `docs/simulation-v3/` because that is the established V3
documentation location. The brief's suggested `docs/v3/` path was not used: a
second top-level V3 folder would have competed with the existing one.

Two pre-existing documents already cover ground this audit would otherwise
duplicate, and are referenced rather than rewritten:

- `../architecture.md` — the intended V3 architecture as originally designed
- `../current-engine-audit.md` — the earlier engine audit
- `../translation-doctrine.md` — era normalization rules
- `../player-intelligence.md` — the Phase 2 layer
- `../player-card-stat-basis.md` — card statistical conventions (Phase 2B)

## Contents

| Document | Answers |
| --- | --- |
| `current-repository-map.md` | Where every kind of data and logic lives |
| `current-simulation-audit.md` | What actually determines the result today |
| `current-player-model.md` | How a player becomes numbers |
| `current-coach-audit.md` | What coaches do and do not do |
| `current-era-style-audit.md` | What era style does and does not do |
| `current-ui-audit.md` | What the interface shows vs what is real |
| `current-risks.md` | Honest risk register |
| `recommended-v3-architecture.md` | The target layering and why |
| `v3-module-design.md` | Module boundaries and contracts |
| `v3-migration-plan.md` | How to get there without breaking production |
| `v3-testing-strategy.md` | What is guarded and how |
| `executive-summary.md` | The short version |
