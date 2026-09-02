// ── THE navigation registry ──────────────────────────────────────────────────
// One authoritative source for every destination in the product. The Play
// dropdown, the Play Lobby, the mode-information pages and the membership
// resolver all read these records, so a mode can never be described one way in
// the menu and another way on a lobby card.
//
// Status is DERIVED from the real entitlement system (src/entitlements.js) and
// the real feature flags — never hard-coded per component.
//
// Phase 9A adds the route model. Three layers, three surfaces:
//   /                the public entrance (the lobby, carrying the product line)
//   /play            the Play Lobby — visual mode selection; nothing starts here
//   /play/<mode>     the selected mode's own surface (the Time Arena for Chaos)
import { can, CAPABILITIES, FEATURE_FLAGS, gateReason, TRIAL_CAPABILITY } from "./entitlements.js";

export const NAVIGATION_REGISTRY_VERSION = "1.1.0";

/** The lobby's own route. `/` serves the same lobby as the public entrance. */
export const PLAY_LOBBY_ROUTE = "/play";

/** Every state a destination can be in. Each has its own distinct behaviour. */
export const MODE_STATUS = Object.freeze({
  AVAILABLE: "AVAILABLE",
  ACCOUNT_REQUIRED: "ACCOUNT_REQUIRED",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  COMMISSIONER_REQUIRED: "COMMISSIONER_REQUIRED",
  COMING_SOON: "COMING_SOON",
  DISABLED_FOR_PREVIEW: "DISABLED_FOR_PREVIEW",
  // The server has this mode switched off in THIS deployment (Chaos Clash is
  // off in production today). Not a membership matter and not "coming soon" —
  // the mode exists; this environment does not run it.
  UNAVAILABLE_HERE: "UNAVAILABLE_HERE",
});

/** Lobby hierarchy: three primary cards, then a quieter row. */
export const MODE_CATEGORY = Object.freeze({ PRIMARY: "PRIMARY", SECONDARY: "SECONDARY" });

const C = CAPABILITIES;

/**
 * Game modes. `implemented` says whether the mode exists as a playable thing —
 * a mode that is not built is COMING_SOON and must never be routed to a
 * membership page, because no amount of paying makes an unbuilt mode work.
 *
 * `shortDescription` is the one sentence a lobby card carries. `route` is the
 * mode's own address; `category` is its lobby tier; `continuationSupport` says
 * whether an unfinished run of it can be resumed from the lobby.
 */
