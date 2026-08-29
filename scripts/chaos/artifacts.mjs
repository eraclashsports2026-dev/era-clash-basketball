#!/usr/bin/env node
// ── Phase 8A machine artifacts ───────────────────────────────────────────────
// Generated FROM the shipped code, so an artifact cannot drift from what runs.
import fs from "node:fs";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { ODDS, CHAOS_DRAFT_VERSION, DRAFT_PROBABILITY_VERSION, ROLLS, DRAFT_PRESSURE_TOOLTIP, drawFive } from "../../src/chaos/draftOdds.js";
import { DRAFT_VALUE_VERSION, TIER_BOUNDS, TIERS } from "../../src/chaos/draftValue.js";
import { PHASES, DRAFT_VERSIONS, RUN_TTL_SECONDS, revealEra } from "../../src/chaos/runState.js";
import { OFFER_ROLES, ROLE_LABEL, ROLE_BLURB, COACH_OFFER_VERSION, generateOffers, explainOffer, offenseIdentity, systemFamily } from "../../src/chaos/coachOffers.js";
import { LEGEND_CPU_VERSION, VISIBLE_STATE_KEYS, FORBIDDEN_STATE_KEYS } from "../../src/chaos/legendCpu.js";
import { CONSTRUCTION_TIERS, CONSTRUCTION_VERSION, TALENT_TIERS, CONSTRUCTION_BLURB, _bands } from "../../src/chaos/construction.js";
import { CHALLENGE_MANIFEST_VERSION, FORBIDDEN_CHALLENGE_FIELDS, PUBLIC_CHALLENGE_FIELDS } from "../../src/chaos/challenge.js";
import { MATRIX, CAPABILITIES, FEATURE_FLAGS, MODES, GUEST_CHAOS_RUNS, ENTITLEMENT_VERSION } from "../../src/entitlements.js";
import { NARRATIVE_STATES, POLL_DELAYS_MS, MAX_POLLS } from "../../src/narrativeMachine.js";
import { SALIENCE_FLOOR } from "../../api/_lib/postgameStory.js";
import { CHAOS_ERA_IDS, ERA_TRANSLATION_VERSION } from "../../src/chaos/eraTranslation.js";
import { CHAOS_NAMESPACES } from "../../api/_lib/chaosRun.js";

const OUT = "data/validation/8a";
fs.mkdirSync(OUT, { recursive: true });
const w = (name, obj) => { fs.writeFileSync(`${OUT}/${name}`, JSON.stringify({ artifact: name.replace(/\.json$/, ""), phase: "8A", ...obj }, null, 2) + "\n"); console.log("wrote", name); };

w("chaos-draft-contract.json", {
  chaosDraftVersion: CHAOS_DRAFT_VERSION,
  totalRolls: ROLLS,
  phases: PHASES,
  versions: DRAFT_VERSIONS,
  runTtlSeconds: RUN_TTL_SECONDS,
  serverAuthoritative: true,
  clientMaySubmit: ["which slots to hold", "which of three OFFERED coaches to take", "a request to start or to publish a challenge"],
  clientMayNeverSubmit: ["player ids", "the CPU's holds", "the era", "coach offers", "the CPU's coach", "the draft seed", "draft versions"],
  transport: {
    route: "/api/game",
    reason: "The deployment is at its 13-function budget (12 API routes + middleware). A dedicated route would fail the build, so chaos actions ride the existing game route under a `chaosAction` discriminator.",
    actions: ["start", "view", "holds", "coach", "challenge", "simulate"],
  },
  invalidTransition: "refused without mutating the run",
  namespaces: CHAOS_NAMESPACES,
});

w("legend-cpu-policy.json", {
  version: LEGEND_CPU_VERSION,
  policy: "LEGEND",
  difficultySelector: "ABSENT — there is exactly one CPU policy and it is never weakened",
  newUserSupport: "guidance, never a weaker opponent",
  visibleStateKeys: VISIBLE_STATE_KEYS,
  forbiddenStateKeys: FORBIDDEN_STATE_KEYS,
  method: "Deterministic expected-value lookahead over the probability model across all 32 hold subsets.",
  preEraObjective: { talent: 0.42, construction: 0.30, eraAdaptability: 0.16, opponentInteraction: 0.12 },
  postEraObjective: { talent: 0.36, construction: 0.28, eraTranslation: 0.24, opponentInteraction: 0.12 },
  commitment: "The CPU's hold decision is computed and hashed BEFORE the user's holds are accepted, then revealed after.",
});

