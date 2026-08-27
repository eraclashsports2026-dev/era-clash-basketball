#!/usr/bin/env node
// ── The frozen measurement surfaces for the Synthetic V2 guardrails ──────────
//   npm run syn:surfaces
//
// A guardrail is only meaningful on a surface where its claim is DECIDABLE.
// Three corrections were forced by measured evidence during preparation, each
// recorded in synthetic-v2-surface-corrections.json:
//
//   1. forbidUniversalShellDominance is not decidable on a mirror. With the
//      same coach on both sides both defences draw zone with equal
//      probability, so the "zone side" is whichever side happened to draw more
//      — noise. Measured on 4 development fixtures the win rate was 0.499,
//      0.521, 0.523, 0.505: pinned to 0.5 by construction, so the frozen band
//      [0.35, 0.65] could never fail and never pass on evidence. It moves to
//      ZONE_ASYMMETRIC.
//   2. requireExtremeTalentRemainsMeaningful had its direction backwards.
//      ss2-extreme-strength-gap is the FLATTEST five in the sealed set
//      (card ratings 23.9-27.5, internal ratio 1.2) and the LOWEST rated at
//      132.2 — it is the weak side of the gap, not the strong side. A
//      "fixture must out-rate the control" precondition would have been
//      unsatisfiable. It needs an ELITE opponent.
//   3. requireConstructionCanBeatHigherOvr needs a control that is genuinely
//      lower-rated than each fixture. A single fixed control cannot be: the
//      sealed fixtures span 132.2 to 322.9. The control is built per fixture
//      to a rating target derived from the fixture's own rating.
//
// None of this changes a frozen guardrail's meaning, its key, or its numeric
// thresholds. It changes only where each one is measured.
import { createHash } from "node:crypto";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2, SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";
import { PLAYERS, findCard } from "../../src/players.js";
import { buildIntelligence } from "../../src/v3/intelligence.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { coachToolkit, eraLegality } from "../../src/v3/defense/scheme.js";
import COACH_DATA from "../../src/v3/data/coaches.js";
import ERA_DATA from "../../src/v3/data/eras.js";
import { cardRating } from "./controls.mjs";
import { buildRegistry } from "./guardrailRegistry.mjs";
import { DIR } from "./preflight.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
export const person = (id) => personIdForCard(id) ?? id;
export const ERAS = ERA_DATA.default?.eras ?? ERA_DATA.eras ?? ERA_DATA;
export const eraById = (id) => ERAS.find((e) => e.id === id);
export const zoneLegalIn = (eraId) => { const l = eraLegality(eraById(eraId)); return Boolean(l.zoneLegal) && (l.maxZoneUsage ?? 0) > 0; };

// ── the frozen coach pair for the asymmetric shell surface ───────────────────
// Chosen by an explicit rule: among all coach pairs whose zonePreference
// differs by at least 6, the pair with the smallest Euclidean distance across
// the OTHER ten toolkit dimensions. This minimises, but cannot eliminate, the
// coach confound — which is why the surface carries a zone-illegal twin.
export const ZONE_DIMS = ["manPreference", "switching", "dropCoverage", "pressure",
  "helpAggression", "rimPriority", "reboundPriority", "adaptability", "tacticalAdjustment", "roleDiscipline"];