export const PLAY_MODES = Object.freeze([
  {
    id: "chaos", label: "Chaos Clash", icon: "🎲", implemented: true, isDefault: true,
    route: "/play/chaos", category: MODE_CATEGORY.PRIMARY, recommended: true, continuationSupport: true,
    shortDescription: "Three rolls. Hold your legends. Adapt to the era.",
    tagline: "Three rolls. Hold your legends. Adapt to the era.",
    description: "Draft under pressure against a Legend CPU, adapt when the era is revealed, then run it on the possession engine.",
    implementationNote: "Built. A server-authoritative three-roll draft on /api/game; a guest has three runs, a free account has unlimited.",
    capability: C.CHAOS_CLASH, appMode: "Chaos",
  },
  {
    id: "dream", label: "Dream Matchup", icon: "🏀", implemented: true,
    route: "/play/dream", category: MODE_CATEGORY.PRIMARY, recommended: false, continuationSupport: false,
    shortDescription: "Build any historical matchup.",
    tagline: "Build any matchup you want.",
    description: "The manual sandbox: pick both fives by hand, choose from the full coach library, and set the Era Style yourself.",
    implementationNote: "Built. The manual builder with multi-position placement; a free account is asked for while Chaos Clash is the free default.",
    capability: C.DREAM_MATCHUP, appMode: "Single",
  },
  {
    id: "daily", label: "Daily Clash", icon: "📅", implemented: true,
    route: "/play/daily", category: MODE_CATEGORY.PRIMARY, recommended: false, continuationSupport: false,
    shortDescription: "One shared challenge for everyone.",
    tagline: "One shared challenge each day.",
    description: "Everyone in the world gets the same seeded draft and the same opponent. One official attempt.",
    implementationNote: "Built. Server-seeded; one official attempt per day.",
    capability: C.DAILY, nav: "Daily",
  },
  {
    id: "bo7", label: "Best of 7", icon: "🏆", implemented: true,
    route: "/play/best-of-7", category: MODE_CATEGORY.SECONDARY, recommended: false, continuationSupport: false,
    shortDescription: "Settle it over a series.",
    tagline: "Settle it over a series.",
    description: "The same setup as a single game, played as a seven-game series.",
    implementationNote: "Built. Opens on a free account through its trial capability; runs on the production engine.",
    capability: C.BEST_OF_7, trialCapability: C.BEST_OF_7_TRIAL, appMode: "Best7",
    previewNote: "Series play runs on the production engine, so it is unavailable while a preview-engine result is on screen.",
  },
  {
    id: "win82", label: "Win 82", icon: "🗓️", implemented: true,
    route: "/play/win-82", category: MODE_CATEGORY.SECONDARY, recommended: false, continuationSupport: false,
    shortDescription: "Survive a full season.",
    tagline: "Survive a full season.",
    description: "Eighty-two games against a generated schedule.",
    implementationNote: "Built as a preview on a free account through its trial capability.",
    capability: C.WIN_82, trialCapability: C.WIN_82_PREVIEW, appMode: "Win82",
  },
  {
    id: "tournament", label: "Tournament", icon: "🏟️", implemented: true,
    route: "/play/tournament", category: MODE_CATEGORY.SECONDARY, recommended: false, continuationSupport: false,
    shortDescription: "Four rounds to a title.",
    tagline: "Four rounds to a title.",
    description: "Bracket play against generated opponents.",
    implementationNote: "Built. Joining needs a free account; creating a private bracket is a commissioner capability.",
    capability: C.TOURNAMENT_JOIN, createCapability: C.TOURNAMENT_CREATE, appMode: "Tournament",
  },
  {
    id: "gauntlet", label: "Era Gauntlet", icon: "👑", implemented: false,
    route: "/play/era-gauntlet", category: MODE_CATEGORY.SECONDARY, recommended: false, continuationSupport: false,
    shortDescription: "Conquer the eras.",
    tagline: "Conquer the eras.",
    description: "Draft, win, carry one player forward, reroll the rest, and face a harder opponent in a new era. Specified and in development.",
    implementationNote: "Not built. Specified; flagged off; its card opens the information page and never a checkout.",
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
  // icon and tagline are for the narrow-screen "More" menu, which folds these
  // four into one item rather than wrapping the header onto three lines.
  { id: "daily", label: "Daily", kind: "nav", nav: "Daily", icon: "📅", tagline: "Today's challenge, the same for everyone." },
  { id: "challenges", label: "Challenges", kind: "nav", nav: "Challenges", icon: "⚔", tagline: "Matchups someone sent you, and ones you send." },
  { id: "board", label: "Leaderboard", kind: "nav", nav: "Board", icon: "🏆", tagline: "Where today's results stand." },
  { id: "profile", label: "My EraClash", kind: "nav", nav: "Profile", icon: "👤", tagline: "Your account, your record, your settings." },
]);

/** Does this mode need an account before a GUEST can open it at all? Derived, never declared. */
export const requiresAccount = (mode) =>
  !can("GUEST", mode.capability) && !(mode.trialCapability && can("GUEST", mode.trialCapability));

/**
 * Resolve a mode's status for this viewer.
 *
 * `ctx.previewCandidateActive` marks a mode unavailable for a preview-engine
 * result, which is a product limitation and NOT something a membership can
 * unlock — so it never routes to the membership page.
 * `ctx.chaosAvailable === false` is the server saying Chaos Clash is switched
 * off in this deployment.
 */
export const resolveModeStatus = (mode, tier, ctx = {}) => {
  if (!mode.implemented || (mode.capability === C.ERA_GAUNTLET && !FEATURE_FLAGS.eraGauntlet.featureFlag)) {
    return MODE_STATUS.COMING_SOON;
  }
  if (mode.id === "chaos" && ctx.chaosAvailable === false) return MODE_STATUS.UNAVAILABLE_HERE;
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
  UNAVAILABLE_HERE: "Not available here",
});

