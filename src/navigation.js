// ── THE navigation registry ──────────────────────────────────────────────────
// One authoritative source for every destination in the product. The Play
// dropdown, the Fantasy dropdown, the mode shelf and the membership resolver
// all read these records, so a mode can never be described one way in the menu
// and another way on the shelf.
//
// Status is DERIVED from the real entitlement system (src/entitlements.js) and
// the real feature flags — never hard-coded per component.
import { can, CAPABILITIES, FEATURE_FLAGS, gateReason } from "./entitlements.js";

export const NAVIGATION_REGISTRY_VERSION = "1.0.0";

/** Every state a destination can be in. Each has its own distinct behaviour. */
export const MODE_STATUS = Object.freeze({
  AVAILABLE: "AVAILABLE",
  ACCOUNT_REQUIRED: "ACCOUNT_REQUIRED",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  COMMISSIONER_REQUIRED: "COMMISSIONER_REQUIRED",
  COMING_SOON: "COMING_SOON",
  DISABLED_FOR_PREVIEW: "DISABLED_FOR_PREVIEW",
});

const C = CAPABILITIES;

/**
 * Game modes. `implemented` says whether the mode exists as a playable thing —
 * a mode that is not built is COMING_SOON and must never be routed to a
 * membership page, because no amount of paying makes an unbuilt mode work.
 */
export const PLAY_MODES = Object.freeze([
  {
    id: "chaos", label: "Chaos Clash", icon: "🎲", implemented: true, isDefault: true,
    tagline: "Three rolls. Hold your legends. Adapt to the era.",
    description: "Draft under pressure against a Legend CPU, adapt when the era is revealed, then run it on the possession engine.",
    capability: C.CHAOS_CLASH, appMode: "Chaos",
  },
  {
    id: "dream", label: "Dream Matchup", icon: "🏀", implemented: true,
    tagline: "Build any matchup you want.",
    description: "The manual sandbox: pick both fives by hand, choose from the full coach library, and set the Era Style yourself.",
    capability: C.DREAM_MATCHUP, appMode: "Single",
  },
  {
    id: "daily", label: "Daily Clash", icon: "📅", implemented: true,
    tagline: "One shared challenge each day.",
    description: "Everyone in the world gets the same seeded draft and the same opponent. One official attempt.",
    capability: C.DAILY, nav: "Daily",
  },
  {
    id: "bo7", label: "Best of 7", icon: "🏆", implemented: true,
    tagline: "Settle it over a series.",
    description: "The same setup as a single game, played as a seven-game series.",
    capability: C.BEST_OF_7, trialCapability: C.BEST_OF_7_TRIAL, appMode: "Best7",
    previewNote: "Series play runs on the production engine, so it is unavailable while a Candidate 3 preview result is on screen.",
  },
  {
    id: "win82", label: "Win 82", icon: "🗓️", implemented: true,
    tagline: "Survive a full season.",
    description: "Eighty-two games against a generated schedule.",
    capability: C.WIN_82, trialCapability: C.WIN_82_PREVIEW, appMode: "Win82",
  },
  {
    id: "tournament", label: "Tournament", icon: "🏟️", implemented: true,
    tagline: "Four rounds to a title.",
    description: "Bracket play against generated opponents.",
    capability: C.TOURNAMENT_JOIN, createCapability: C.TOURNAMENT_CREATE, appMode: "Tournament",
  },
  {
    id: "gauntlet", label: "Era Gauntlet", icon: "👑", implemented: false,
    tagline: "Conquer the eras.",
    description: "Draft, win, carry one player forward, reroll the rest, and face a harder opponent in a new era. Specified and in development.",
    capability: C.ERA_GAUNTLET, infoRoute: "/modes/era-gauntlet",
  },
]);

/**
 * Fantasy is its own top-level product pillar, deliberately NOT inside Play.
 * Neither product is built; both report their real development status and
 * neither implies an operational contest, wallet, entry fee or payout.
 */
export const FANTASY_DESTINATIONS = Object.freeze([
  {
    id: "eraclash-fantasy", label: "EraClash Fantasy", icon: "🏛️",
    route: "/fantasy/eraclash", status: "IN_DEVELOPMENT",
    tagline: "All-time franchises powered by the EraClash simulation.",
    description: "Build a franchise across basketball history, draft against other managers, and compete through the EraClash simulation universe rather than real-world box scores.",
    differentiator: "Simulated. Your roster plays inside EraClash.",
  },
  {
    id: "eraclash-live", label: "EraClash Live", icon: "📡",
    route: "/fantasy/live", status: "PLANNED",
    tagline: "Traditional fantasy powered by real-world games.",
    description: "Season-long and weekly fantasy using real players and real NBA results, sharing an account with the rest of EraClash.",
    differentiator: "Real games. Real players. Real-world scoring.",
  },
]);

export const FANTASY_STATUS_LABEL = Object.freeze({
  IN_DEVELOPMENT: "In development",
  PLANNED: "Planned",
  PRIVATE_PREVIEW: "Private preview",
  COMING_SOON: "Coming soon",
});

