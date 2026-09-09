// ── Targeted mechanic exercise contracts ────────────────────────────────────
// One contract per active parameter, declaring how to PROVE its mechanic ran
// before any judgement about its effect.
//
// Phase 6C2C4 measured every parameter against game-level distributions and
// filed 37 as NO_MEASURABLE_EFFECT. That method cannot see a parameter which
// only acts in a rare conditional context: a zone corner scalar matters when a
// zone is live and a corner is attacked, and a whole-game average dilutes that
// to nothing. A conditional effect measured over the possessions where the
// mechanic actually occurred is a different and fairer question.
//
// Each contract names:
//   activation  — a ledger predicate plus a minimum count. Until it is met the
//                 parameter is UNDER_EXERCISED, not ineffective.
//   conditional — metrics computed over ONLY the activated possessions.
//   guardrails  — metrics that must stay put, catching a parameter that reaches
//                 a domain it should not.
import { createHash } from "node:crypto";
import { versionOf } from "../../versions.js";

export const TARGETED_FIXTURE_VERSION = versionOf("targetedMechanicFixtureVersion");

// ── Ledger predicates ───────────────────────────────────────────────────────
// Named so a contract reads as basketball rather than as field access.
export const PREDICATES = Object.freeze({
  anyShot: (r) => typeof r.shot === "string",
  shotAt: (loc) => (r) => r.shot === loc,
  action: (...fams) => (r) => fams.includes(r.action),
  mismatch: (sev) => (r) => r.mismatchSeverity === sev,
  zonePossession: (r) => /ZONE|HIGH_POST_ENTRY|CORNER_SPOT_UP|SHORT_CORNER|SKIP_PASS|BASELINE_CUT|TOP_OF_KEY/.test(r.action ?? ""),
  // The gap is recorded in `variant`, not `action`: a zone possession has
  // action "ZONE_ATTACK" and variant "HIGH_POST_ENTRY" / "CORNER_SPOT_UP".
  // Reading `action` matched nothing and reported 0 activated possessions —
  // an instrumentation defect of exactly the kind that produced 6C2C4's
  // no-effect verdicts.
  zoneGap: (...gaps) => (r) => gaps.some((g) => (r.variant ?? "").includes(g)),
  // Saturation and form bind only once enough possessions have accumulated for a
  // realized share to exist, so the early game is not the place to look.
  afterWarmup: (n) => (r) => r.i > n,
  lateGame: (r) => r.period >= 4,
  // Verified against the ledger: the outcome vocabulary is MADE_FG, MISS_DREB,
  // MISS_OREB, SHOOTING_FOUL, TURNOVER_STOLEN, TURNOVER_UNFORCED.
  freeThrowTrip: (r) => r.outcome === "SHOOTING_FOUL",
  always: () => true,
});

/**
 * Conditional metric extractors. Each receives the ACTIVATED subset of ledger
 * rows plus the game, and returns one number.
 */