/** The one action word on a lobby card, by status. */
export const ACTION_LABEL = Object.freeze({
  AVAILABLE: "Play",
  ACCOUNT_REQUIRED: "Open",
  SUBSCRIPTION_REQUIRED: "About membership",
  COMMISSIONER_REQUIRED: "About membership",
  COMING_SOON: "Learn more",
  DISABLED_FOR_PREVIEW: "Why not now",
  UNAVAILABLE_HERE: "Learn more",
});

/**
 * The ONE decision every mode entry point asks: what happens when this is
 * clicked? Returning an intent rather than performing navigation keeps the
 * registry free of routing concerns and testable on its own. Every intent
 * carries an `href`, so a lobby card can be a real link.
 */
export const resolveModeAction = (mode, tier, ctx = {}) => {
  const status = resolveModeStatus(mode, tier, ctx);
  switch (status) {
    case MODE_STATUS.AVAILABLE:
      return { status, intent: "OPEN_MODE", mode, href: mode.route };
    case MODE_STATUS.ACCOUNT_REQUIRED:
      // The mode's own route shows the account gate, so the link is honest.
      return { status, intent: "CREATE_ACCOUNT", mode, message: "This mode needs a free account.", href: mode.route };
    case MODE_STATUS.SUBSCRIPTION_REQUIRED:
      return { status, intent: "MEMBERSHIP", mode, required: "plus",
        href: membershipHref({ feature: mode.id, required: "plus", from: ctx.from }) };
    case MODE_STATUS.COMMISSIONER_REQUIRED:
      return { status, intent: "MEMBERSHIP", mode, required: "commissioner",
        href: membershipHref({ feature: mode.id, required: "commissioner", from: ctx.from }) };
    case MODE_STATUS.COMING_SOON:
    case MODE_STATUS.UNAVAILABLE_HERE:
      // A feature that does not exist (or is not switched on here) is never
      // routed to checkout.
      return { status, intent: "MODE_INFO", mode, href: mode.infoRoute || `/modes/${mode.id}` };
    case MODE_STATUS.DISABLED_FOR_PREVIEW:
      return { status, intent: "EXPLAIN_PREVIEW", mode, message: mode.previewNote, href: mode.route };
    default:
      return { status, intent: "OPEN_MODE", mode, href: mode.route };
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
 * Resolve a mode by its id OR by the slug in its information route or its own
 * route. The first two drifted apart once — `gauntlet` with an infoRoute of
 * `/modes/era-gauntlet` — and the page silently rendered a different mode
 * instead of failing.
 */
export const findMode = (idOrSlug) => {
  if (!idOrSlug) return null;
  const key = String(idOrSlug);
  return PLAY_MODES.find((m) => m.id === key)
    || PLAY_MODES.find((m) => (m.infoRoute || "").split("/").pop() === key)
    || PLAY_MODES.find((m) => (m.route || "").split("/").pop() === key)
    || null;
};
export const defaultMode = () => PLAY_MODES.find((m) => m.isDefault) || PLAY_MODES[0];

// ── Routes ───────────────────────────────────────────────────────────────────
const trim = (p) => String(p || "/").replace(/\/+$/, "") || "/";

/** The mode whose own route this is, or null. `/play` and `/` are the lobby, not a mode. */
export const modeForRoute = (pathname) => {
  const p = trim(pathname);
  return PLAY_MODES.find((m) => m.route === p) || null;
};
/** `/` and `/play` both open the lobby. */
export const isLobbyRoute = (pathname) => { const p = trim(pathname); return p === "/" || p === PLAY_LOBBY_ROUTE; };
/** Any `/play/...` address: the lobby or a mode. */
export const isPlayRoute = (pathname) => { const p = trim(pathname); return p === PLAY_LOBBY_ROUTE || p.startsWith(`${PLAY_LOBBY_ROUTE}/`); };
/** The route for an App-level mode name ("Chaos", "Single", …), for keeping the address truthful. */
export const routeForAppMode = (appMode) => PLAY_MODES.find((m) => m.appMode === appMode)?.route || null;

/** The lobby's two tiers, in registry order. */
export const lobbyModes = () => ({
  primary: PLAY_MODES.filter((m) => m.category === MODE_CATEGORY.PRIMARY),
  secondary: PLAY_MODES.filter((m) => m.category === MODE_CATEGORY.SECONDARY),
});