export const chooseShellCoachPair = () => {
  const tks = COACH_DATA.coaches.map((c) => ({ id: c.id, tk: coachToolkit(c) }));
  const dist = (a, b) => Math.sqrt(ZONE_DIMS.reduce((s, d) => s + ((a.tk[d] ?? 5) - (b.tk[d] ?? 5)) ** 2, 0));
  const pairs = [];
  for (const hi of tks) for (const lo of tks) {
    const gap = hi.tk.zonePreference - lo.tk.zonePreference;
    if (gap < 6) continue;
    pairs.push({ zoneCoachId: hi.id, manCoachId: lo.id, zonePreferenceHigh: hi.tk.zonePreference,
      zonePreferenceLow: lo.tk.zonePreference, zonePreferenceGap: gap, otherDimensionDistance: r5(dist(hi, lo)) });
  }
  pairs.sort((a, b) => a.otherDimensionDistance - b.otherDimensionDistance
    || b.zonePreferenceGap - a.zonePreferenceGap || a.zoneCoachId.localeCompare(b.zoneCoachId));
  if (!pairs.length) throw new Error("no coach pair with a zonePreference gap of 6 or more");
  const best = pairs[0];
  const A = tks.find((t) => t.id === best.zoneCoachId).tk, B = tks.find((t) => t.id === best.manCoachId).tk;
  return { ...best, residualConfound: Object.fromEntries(ZONE_DIMS.map((d) => [d, { zoneCoach: A[d], manCoach: B[d], difference: r5(Math.abs(A[d] - B[d])) }])),
    selectionRule: "among all coach pairs with a zonePreference gap of at least 6, the pair minimising Euclidean distance across the other ten toolkit dimensions; ties broken by larger zone gap then by coach id",
    candidatePairsConsidered: pairs.length };
};

// ── coherence ───────────────────────────────────────────────────────────────
// What makes a five a basketball team rather than a pile of cards. Defined on
// the intelligence profile, not on the card's accolades, so it is a statement
// about function rather than about fame.
export const profileOf = (id) => buildIntelligence(findCard(id), {});
export const coherenceOf = (five) => {
  const ps = five.map(profileOf);
  const creators = ps.filter((p) => (p.offense?.selfCreation ?? 0) >= 6.5).length;
  const spacers = ps.filter((p) => (p.offense?.spacingGravity ?? 0) >= 6).length;
  const rimProtectors = ps.filter((p) => (p.defense?.rimDeterrence ?? 0) >= 5.5).length;
  const posts = ps.filter((p) => (p.offense?.postThreat ?? 0) >= 5.5).length;
  const passers = ps.filter((p) => (p.offense?.passingVision ?? 0) >= 6).length;
  const checks = {
    hasALeadCreator: creators >= 1,
    creationNotCollided: creators <= 3,
    hasSpacing: spacers >= 2,
    hasRimProtection: rimProtectors >= 1,
    hasInteriorScoring: posts >= 1,
    hasAPasser: passers >= 1,
  };
  const satisfied = Object.values(checks).filter(Boolean).length;
  return { checks, satisfied, total: Object.keys(checks).length,
    coherent: Object.values(checks).every(Boolean),
    counts: { creators, spacers, rimProtectors, posts, passers } };
};

/**
 * Build a legal, COHERENT five whose summed card rating lands as close as
 * possible to `targetRating`.
 *
 * Coherence is a hard constraint here, not a tie-break. An earlier version
 * scored it only at the end and returned 0/5 coherent controls: interior
 * scoring is the scarce requirement (16 of 292 non-holdout cards reach
 * postThreat 5.5) and a rating-targeted beam prunes those cards away long
 * before coherence is ever evaluated. So the search anchors on the two scarce
 * requirements first and fills the rest to the rating target.
 *
 * Deterministic throughout: candidate ordering, anchor ordering and tie-breaks
 * are all by explicit key then card id.
 */
