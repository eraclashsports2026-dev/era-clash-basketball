# Executive summary

Recovered 2026-08-24 by re-deriving from the repository, not from the lost
originals.

## Where EraClash actually is

**The live engine is already the V3 possession engine.** `simV3` defaults to
`true`; the V2 elo engine — the one that picked a winner first and dressed a box
score around it — survives only behind a kill switch. The constitution is
upheld in code: the winner is read off the scoreboard after the basketball
happens.

## The five things worth knowing

1. **The Chemistry meter does nothing.** Zero engine consumers since v2.5.0. It
   is displayed while building a team and again in Postgame. This is the largest
   gap between what the product appears to model and what it models.

2. **OVR and the engine disagree about "good".** `displayOVR` is a pool
   percentile driven by accolades; no file in `src/v3/` imports it. Larry
   Nance's Phase 2B accolade correction moved his OVR 70→75 without changing one
   basketball capability.

3. **Person identity was wrong nine ways** — found and fixed in Phase 2B. Seven
   humans were split across two identities each, so a lineup could legally field
   1950s Bill Russell next to 1960s Bill Russell. Two pairs of different men
   collided, so Chet Walker was refused alongside Chet Holmgren. This was live
   production validation, not a data-file curiosity.

4. **The card pool is not statistically uniform.** 310 of 381 cards are
   `LEGACY_UNVERIFIED`; 44 are hand-set prime-form figures that run
   systematically above a true decade mean; 16 follow the rigorous convention.
   Every downstream layer treats `pts` as one comparable quantity. Phase 2B made
   the mix explicit per card rather than continuing to imply uniformity.

5. **Coach research outruns coach capability.** `pnr`, `insideOut`,
   `starEmpowerment`, and `tacticalAdjustment` are populated by research and read
   by nothing. The possession loop has no pick-and-roll action to consume `pnr`.

## What was built alongside, and wired to nothing

**Player Intelligence** (Phase 2) — 381 profiles: roles, fit, era translation,
provenance. **Team Intelligence** (Phase 3) — lineup construction analysis:
finite usage, creation hierarchy, spacing, defensive coverage, rebounding, role
redundancy. Neither is imported by any simulation module, and a test enforces it.

Both refuse a single overall score, deliberately, because player OVR already
demonstrates what happens when one number becomes the thing everyone reads and
the engine ignores.

## Decisions the CEO still owns

1. V2 engine — supported kill switch, or sunset?
2. Chemistry — replace with real construction economics, or keep during transition?
3. Daily — may coach and era join the worldwide puzzle (identical for all, zero fairness cost)?
4. OVR — demote to draft guide, or build a V3-derived replacement?
5. Bench/minutes — five-player purity permanently, or open the format?
6. Dormant coach fields — fund the possession actions, or mark research-only?
7. **New:** card conventions — re-derive the 310 legacy cards, or formally accept the mix?