/** The top-level nav, in order. */
export const TOP_NAV = Object.freeze([
  { id: "play", label: "Play", kind: "menu" },
  { id: "fantasy", label: "Fantasy", kind: "menu" },
  { id: "daily", label: "Daily", kind: "nav", nav: "Daily" },
  { id: "challenges", label: "Challenges", kind: "nav", nav: "Challenges" },
  { id: "board", label: "Leaderboard", kind: "nav", nav: "Board" },
  { id: "profile", label: "My EraClash", kind: "nav", nav: "Profile" },
]);

/**
 * Resolve a mode's status for this viewer.
 *
 * `ctx.previewCandidateActive` marks a mode unavailable for a Candidate 3
 * preview result, which is a product limitation and NOT something a membership
 * can unlock — so it never routes to the membership page.
 */
export const resolveModeStatus = (mode, tier, ctx = {}) => {
  if (!mode.implemented || (mode.capability === C.ERA_GAUNTLET && !FEATURE_FLAGS.eraGauntlet.featureFlag)) {
    return MODE_STATUS.COMING_SOON;
  }
  if (ctx.previewCandidateActive && mode.previewNote) return MODE_STATUS.DISABLED_FOR_PREVIEW;
  if (can(tier, mode.capability, ctx)) return MODE_STATUS.AVAILABLE;
  if (mode.trialCapability && can(tier, mode.trialCapability, ctx)) return MODE_STATUS.AVAILABLE;
  const reason = gateReason(tier, mode.capability);
  if (reason?.kind === "ACCOUNT") return MODE_STATUS.ACCOUNT_REQUIRED;
  if (mode.capability === C.TOURNAMENT_CREATE) return MODE_STATUS.COMMISSIONER_REQUIRED;
  return MODE_STATUS.SUBSCRIPTION_REQUIRED;
};

/** The short label shown on a mode card or menu row. */
export const STATUS_LABEL = Object.freeze({
  AVAILABLE: null,
  ACCOUNT_REQUIRED: "Free account",
  SUBSCRIPTION_REQUIRED: "EraClash+",
  COMMISSIONER_REQUIRED: "Commissioner",
  COMING_SOON: "Coming soon",
  DISABLED_FOR_PREVIEW: "Not in preview",
});

/**
 * The ONE decision every mode entry point asks: what happens when this is
 * clicked? Returning an intent rather than performing navigation keeps the
 * registry free of routing concerns and testable on its own.
 */
export const resolveModeAction = (mode, tier, ctx = {}) => {
  const status = resolveModeStatus(mode, tier, ctx);
  switch (status) {
    case MODE_STATUS.AVAILABLE:
      return { status, intent: "OPEN_MODE", mode };
    case MODE_STATUS.ACCOUNT_REQUIRED:
      return { status, intent: "CREATE_ACCOUNT", mode, message: "This mode needs a free account." };
    case MODE_STATUS.SUBSCRIPTION_REQUIRED:
      return { status, intent: "MEMBERSHIP", mode, required: "plus",
        href: membershipHref({ feature: mode.id, required: "plus", from: ctx.from }) };
    case MODE_STATUS.COMMISSIONER_REQUIRED:
      return { status, intent: "MEMBERSHIP", mode, required: "commissioner",
        href: membershipHref({ feature: mode.id, required: "commissioner", from: ctx.from }) };
    case MODE_STATUS.COMING_SOON:
      // A feature that does not exist is never routed to checkout.
      return { status, intent: "MODE_INFO", mode, href: mode.infoRoute || `/modes/${mode.id}` };
    case MODE_STATUS.DISABLED_FOR_PREVIEW:
      return { status, intent: "EXPLAIN_PREVIEW", mode, message: mode.previewNote };
    default:
      return { status, intent: "OPEN_MODE", mode };
  }
};

/**
 * The single membership destination. Every locked mode deep-links here with
 * enough context that a future billing page can replace it without rewriting
 * a single game-mode link.
 */
export const membershipHref = ({ feature, required, from } = {}) => {
  const q = new URLSearchParams();
  if (feature) q.set("feature", feature);
  if (required) q.set("required", required);
  if (from) q.set("from", from);
  const s = q.toString();
  return `/membership${s ? `?${s}` : ""}`;
};

/**
 * Resolve a mode by its id OR by the slug in its information route. The two
 * drifted apart once — `gauntlet` with an infoRoute of `/modes/era-gauntlet` —
 * and the page silently rendered a different mode instead of failing.
 */
export const findMode = (idOrSlug) => {
  if (!idOrSlug) return null;
  const key = String(idOrSlug);
  return PLAY_MODES.find((m) => m.id === key)
    || PLAY_MODES.find((m) => (m.infoRoute || "").split("/").pop() === key)
    || null;
};
export const defaultMode = () => PLAY_MODES.find((m) => m.isDefault) || PLAY_MODES[0];