export const buildControlFive = ({ targetRating, exclude = new Set(), anchorLimit = 12, beam = 24 }) => {
  const eligible = SLOTS.map((slot) => PLAYERS
    .filter((c) => (c.positions ?? [c.pos]).includes(slot) && !exclude.has(person(c.id))));
  const prof = new Map();
  const pr = (id) => { if (!prof.has(id)) prof.set(id, profileOf(id)); return prof.get(id); };
  const isPost = (id) => (pr(id).offense?.postThreat ?? 0) >= 5.5;
  const isRim = (id) => (pr(id).defense?.rimDeterrence ?? 0) >= 5.5;
  const isSpacer = (id) => (pr(id).offense?.spacingGravity ?? 0) >= 6;
  const isPasser = (id) => (pr(id).offense?.passingVision ?? 0) >= 6;
  const isCreator = (id) => (pr(id).offense?.selfCreation ?? 0) >= 6.5;

  // Anchor candidates: (slot, post-capable card) and (slot, rim-capable card),
  // ranked by how close the card sits to an even per-slot share of the target.
  const perSlot = targetRating / 5;
  const anchorsFor = (test) => SLOTS.flatMap((_, i) => eligible[i].filter((c) => test(c.id))
    .map((c) => ({ slot: i, id: c.id, rating: cardRating(c) })))
    .sort((a, b) => Math.abs(a.rating - perSlot) - Math.abs(b.rating - perSlot) || a.id.localeCompare(b.id))
    .slice(0, anchorLimit);
  const postAnchors = anchorsFor(isPost);
  const rimAnchors = anchorsFor(isRim);
  if (!postAnchors.length) throw new Error("no non-holdout card satisfies the interior-scoring requirement");
  if (!rimAnchors.length) throw new Error("no non-holdout card satisfies the rim-protection requirement");

  /** Fill the unassigned slots toward the remaining rating, keeping a beam. */
  const fill = (fixed) => {
    let states = [{ ids: [...fixed.ids], used: new Set(fixed.used), rating: fixed.rating }];
    for (let i = 0; i < 5; i++) {
      if (states[0].ids[i]) continue;
      const remainingSlots = SLOTS.filter((_, j) => j >= i && !states[0].ids[j]).length;
      const next = [];
      for (const st of states) {
        const want = (targetRating - st.rating) / Math.max(1, remainingSlots);
        const pool = eligible[i].filter((c) => !st.used.has(person(c.id)))
          .sort((a, b) => Math.abs(cardRating(a) - want) - Math.abs(cardRating(b) - want) || a.id.localeCompare(b.id))
          .slice(0, beam);
        for (const c of pool) {
          const ids = [...st.ids]; ids[i] = c.id;
          next.push({ ids, used: new Set([...st.used, person(c.id)]), rating: st.rating + cardRating(c) });
        }
      }
      if (!next.length) return [];
      next.sort((a, b) => Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating)
        || a.ids.join().localeCompare(b.ids.join()));
      states = next.slice(0, beam * 6);
    }
    return states;
  };

  const complete = [];
  for (const pa of postAnchors) {
    for (const ra of rimAnchors) {
      const ids = new Array(5).fill(null);
      const used = new Set();
      let rating = 0;
      const place = (a) => {
        if (ids[a.slot]) return a.id === ids[a.slot];          // same card, same slot: fine
        if (used.has(person(a.id))) return false;               // that person is already in
        ids[a.slot] = a.id; used.add(person(a.id)); rating += a.rating; return true;
      };
      if (!place(pa)) continue;
      if (!place(ra)) continue;
      for (const st of fill({ ids, used, rating })) {
        const coh = coherenceOf(st.ids);
        if (!coh.coherent) continue;
        complete.push({ ...st, coh, anchors: { post: pa.id, rim: ra.id } });
      }
    }
  }
  if (!complete.length) {
    throw new Error(`no coherent legal five reachable at target rating ${r5(targetRating)} from the non-holdout pool`);
  }
  complete.sort((a, b) => Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating)
    || a.ids.join().localeCompare(b.ids.join()));
  const best = complete[0];
  return { five: best.ids, summedRating: r5(best.rating), targetRating: r5(targetRating),
    ratingError: r5(best.rating - targetRating), coherence: best.coh, anchors: best.anchors,
    coherentCandidatesFound: complete.length,
    rule: "anchor on the scarce coherence requirements (an interior scorer and a rim protector), fill the remaining slots by rating-targeted beam search one card per person, keep only fully coherent fives, then take the one closest to the target rating; all ordering deterministic by key then card id" };
};