w("legend-cpu-fairness.json", {
  sameProbabilityModel: true, sameRollCount: true, sameBurnRules: true, sameEra: true,
  simulationBonus: "none", outcomeBonus: "none", futureCardKnowledge: "none",
  noPeekingProofs: {
    structural: "cpuHoldDecision() runs assertVisibleState(), which throws on any forbidden field. The run's seed is not a field on the visible state at all.",
    behavioural: "The lookahead samples the model on a policy-only RNG stream seeded from VISIBLE STATE ONLY, deliberately excluding the draw seed. Changing the run seed changes every actual future card while leaving the decision bit-identical.",
  },
  determinism: "Identical visible state always yields an identical decision, so a replay reproduces the CPU exactly.",
});

const sampleOffers = (() => {
  const g = drawFive({ seedId: "artifact-sample", side: "gold", roll: 3 });
  const b = drawFive({ seedId: "artifact-sample", side: "blue", roll: 3, opponentNames: Object.values(g).map((c) => c.name) });
  const offers = generateOffers({ roster: g, opponentRoster: b, eraId: "1990s", seedId: "artifact-sample", side: "gold" });
  return offers.map((o) => explainOffer({ offer: o, roster: g, opponentRoster: b, eraId: "1990s" }));
})();

w("coach-offer-contract.json", {
  version: COACH_OFFER_VERSION,
  offersPerSide: 3,
  roles: OFFER_ROLES.map((r) => ({ role: r, label: ROLE_LABEL[r], blurb: ROLE_BLURB[r] })),
  uniqueness: "Three distinct coaches, and distinctness is enforced on the OFFENSIVE IDENTITY and the DEFENSIVE SHELL — the two things the user actually reads.",
  flatBonuses: "none — a coach's effect emerges from roster supply, system demands, opponent interaction and era legality",
  fullLibrary: "Dream Matchup only; Chaos Clash deliberately offers three",
  explains: ["what offense will be run", "which players become central", "what opponent problem is targeted", "the defensive structure", "what the era permits or removes", "what the coach sacrifices"],
  hiddenScoresExposed: false,
  sample: sampleOffers,
});

const diversity = (() => {
  let sets = 0, sameOffense = 0, sameShell = 0, sameCentral = 0;
  for (let i = 0; i < 200; i++) {
    const g = drawFive({ seedId: `div${i}`, side: "gold", roll: 3 });
    const b = drawFive({ seedId: `div${i}`, side: "blue", roll: 3, opponentNames: Object.values(g).map((c) => c.name) });
    const eraId = CHAOS_ERA_IDS[i % CHAOS_ERA_IDS.length];
    const offers = generateOffers({ roster: g, opponentRoster: b, eraId, seedId: `div${i}`, side: "gold" });
    const ex = offers.map((o) => explainOffer({ offer: o, roster: g, opponentRoster: b, eraId }));
    sets++;
    if (new Set(ex.map((e) => e.offense)).size < 3) sameOffense++;
    if (new Set(ex.map((e) => e.defense)).size < 3) sameShell++;
    if (new Set(ex.map((e) => e.central)).size < 3) sameCentral++;
  }
  return { sets, setsWithARepeatedOffenseLine: sameOffense, setsWithARepeatedDefensiveLine: sameShell, setsWithARepeatedCentralLine: sameCentral };
})();
w("coach-offer-diversity.json", {
  method: "200 generated offer sets across all eight eras; a set fails if any two of its three offers print the same line.",
  ...diversity,
  defectFixed: "An earlier version derived the central players and the target from the ROSTER rather than the COACH, and labelled the offense from a fixed priority cascade. Three genuinely different staffs printed 'Runs a pick-and-roll offense' with identical follow-on sentences.",
});

w("legend-cpu-coach-policy.json", {
  method: "Weighs roster fit 0.40, opponent counter-value 0.30 and era translation 0.30 over its OWN three offers.",
  mayNotSimulate: "The policy has no access to a simulation function; it chooses from pregame information only.",
  commitment: "The CPU's coach is committed and hashed before the user's selection is revealed.",
});

