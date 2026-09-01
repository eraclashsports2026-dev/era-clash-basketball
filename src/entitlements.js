// ── Central entitlement model ────────────────────────────────────────────────
// ONE function decides what a viewer may do: can(). Modes ask it; nothing else
// gates a feature. No payment processing exists in this phase and no fake
// checkout is ever shown.
//
// THE INVARIANT THAT MATTERS MOST
// Entitlement NEVER touches draft odds. can() is not imported by any module
// under src/chaos/**, and a test proves a GUEST, a FREE account, a PLUS
// subscriber and a COMMISSIONER draw byte-identical rosters from the same seed
// and the same decisions.
export const ENTITLEMENT_VERSION = "1.0.0";

export const TIERS = Object.freeze(["GUEST", "FREE", "PLUS", "COMMISSIONER"]);
const RANK = Object.freeze({ GUEST: 0, FREE: 1, PLUS: 2, COMMISSIONER: 3 });

export const CAPABILITIES = Object.freeze({
  CHAOS_CLASH: "CHAOS_CLASH",
  CHAOS_UNLIMITED: "CHAOS_UNLIMITED",
  DREAM_MATCHUP: "DREAM_MATCHUP",
  DAILY: "DAILY",
  CHALLENGES: "CHALLENGES",
  SAVED_HISTORY: "SAVED_HISTORY",
  BEST_OF_7: "BEST_OF_7",
  BEST_OF_7_TRIAL: "BEST_OF_7_TRIAL",
  WIN_82: "WIN_82",
  WIN_82_PREVIEW: "WIN_82_PREVIEW",
  TOURNAMENT_JOIN: "TOURNAMENT_JOIN",
  TOURNAMENT_CREATE: "TOURNAMENT_CREATE",
  ERA_GAUNTLET: "ERA_GAUNTLET",
  ADVANCED_RECAP: "ADVANCED_RECAP",
  // Setting the era in UNRANKED solo Chaos after it has been revealed. It buys
  // a sandbox, never an edge: competitive same-seed runs refuse it for every
  // tier, and no tier changes player odds, coach-offer odds or CPU strength.
  CHAOS_CUSTOM_ERA: "CHAOS_CUSTOM_ERA",
});

const C = CAPABILITIES;

/** Guest Chaos runs are limited; the count is server-authoritative. */
export const GUEST_CHAOS_RUNS = 3;

export const MATRIX = Object.freeze({
  GUEST: [C.CHAOS_CLASH, C.DAILY],
  FREE: [C.CHAOS_CLASH, C.CHAOS_UNLIMITED, C.DREAM_MATCHUP, C.DAILY, C.CHALLENGES, C.SAVED_HISTORY, C.BEST_OF_7_TRIAL, C.WIN_82_PREVIEW, C.TOURNAMENT_JOIN],
  PLUS: [C.CHAOS_CLASH, C.CHAOS_UNLIMITED, C.DREAM_MATCHUP, C.DAILY, C.CHALLENGES, C.SAVED_HISTORY, C.BEST_OF_7_TRIAL, C.BEST_OF_7, C.WIN_82_PREVIEW, C.WIN_82, C.TOURNAMENT_JOIN, C.ERA_GAUNTLET, C.ADVANCED_RECAP, C.CHAOS_CUSTOM_ERA],
  COMMISSIONER: [C.CHAOS_CLASH, C.CHAOS_UNLIMITED, C.DREAM_MATCHUP, C.DAILY, C.CHALLENGES, C.SAVED_HISTORY, C.BEST_OF_7_TRIAL, C.BEST_OF_7, C.WIN_82_PREVIEW, C.WIN_82, C.TOURNAMENT_JOIN, C.TOURNAMENT_CREATE, C.ERA_GAUNTLET, C.ADVANCED_RECAP, C.CHAOS_CUSTOM_ERA],
});

/** Feature flags for modes that are specified but not built. */
export const FEATURE_FLAGS = Object.freeze({
  eraGauntlet: { featureFlag: false, entitlement: "PLUS", implementationStatus: "PLANNED", eraGauntletVersion: null },
});

export const normalizeTier = (t) => (TIERS.includes(t) ? t : "GUEST");

/**
 * THE entitlement question. `ctx` may carry preview QA overrides, which affect
 * only this deployment's owner/tester roles and never public policy.
 */
export const can = (tier, capability, ctx = {}) => {
  const t = normalizeTier(tier);
  if (capability === C.ERA_GAUNTLET && !FEATURE_FLAGS.eraGauntlet.featureFlag) return false;
  if (ctx.previewQaEntitlements && ctx.previewRole && (ctx.previewRole === "owner" || ctx.previewRole === "tester")) {
    if (MATRIX.PLUS.includes(capability)) return true;
  }
  return (MATRIX[t] || MATRIX.GUEST).includes(capability);
};

export const atLeast = (tier, min) => RANK[normalizeTier(tier)] >= RANK[normalizeTier(min)];

/** Why a mode is unavailable, in the words the UI shows. */
export const gateReason = (tier, capability) => {
  if (can(tier, capability)) return null;
  if (capability === C.ERA_GAUNTLET) return { kind: "PLANNED", message: "Era Gauntlet is in development." };
  if (capability === C.DREAM_MATCHUP) return { kind: "ACCOUNT", message: "Dream Matchup needs a free account." };
  if (capability === C.CHAOS_CUSTOM_ERA) return { kind: "MEMBERSHIP", message: "Choosing your era is a membership feature. Every era still plays by the same rules for everyone." };
  if (MATRIX.FREE.includes(capability) && normalizeTier(tier) === "GUEST") {
    return { kind: "ACCOUNT", message: "This mode needs a free account." };
  }
  // A mode can be reachable on a FREE account through a TRIAL capability rather
  // than the full one — Best of 7 and Win 82 both are. resolveModeAction honours
  // that; this did not, so a signed-out visitor was told those modes needed
  // EraClash+ and routed to a page that cannot sell anything, when a free
  // account would have opened them.
  const viaTrial = MODES.find((m) => m.capability === capability && m.trialCapability
    && MATRIX.FREE.includes(m.trialCapability));
  if (viaTrial && normalizeTier(tier) === "GUEST") {
    return { kind: "ACCOUNT", message: `${viaTrial.label} opens with a free account.` };
  }
  return { kind: "MEMBERSHIP", message: "Membership feature — not active during private preview" };
};

/** The mode list the Play menu renders, in order. */
export const MODES = Object.freeze([
  { id: "chaos", label: "Chaos Clash", capability: C.CHAOS_CLASH, default: true, tagline: "Three rolls. Hold your legends. Adapt to the era." },
  { id: "dream", label: "Dream Matchup", capability: C.DREAM_MATCHUP, tagline: "Build both teams exactly how you want." },
  { id: "daily", label: "Daily Clash", capability: C.DAILY, tagline: "One shared matchup, once a day." },
  { id: "bo7", label: "Best of 7", capability: C.BEST_OF_7, trialCapability: C.BEST_OF_7_TRIAL, tagline: "A seven-game series." },
  { id: "win82", label: "Win 82", capability: C.WIN_82, trialCapability: C.WIN_82_PREVIEW, tagline: "A full season." },
  { id: "tournament", label: "Tournament", capability: C.TOURNAMENT_JOIN, tagline: "Bracket play." },
]);