// ── the surfaces ────────────────────────────────────────────────────────────
export const SURFACE_DEFS = Object.freeze({
  MIRROR: { id: "MIRROR",
    definition: "the fixture five against ITSELF under its own coach, side-balanced across paired seeds. Construction is the only variable, so an action-mix, variance or structural result cannot be an artifact of the opponent.",
    decides: ["requireZeroInvariantFailures", "requireZeroImpossibleResults", "forbidUniversalActionDominance", "requireSameSeedReplay", "requireNewSeedVariance"],
    cannotDecide: ["forbidUniversalShellDominance — both sides draw zone with equal probability, so the zone side is noise and the win rate is pinned to 0.5",
      "requireConstructionCanBeatHigherOvr and requireExtremeTalentRemainsMeaningful — both need two DIFFERENT constructions"],
    usesFixtureCoach: true },
  ZONE_ASYMMETRIC: { id: "ZONE_ASYMMETRIC",
    definition: "the fixture five on BOTH sides, personnel therefore exactly controlled, with the frozen zone-heavy coach on one side and the frozen matched man coach on the other, side-balanced. A zone side exists by design rather than by chance, so a shell win rate is defined.",
    decides: ["forbidUniversalShellDominance"],
    requiresZoneLegalEra: true, usesFixtureCoach: false,
    confound: "changing the coach changes every other scheme dimension too, not only the shell. The residual distance is minimised by the pair-selection rule and measured by the twin below.",
    twin: "ZONE_ASYMMETRIC_ILLEGAL_ERA_CONTROL" },
  ZONE_ASYMMETRIC_ILLEGAL_ERA_CONTROL: { id: "ZONE_ASYMMETRIC_ILLEGAL_ERA_CONTROL",
    definition: "the identical construction in a zone-ILLEGAL era, where the engine cannot realize a zone possession at all. Any win-rate deviation from 0.5 here is the coach confound with the shell removed, so the shell's own contribution is the difference between the two surfaces.",
    decides: [], diagnosticFor: "forbidUniversalShellDominance", usesFixtureCoach: false },
  VS_COHERENT_LOWER_CONTROL: { id: "VS_COHERENT_LOWER_CONTROL",
    definition: "the fixture five against a coherent five built to a summed card rating strictly BELOW the fixture's, under the neutral coach on both sides so coaching cannot explain the result. The only decidable surface for a construction-beats-talent claim, because it needs two different constructions and a known rating direction.",
    decides: ["requireConstructionCanBeatHigherOvr"], usesFixtureCoach: false, controlBuiltPerFixture: true },
  VS_TALENT_GAP_CONTROL: { id: "VS_TALENT_GAP_CONTROL",
    definition: "the fixture five against a coherent five separated from it by a large summed-rating gap, under the neutral coach on both sides. The gap runs in whichever direction the non-holdout pool can supply: if a five rated at or above fixture x 1.75 exists the fixture is the WEAK side and the control must clearly win; otherwise the control is built at or below fixture / 1.75 and the fixture is the STRONG side and must clearly win. The guardrail is symmetric — it asks that a large talent gap still decides games, not which side holds the talent — so either direction decides it.",
    decides: ["requireExtremeTalentRemainsMeaningful"], usesFixtureCoach: false, controlBuiltPerFixture: true,
    poolConstraint: "the sealed set holds many of the strongest cards in the pool. Once every person appearing in any sealed fixture is excluded, the best available control five sums to 294.41, which is below the two highest-rated fixtures. The direction rule exists so that constraint cannot silently disable the guardrail." },
});

/** Per-fixture control rating targets. Frozen multipliers. */
export const CONTROL_TARGETS = Object.freeze({ lowerControlFactor: 0.80, eliteControlFactor: 1.75 });