w("matchup-outlook-contract.json", {
  pregameName: "Matchup Outlook", postgameName: "Before Tipoff",
  postgameSubtitle: "Stored before the simulation",
  qualitativeOnly: true, winProbability: "never shown", recomputedInPostgame: false,
  storedWith: "the result record, under `pregame`",
  shows: ["Talent tier", "Roster construction", "Best advantage", "Greatest risk", "Matchup to watch", "Era translation", "Coach plan contrast"],
});

w("chaos-challenge-contract.json", {
  manifestVersion: CHALLENGE_MANIFEST_VERSION,
  reproduces: ["Roll 1 for both teams", "the probability model", "burn rules", "the era reveal", "coach-offer rules", "the CPU policy", "draft versions"],
  branching: "nextDrawIdentity = seed + side + slot + roll + heldRosterFingerprint + burnedPersonFingerprint + draftVersions. Same decisions reproduce; different decisions branch deterministically.",
  publicFields: PUBLIC_CHALLENGE_FIELDS,
  forbiddenInLink: FORBIDDEN_CHALLENGE_FIELDS,
  seedLocation: "the server-side manifest only — the id is a one-way hash and the link carries nothing else",
});

w("chaos-draft-history-contract.json", {
  storedOn: "the result record, under `chaosDraft`",
  resultAffecting: false,
  stores: ["mode", "chaosRunId", "draft versions", "each roll's rosters and holds for both sides", "draft pressure by roll", "talent and construction tier by roll", "burned people", "the revealed era", "coach offers", "coach selections", "the CPU commitment hashes", "an opaque challenge id"],
  neverStores: ["the raw seed", "unrevealed future cards", "unchosen branches"],
  postgameDerives: ["Best hold", "Biggest gamble", "Era adaptation", "Coach decision", "CPU decision"],
  counterfactuals: "never claimed — the unchosen branch was not simulated",
});

w("mode-entitlement-contract.json", {
  version: ENTITLEMENT_VERSION,
  centralFunction: "can(tier, capability) in src/entitlements.js — the single decision point",
  oddsIndependence: "No module under src/chaos/** imports entitlements.js, and a test replays one seed with identical decisions as GUEST, FREE, PLUS and COMMISSIONER asserting a byte-identical draft path.",
  guestChaosRuns: GUEST_CHAOS_RUNS,
  guestCountAuthority: "server-side (chaos-guest:<session>), not plain localStorage",
  matrix: MATRIX,
  modes: MODES,
  featureFlags: FEATURE_FLAGS,
  billing: "not implemented in this phase; no checkout is shown",
  unavailablePaidCopy: "Membership feature — not active during private preview",
});

w("era-gauntlet-specification.json", {
  eraGauntletVersion: null, status: "PLANNED", featureFlag: false, entitlement: "PLUS",
  publicControl: "none — no dead button is shown",
  coreLoop: ["Chaos Draft", "play a game", "win", "carry one player forward", "reroll the other four", "new Era Reveal", "new coach offers", "a harder opponent", "continue across eras"],
  carryForward: { choice: "the player picks exactly one card to keep", constraint: "the kept card is removed from the redraw pool and its Draft Pressure persists into the next leg" },
  eraSequence: "Seeded per run and revealed one leg at a time, so a run cannot be pre-planned; each era is visited at most once.",
  difficulty: { source: "opponent roster quality only", explicitly: "CPU intelligence is ALWAYS Legend and is never scaled up or down" },
  runPersistence: "one open run per account, resumable, stored under a gauntlet namespace",
  failureState: "a loss ends the run; the run's history remains readable",
  rewards: "run length, era badges, and a shareable run summary — no draft-odds advantage of any kind",
  sameSeedChallenge: "a whole run is challengeable by its opening seed, with the same branching rules as a single Chaos Clash",
  crossSportPortability: "the loop is sport-agnostic: draft, environment reveal, carry-forward, escalating opponent",
  notBuiltInThisPhase: true,
});