export const CONDITIONAL = Object.freeze({
  count: (rows) => rows.length,
  // Field-goal percentage, stated explicitly rather than inferred from points.
  // Verified: rows carrying a `shot` location string number exactly the combined
  // FGA, and outcome === "MADE_FG" numbers exactly the combined FGM. Counting
  // `points > 0` happened to agree ON SHOT ROWS, but would have counted an
  // and-one free throw as a field-goal make anywhere the filter was looser.
  makeRate: (rows) => {
    const attempts = rows.filter((r) => typeof r.shot === "string");
    return attempts.length ? attempts.filter((r) => r.outcome === "MADE_FG").length / attempts.length : null;
  },
  // `points` is undefined on non-scoring rows, which is correctly read as zero.
  // Note this counts FIELD-GOAL points on the possession row; free-throw points
  // from a shooting foul are only partly carried here, so this is a possession
  // scoring rate rather than a full points-per-possession.
  pointsPerPossession: (rows) => (rows.length ? rows.reduce((a, r) => a + (r.points ?? 0), 0) / rows.length : null),
  expectedMake: (rows) => {
    const xs = rows.map((r) => r.expectedMake).filter((x) => Number.isFinite(x));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  },
  // Share of the activated subset taken by its most frequent primary player.
  primaryConcentration: (rows) => {
    if (!rows.length) return null;
    const c = {};
    for (const r of rows) if (r.primary) c[r.primary] = (c[r.primary] ?? 0) + 1;
    const vals = Object.values(c);
    return vals.length ? Math.max(...vals) / rows.length : null;
  },
  distinctPrimaries: (rows) => new Set(rows.map((r) => r.primary).filter(Boolean)).size,
  locationShare: (loc) => (rows) => {
    const shots = rows.filter((r) => typeof r.shot === "string");
    return shots.length ? shots.filter((r) => r.shot === loc).length / shots.length : null;
  },
  actionShare: (fam) => (rows, game) => {
    const all = game.possessionLedger ?? [];
    return all.length ? all.filter((r) => r.action === fam).length / all.length : null;
  },
  // Distance of the realised action mix from a flat mix, i.e. how far the
  // offence departs from "everything equally likely".
  mixDistanceFromNeutral: (rows, game) => {
    const all = game.possessionLedger ?? [];
    if (!all.length) return null;
    const c = {};
    for (const r of all) c[r.action] = (c[r.action] ?? 0) + 1;
    const fams = Object.keys(c);
    if (!fams.length) return null;
    const flat = 1 / fams.length;
    return Math.sqrt(fams.reduce((a, f) => a + ((c[f] / all.length) - flat) ** 2, 0));
  },
  adjustmentCount: (rows, game) =>
    (game.offense?.gold?.adjustments?.length ?? 0) + (game.offense?.blue?.adjustments?.length ?? 0),
  possessions: (rows, game) => game.gold.totals.possessions,
  ftaPerPossession: (rows, game) => game.gold.totals.fta / (game.gold.totals.possessions || 1),
  threeRate: (rows, game) => game.gold.totals.tpa / (game.gold.totals.fga || 1),
});

const opportunityGuardrails = ["possessions", "makeRateAll"];

/** Fixture families, referenced by contract. Resolved by the harness. */
export const FIXTURE_SETS = Object.freeze({
  general: ["era-2010s", "balanced-vs-creators", "coach-mike-dantoni-vs-jerry-sloan"],
  zone: ["real-zone-nick-nurse", "real-zone-erik-spoelstra", "real-zone-rick-carlisle", "real-zone-don-nelson"],
  mismatch: ["synthdev-sd2-elite-shooting", "balanced-vs-creators", "era-1960s", "shooters-vs-bigs"],
  preThree: ["era-1950s", "era-1960s", "era-1970s"],
  coach: ["coach-phil-jackson-vs-gregg-popovich", "coach-red-auerbach-vs-pat-riley",
    "coach-mike-dantoni-vs-jerry-sloan", "coach-neutral-vs-neutral"],
  allEras: ["era-1950s", "era-1960s", "era-1970s", "era-1980s", "era-1990s", "era-2000s", "era-2010s", "era-2020s"],
  construction: ["balanced-vs-creators", "shooters-vs-bigs", "synthdev-sd2-extreme-size", "synthdev-sd2-extreme-small"],
});

const C = (o) => Object.freeze(o);