export const planFor = (fixtures) => {
  const pair = chooseShellCoachPair();
  const holdoutPersons = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.flatMap((f) => f.five.map(person)));
  // Applicability comes from the guardrail registry, never from a second list
  // maintained here, so the two artifacts cannot drift apart.
  const { guardrails } = buildRegistry();
  const appliesTo = (guardrailId, fixtureId) =>
    guardrails.find((g) => g.guardrailId === guardrailId)?.fixtureIds.includes(fixtureId) ?? false;
  return fixtures.map((f) => {
    const rating = r5(f.five.reduce((a, id) => a + cardRating(findCard(id)), 0));
    const zoneLegal = zoneLegalIn(f.era);
    // Controls exclude every person appearing anywhere in the sealed set, so a
    // control five can never be a partial reconstruction of a holdout lineup.
    const needsLower = appliesTo("requireConstructionCanBeatHigherOvr", f.id);
    const needsGap = appliesTo("requireExtremeTalentRemainsMeaningful", f.id);
    const lower = needsLower
      ? buildControlFive({ targetRating: rating * CONTROL_TARGETS.lowerControlFactor, exclude: holdoutPersons })
      : null;
    // Direction rule: try the elite side first; fall back to the weak side when
    // the non-holdout pool cannot out-rate the fixture by the frozen factor.
    let gap = null;
    if (needsGap) {
      const up = buildControlFive({ targetRating: rating * CONTROL_TARGETS.eliteControlFactor, exclude: holdoutPersons });
      if (up.summedRating >= rating * CONTROL_TARGETS.eliteControlFactor * 0.97) {
        gap = { ...up, direction: "CONTROL_IS_STRONG_SIDE", strongSide: "CONTROL",
          requiredRatio: CONTROL_TARGETS.eliteControlFactor, achievedRatio: r5(up.summedRating / rating) };
      } else {
        const down = buildControlFive({ targetRating: rating / CONTROL_TARGETS.eliteControlFactor, exclude: holdoutPersons });
        gap = { ...down, direction: "FIXTURE_IS_STRONG_SIDE", strongSide: "FIXTURE",
          requiredRatio: r5(1 / CONTROL_TARGETS.eliteControlFactor), achievedRatio: r5(down.summedRating / rating),
          fellBackBecause: `no non-holdout five reaches fixture rating ${rating} x ${CONTROL_TARGETS.eliteControlFactor}; the best available sums to ${up.summedRating}` };
      }
    }
    return { fixtureId: f.id, purpose: f.purpose, era: f.era, fixtureCoach: f.coach,
      fixtureSummedRating: rating, fixtureCoherence: coherenceOf(f.five),
      zoneLegalEra: zoneLegal,
      surfaces: {
        MIRROR: { applicable: true, coachBothSides: f.coach },
        ZONE_ASYMMETRIC: zoneLegal
          ? { applicable: true, zoneCoachId: pair.zoneCoachId, manCoachId: pair.manCoachId }
          : { applicable: false, reason: `zone is illegal in ${f.era}, so no zone possession can be realized and no shell win rate exists`,
              structuralExpectationInstead: "realized zone possessions must be exactly 0" },
        VS_COHERENT_LOWER_CONTROL: needsLower
          ? { applicable: true, control: lower,
              precondition: `control summed rating ${lower.summedRating} < fixture ${rating}`,
              preconditionMet: lower.summedRating < rating,
              coherencePrecondition: "the control must satisfy every coherence check, otherwise the surface is not testing coherent-versus-warped construction",
              coherencePreconditionMet: lower.coherence.coherent }
          : { applicable: false, reason: "requireConstructionCanBeatHigherOvr does not map to this fixture in the guardrail registry" },
        VS_TALENT_GAP_CONTROL: needsGap
          ? { applicable: true, control: gap, direction: gap.direction, strongSide: gap.strongSide,
              precondition: gap.direction === "CONTROL_IS_STRONG_SIDE"
                ? `control ${gap.summedRating} >= fixture ${rating} x ${CONTROL_TARGETS.eliteControlFactor}`
                : `control ${gap.summedRating} <= fixture ${rating} / ${CONTROL_TARGETS.eliteControlFactor}`,
              preconditionMet: gap.direction === "CONTROL_IS_STRONG_SIDE"
                ? gap.summedRating >= rating * CONTROL_TARGETS.eliteControlFactor * 0.97
                : gap.summedRating <= rating / CONTROL_TARGETS.eliteControlFactor * 1.03 }
          : { applicable: false, reason: "requireExtremeTalentRemainsMeaningful does not map to this fixture in the guardrail registry" },
      } };
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const pair = chooseShellCoachPair();
  const holdoutPersons2 = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.flatMap((f) => f.five.map(person)));
  const holdoutPlan = planFor(SYNTHETIC_STRESS_HOLDOUT_V2);
  const devPlan = planFor(SYNTHETIC_DEVELOPMENT_V2);
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  console.log("SYNTHETIC V2 MEASUREMENT SURFACES\n");
  console.log(`  shell coach pair: ${pair.zoneCoachId} (zone ${pair.zonePreferenceHigh}) vs ${pair.manCoachId} (zone ${pair.zonePreferenceLow}), other-dimension distance ${pair.otherDimensionDistance}, chosen from ${pair.candidatePairsConsidered} candidate pairs\n`);
  for (const p of holdoutPlan) {
    const l = p.surfaces.VS_COHERENT_LOWER_CONTROL, e = p.surfaces.VS_TALENT_GAP_CONTROL;
    const lTxt = l.applicable ? `lower ${String(l.control.summedRating).padStart(6)}${l.preconditionMet && l.coherencePreconditionMet ? " ok" : " XX"}` : "lower      -   ";
    const eTxt = e.applicable ? `gap ${String(e.control.summedRating).padStart(6)} ${e.strongSide.padEnd(7)}${e.preconditionMet ? " ok" : " XX"}` : "gap      -           ";
    console.log(`  ${p.fixtureId.padEnd(30)} ${p.era}  rating ${String(p.fixtureSummedRating).padStart(6)}  zone ${p.zoneLegalEra ? "LEGAL " : "illegal"}  ${lTxt}  ${eTxt}  coh ${p.fixtureCoherence.satisfied}/6`);
  }
  const zoneDecidable = holdoutPlan.filter((p) => p.zoneLegalEra);
  console.log(`\n  zone-decidable fixtures: ${zoneDecidable.length}/16 — ${zoneDecidable.map((p) => p.fixtureId).join(", ")}`);
  console.log(`  zone-illegal fixtures held to "realized zone === 0": ${16 - zoneDecidable.length}\n`);

  gate("everyGuardrailHasADecidingSurface",
    ["requireZeroInvariantFailures", "requireZeroImpossibleResults", "forbidUniversalActionDominance",
      "forbidUniversalShellDominance", "requireSameSeedReplay", "requireNewSeedVariance",
      "requireConstructionCanBeatHigherOvr", "requireExtremeTalentRemainsMeaningful"]
      .every((g) => Object.values(SURFACE_DEFS).some((s) => s.decides.includes(g))),
    "all 8 adjudicable guardrails are claimed by exactly one deciding surface");
  const lowerUsed = holdoutPlan.filter((p) => p.surfaces.VS_COHERENT_LOWER_CONTROL.applicable);
  const gapUsed = holdoutPlan.filter((p) => p.surfaces.VS_TALENT_GAP_CONTROL.applicable);
  gate("lowerControlPreconditionMetWhereTheSurfaceApplies",
    lowerUsed.length > 0 && lowerUsed.every((p) => p.surfaces.VS_COHERENT_LOWER_CONTROL.preconditionMet),
    `${lowerUsed.filter((p) => p.surfaces.VS_COHERENT_LOWER_CONTROL.preconditionMet).length}/${lowerUsed.length} applicable fixtures have a strictly lower-rated control`);
  gate("lowerControlIsItselfCoherent",
    lowerUsed.every((p) => p.surfaces.VS_COHERENT_LOWER_CONTROL.coherencePreconditionMet),
    `${lowerUsed.filter((p) => p.surfaces.VS_COHERENT_LOWER_CONTROL.coherencePreconditionMet).length}/${lowerUsed.length} lower controls satisfy every coherence check`);
  gate("talentGapPreconditionMetWhereTheSurfaceApplies",
    gapUsed.length > 0 && gapUsed.every((p) => p.surfaces.VS_TALENT_GAP_CONTROL.preconditionMet),
    `${gapUsed.filter((p) => p.surfaces.VS_TALENT_GAP_CONTROL.preconditionMet).length}/${gapUsed.length} applicable fixtures reach the frozen rating gap (directions: ${gapUsed.map((p) => p.surfaces.VS_TALENT_GAP_CONTROL.direction).join(", ")})`);
  const allControlIds = (plan) => plan.flatMap((p) => [p.surfaces.VS_COHERENT_LOWER_CONTROL.control?.five ?? [],
    p.surfaces.VS_TALENT_GAP_CONTROL.control?.five ?? []]).flat();
  gate("noControlBorrowsAHoldoutPerson",
    allControlIds(holdoutPlan).every((id) => !holdoutPersons2.has(person(id))),
    "no control five contains any person who appears in any sealed fixture, so a control cannot partially reconstruct a holdout lineup");
  gate("everyControlIsLegalAndPersonUnique",
    [...holdoutPlan, ...devPlan].every((p) => [p.surfaces.VS_COHERENT_LOWER_CONTROL.control, p.surfaces.VS_TALENT_GAP_CONTROL.control]
      .filter(Boolean).every(({ five }) => five.length === 5 && new Set(five.map(person)).size === 5
        && five.every((id, i) => (findCard(id).positions ?? [findCard(id).pos]).includes(SLOTS[i])))),
    "every control five fills all five slots legally with five distinct people");
  gate("shellCoachPairIsMinimallyConfounded", pair.zonePreferenceGap >= 6 && pair.otherDimensionDistance < 6,
    `zonePreference gap ${pair.zonePreferenceGap}, residual distance ${pair.otherDimensionDistance} across the other ten dimensions`);
  gate("zoneIllegalFixturesHaveAStructuralExpectation",
    holdoutPlan.filter((p) => !p.zoneLegalEra).every((p) => p.surfaces.ZONE_ASYMMETRIC.structuralExpectationInstead),
    `${16 - zoneDecidable.length} zone-illegal fixtures are held to a structural zero-zone expectation rather than silently skipped`);

  const payload = {
    syntheticSurfacePlanVersion: "1.0.0",
    surfaces: SURFACE_DEFS, controlTargets: CONTROL_TARGETS,
    shellCoachPair: pair,
    zoneLegalityByEra: Object.fromEntries(ERAS.map((e) => [e.id, zoneLegalIn(e.id)])),
    coherenceDefinition: {
      basis: "the intelligence profile, not card accolades",
      checks: { hasALeadCreator: "at least one player with selfCreation >= 6.5",
        creationNotCollided: "no more than three such players", hasSpacing: "at least two players with spacingGravity >= 6",
        hasRimProtection: "at least one player with rimDeterrence >= 5.5",
        hasInteriorScoring: "at least one player with postThreat >= 5.5",
        hasAPasser: "at least one player with passingVision >= 6" } },
    holdoutFixturePlan: holdoutPlan, developmentFixturePlan: devPlan,
    zoneDecidableFixtureCount: zoneDecidable.length,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.surfacePlanHash = createHash("sha256").update(JSON.stringify(holdoutPlan.map((p) => [p.fixtureId,
    p.surfaces.VS_COHERENT_LOWER_CONTROL.control?.five ?? null,
    p.surfaces.VS_TALENT_GAP_CONTROL.control?.five ?? null, p.zoneLegalEra]))).digest("hex");
  writeArtifact("synthetic-v2-surface-plan", payload, {
    generationCommand: "npm run syn:surfaces", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nSURFACE PLAN: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.surfacePlanHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