w("postgame-story-contract.json", {
  deterministicOpening: {
    headline: "How <Winner> Won",
    availability: "immediate, computed server-side with the result; no provider involved",
    leadsWith: ["the decisive individual performance", "the mechanism (targeted matchup, movement, or the glass)", "where the game turned", "how it closed"],
    neverLeadsWith: ["the pregame prediction", "a generic 'comfortable win'", "chemistry", "a raw internal edge", "a candidate score"],
  },
  quarterFlow: { source: "period scores and possession position", phases: ["Early", "Mid", "Late"], clock: "NEVER fabricated — the engine records periods and possession order, not a wall clock" },
  keyMoments: { count: "3-5", salienceFloor: SALIENCE_FLOOR, diversity: "one moment per category" },
  matchupPatterns: { placement: "game-long behaviour only", duplication: "no sentence appears in both moments and patterns" },
  coaching: { adjustments: "named coach, quarter phase and score state", declined: "kept separate from applied", enums: "never printed raw" },
  draftConsequences: { source: "actual before/after roster evaluations", counterfactuals: "never claimed" },
});

w("enhanced-recap-state-machine.json", {
  states: NARRATIVE_STATES,
  pollDelaysMs: POLL_DELAYS_MS,
  maxPolls: MAX_POLLS,
  totalPollBudgetMs: POLL_DELAYS_MS.reduce((a, b) => a + b, 0),
  defect: {
    symptom: "the enhanced-analysis retry spun indefinitely",
    rootCause: "/api/narrative answers 202 {status:'pending'} while a generation lock is held. HTTP 202 satisfies res.ok, so the single-shot client returned `(await res.json()).narrative` — undefined — and reported SUCCESS, leaving the pending UI with no terminal state to move to.",
    reproduced: "yes, against the real client with a stubbed 202",
    fix: "an explicit state machine that polls 202 to a conclusion, bounds itself, classifies retryable vs unavailable, and cancels on unmount",
  },
  guarantees: ["every path reaches a terminal state", "polling is finite", "one provider call per attempt", "a stale response cannot replace a newer result", "the deterministic story is always visible"],
});

w("key-moment-salience-model.json", {
  salienceFloor: SALIENCE_FLOOR,
  select: "3-5, one per category, highest salience first, then read in chronological order",
  factors: ["magnitude of the swing", "score leverage at the time", "which period it happened in", "player impact", "rarity"],
  candidateTypes: ["unanswered team run", "period domination", "quarter takeover by a player", "defensive stand", "go-ahead score", "back-and-forth game", "closing stretch", "unusual individual performance"],
  periodWeights: { Q1: 0.35, Q2: 0.55, Q3: 0.8, Q4: 1.25, OT: 1.6 },
  defectFixed: "The previous selector emitted 'the last lead change' unconditionally, which surfaced an 8-7 first-quarter swing as a headline moment while a 32-16 fourth quarter went unmentioned. It also emitted a game-long mismatch that duplicated Matchup Patterns word for word.",
  padding: "a list is never padded below the floor — three real moments beat five with filler",
});

w("coaching-report-contract.json", {
  categories: ["Offensive scheme", "Defensive scheme", "In-game adjustments"],
  tone: "professional scouting report and broadcast film-room explanation, never raw telemetry",
  firstPersonQuotes: "never invented",
  namedCoaches: "adjustments say 'Coach <surname>', with particles kept (Coach Van Gundy, not Coach Gundy)",
  timeReferences: "quarter phase plus score state; no game clock exists to cite",
  declinedAdjustments: "listed separately as CONSIDERED BUT DECLINED, never presented as something that happened",
  enumTranslation: { switch_heavy: "switching ball screens aggressively", drop_heavy: "conservative drop coverage", MAN_ILLEGAL_DEFENSE: "Man-to-man defense under the era's illegal-defense rules" },
  targeting: "every targeted matchup carries its consequence in points; a possession count alone is not shown",
  emptyState: "No in-game adjustment was recorded.",
});

w("draft-value-model-tiers.json", {
  tiers: TIERS, bounds: TIER_BOUNDS, positionAware: true,
  constructionTiers: CONSTRUCTION_TIERS, talentTiers: TALENT_TIERS,
  constructionVersion: CONSTRUCTION_VERSION,
  constructionBands: _bands,
  constructionBlurbs: CONSTRUCTION_BLURB,
  separation: "Talent, Roster Construction and Matchup Fit are three separate concepts and are never collapsed into one number.",
});

console.log("\nartifacts written");