/** The contracts. Every active parameter must appear here. */
export const EXERCISE_CONTRACTS = Object.freeze({
  // ── Opportunity saturation ────────────────────────────────────────────────
  // Saturation pushes back on a player already above his target share, so the
  // context is post-warmup possessions, not the whole game.
  "opportunity.saturation.strength": C({ fixtures: "construction", activation: { predicate: "afterWarmup:16", min: 200 },
    conditional: ["primaryConcentration", "distinctPrimaries"], guardrails: opportunityGuardrails,
    expectedDirection: "higher strength lowers concentration", context: "possessions after the warmup window" }),
  "opportunity.saturation.floor": C({ fixtures: "construction", activation: { predicate: "afterWarmup:16", min: 200 },
    conditional: ["primaryConcentration"], guardrails: opportunityGuardrails,
    expectedDirection: "higher floor raises the ceiling a saturated player can reach", context: "post-warmup possessions" }),
  "opportunity.saturation.underTargetCeiling": C({ fixtures: "construction", activation: { predicate: "afterWarmup:16", min: 200 },
    conditional: ["distinctPrimaries", "primaryConcentration"], guardrails: opportunityGuardrails,
    expectedDirection: "higher ceiling spreads opportunity to under-target players", context: "post-warmup possessions" }),
  "opportunity.saturation.warmupPossessions": C({ fixtures: "construction", activation: { predicate: "always", min: 200 },
    conditional: ["primaryConcentration"], guardrails: opportunityGuardrails,
    expectedDirection: "a longer warmup delays saturation, raising early concentration", context: "whole game" }),

  // ── Mismatch bias: only the possessions where that severity is present ─────
  ...Object.fromEntries([["severe", "SEVERE"], ["major", "MAJOR"], ["moderate", "MODERATE"], ["minor", "MINOR"]]
    .map(([key, sev]) => [`opportunity.mismatch.${key}`, C({
      fixtures: "mismatch", activation: { predicate: `mismatch:${sev}`, min: 150 },
      conditional: ["primaryConcentration", "count", "pointsPerPossession"],
      guardrails: opportunityGuardrails,
      expectedDirection: "a larger bias concentrates the mismatch possessions on its beneficiary",
      context: `possessions carrying a ${sev} mismatch`,
    })])),

  "opportunity.form.low": C({ fixtures: "construction", activation: { predicate: "afterWarmup:16", min: 200 },
    conditional: ["primaryConcentration", "distinctPrimaries"], guardrails: opportunityGuardrails,
    expectedDirection: "a lower floor widens nightly spread", context: "post-warmup possessions" }),
  "opportunity.form.high": C({ fixtures: "construction", activation: { predicate: "afterWarmup:16", min: 200 },
    conditional: ["primaryConcentration", "distinctPrimaries"], guardrails: opportunityGuardrails,
    expectedDirection: "a higher ceiling widens nightly spread", context: "post-warmup possessions" }),
  "opportunity.lateGame.primaryBoost": C({ fixtures: "general", activation: { predicate: "lateGame", min: 150 },
    conditional: ["primaryConcentration", "distinctPrimaries"], guardrails: opportunityGuardrails,
    expectedDirection: "a larger boost concentrates late possessions on the primary creator",
    context: "fourth-quarter and overtime possessions" }),

  // ── Fit bands: only the possessions of that action family ─────────────────
  ...Object.fromEntries([
    ["SPOT_UP", "general"], ["OFF_BALL_SCREEN", "general"], ["POST_UP", "construction"],
    ["HANDOFF", "general"], ["ZONE_ATTACK", "zone"], ["CUT", "general"],
    ["ISOLATION", "construction"], ["PICK_AND_ROLL", "general"], ["TRANSITION", "general"],
    ["GENERIC_HALF_COURT", "general"],
  ].flatMap(([fam, set]) => ["lo", "hi"].map((end) => [`fitBand.${fam}.${end}`, C({
    fixtures: set,
    activation: { predicate: fam === "ZONE_ATTACK" ? "zonePossession" : `action:${fam}`, min: 100 },
    conditional: ["primaryConcentration", "distinctPrimaries", "count"],
    guardrails: opportunityGuardrails,
    expectedDirection: end === "lo"
      ? "a higher floor lets poorer fits take the action, spreading it"
      : "a higher ceiling lets the best fit take more of the action",
    context: `${fam} possessions only`,
  })]))),

  // ── Shot location: measured on the shot distribution, not team FG% ────────
  "shotLocation.rimWeight": C({ fixtures: "allEras", activation: { predicate: "anyShot", min: 400 },
    conditional: ["locationShare:RIM", "locationShare:PAINT_OR_POST"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "higher weight raises rim share", context: "all shot possessions" }),
  "shotLocation.postWeight": C({ fixtures: "allEras", activation: { predicate: "anyShot", min: 400 },
    conditional: ["locationShare:PAINT_OR_POST"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "higher weight raises paint share", context: "all shot possessions" }),
  "shotLocation.midrangeWeight": C({ fixtures: "allEras", activation: { predicate: "anyShot", min: 400 },
    conditional: ["locationShare:MIDRANGE"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "higher weight raises midrange share", context: "all shot possessions" }),
  "shotLocation.threeWeight": C({ fixtures: "allEras", activation: { predicate: "anyShot", min: 400 },
    conditional: ["locationShare:THREE_POINT", "threeRate"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "higher weight raises three share where the line exists", context: "all shot possessions" }),
  "shotLocation.rimBiasMultiplier": C({ fixtures: "general",
    activation: { predicate: "action:PICK_AND_ROLL,TRANSITION,CUT", min: 150 },
    conditional: ["locationShare:RIM"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "higher multiplier raises rim share within rim-biased actions",
    context: "rim-biased action possessions" }),
  "shotLocation.perimeterBiasMultiplier": C({ fixtures: "general",
    activation: { predicate: "action:SPOT_UP,OFF_BALL_SCREEN,HANDOFF", min: 150 },
    conditional: ["locationShare:THREE_POINT"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "higher multiplier raises three share within perimeter actions",
    context: "perimeter action possessions" }),

  // ── Conversion: measured on makes CONDITIONAL on that location ────────────
  "conversion.rimBonus": C({ fixtures: "allEras", activation: { predicate: "shotAt:RIM", min: 300 },
    conditional: ["makeRate", "expectedMake"], guardrails: ["possessions", "rimShareGuard"],
    expectedDirection: "a larger bonus raises rim conversion", context: "rim attempts only" }),
  "conversion.paintBonus": C({ fixtures: "allEras", activation: { predicate: "shotAt:PAINT_OR_POST", min: 300 },
    conditional: ["makeRate", "expectedMake"], guardrails: ["possessions"],
    expectedDirection: "a larger bonus raises paint conversion", context: "paint attempts only" }),
  "conversion.midrangePenalty": C({ fixtures: "allEras", activation: { predicate: "shotAt:MIDRANGE", min: 300 },
    conditional: ["makeRate", "expectedMake"], guardrails: ["possessions"],
    expectedDirection: "a less negative penalty raises midrange conversion", context: "midrange attempts only" }),

  // ── Era environment ───────────────────────────────────────────────────────
  "era.paceTempoScale": C({ fixtures: "allEras", activation: { predicate: "always", min: 200 },
    conditional: ["possessions"], guardrails: ["makeRateAll"],
    expectedDirection: "a larger scale lets coach tempo move pace further", context: "whole game" }),
  "era.paceBoundFraction": C({ fixtures: "allEras", activation: { predicate: "always", min: 200 },
    conditional: ["possessions"], guardrails: ["makeRateAll"],
    expectedDirection: "a wider band permits more pace deviation — only when the band binds",
    context: "whole game", suspectedGuardrail: true }),
  "era.threeAnchorMax": C({ fixtures: "allEras", activation: { predicate: "anyShot", min: 400 },
    conditional: ["locationShare:THREE_POINT", "threeRate"], guardrails: ["possessions"],
    expectedDirection: "a lower clamp caps the three-point anchor — only when the clamp binds",
    context: "all shot possessions", suspectedGuardrail: true }),
  "era.freeThrowTripRate": C({ fixtures: "allEras", activation: { predicate: "always", min: 200 },
    conditional: ["ftaPerPossession"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "a higher trip rate raises free-throw attempts", context: "whole game" }),

  // ── Zone: only zone possessions, and only the relevant gap ───────────────
  "zone.highPostVulnerability": C({ fixtures: "zone", activation: { predicate: "zoneGap:HIGH_POST", min: 60 },
    conditional: ["count", "makeRate", "pointsPerPossession", "expectedMake"], guardrails: ["possessions"],
    expectedDirection: "higher vulnerability draws more high-post attacks and better looks",
    context: "high-post attacks against a live zone" }),
  "zone.cornerVulnerability": C({ fixtures: "zone", activation: { predicate: "zoneGap:CORNER", min: 60 },
    conditional: ["count", "makeRate", "pointsPerPossession", "expectedMake"], guardrails: ["possessions"],
    expectedDirection: "higher vulnerability draws more corner attacks and better looks",
    context: "corner attacks against a live zone" }),

  // ── Coach ─────────────────────────────────────────────────────────────────
  "coach.actionMixInfluence": C({ fixtures: "coach", activation: { predicate: "always", min: 200 },
    conditional: ["mixDistanceFromNeutral", "actionShare:PICK_AND_ROLL", "actionShare:POST_UP"],
    guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "a larger influence pushes the mix further from neutral", context: "whole game" }),
  "coach.rosterSensitivity": C({ fixtures: "coach", activation: { predicate: "always", min: 200 },
    conditional: ["mixDistanceFromNeutral", "actionShare:PICK_AND_ROLL", "actionShare:POST_UP"],
    guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "a larger sensitivity bends the mix toward roster strengths", context: "whole game" }),
  "coach.offensiveAdjustmentMinEvents": C({ fixtures: "coach", activation: { predicate: "always", min: 200 },
    conditional: ["adjustmentCount", "mixDistanceFromNeutral"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "a higher bar reduces adjustment count", context: "whole game" }),
  "coach.defensiveAdjustmentMinEvents": C({ fixtures: "coach", activation: { predicate: "always", min: 200 },
    conditional: ["adjustmentCount"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "a higher bar reduces defensive assignment changes", context: "whole game" }),
  "coach.offensiveAdjustmentCooldown": C({ fixtures: "coach", activation: { predicate: "always", min: 200 },
    conditional: ["adjustmentCount", "mixDistanceFromNeutral"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "a longer cooldown reduces adjustment count", context: "whole game" }),
  "coach.defensiveAdjustmentCooldown": C({ fixtures: "coach", activation: { predicate: "always", min: 200 },
    conditional: ["adjustmentCount"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "a longer cooldown reduces defensive assignment changes", context: "whole game" }),
  "coach.adjustmentMagnitude": C({ fixtures: "coach", activation: { predicate: "always", min: 200 },
    conditional: ["mixDistanceFromNeutral", "actionShare:SPOT_UP"], guardrails: ["possessions", "makeRateAll"],
    expectedDirection: "a larger step moves the action mix further per adjustment", context: "whole game" }),
});

export const contractsHash = () =>
  createHash("sha256").update(JSON.stringify(EXERCISE_CONTRACTS)).digest("hex");

export const missingContracts = (activeIds) => activeIds.filter((id) => !EXERCISE_CONTRACTS[id]);
export const orphanContracts = (activeIds) =>
  Object.keys(EXERCISE_CONTRACTS).filter((id) => !activeIds.includes(id));

/** Resolve a predicate string into a function. */
export const resolvePredicate = (spec) => {
  const [name, arg] = spec.split(":");
  if (name === "always") return PREDICATES.always;
  if (name === "anyShot") return PREDICATES.anyShot;
  if (name === "lateGame") return PREDICATES.lateGame;
  if (name === "zonePossession") return PREDICATES.zonePossession;
  if (name === "freeThrowTrip") return PREDICATES.freeThrowTrip;
  if (name === "shotAt") return PREDICATES.shotAt(arg);
  if (name === "mismatch") return PREDICATES.mismatch(arg);
  if (name === "action") return PREDICATES.action(...arg.split(","));
  if (name === "zoneGap") return PREDICATES.zoneGap(...arg.split(","));
  if (name === "afterWarmup") return PREDICATES.afterWarmup(Number(arg));
  throw new Error(`unknown activation predicate "${spec}"`);
};

/** Resolve a conditional-metric string into a function. */
export const resolveConditional = (spec) => {
  const [name, arg] = spec.split(":");
  if (name === "locationShare") return CONDITIONAL.locationShare(arg);
  if (name === "actionShare") return CONDITIONAL.actionShare(arg);
  const fn = CONDITIONAL[name];
  if (!fn) throw new Error(`unknown conditional metric "${spec}"`);
  return fn;
};
