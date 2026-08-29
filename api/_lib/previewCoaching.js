// ── Coaching & Strategy, from what the engine actually recorded ──────────────
// Phase 7B. The Coaching tab previously showed usage percentages and a raw
// pregame edge chart — not coaching. The possession engine records the real
// article: each side's opening action mix and pace target, the defensive shell
// it installed (with the constraints personnel and era imposed on it), the
// in-game adjustments it made with their triggers, and which matchups were
// repeatedly attacked. This maps that record into display shape. Nothing is
// invented: a side with no recorded adjustment gets an empty list, and the UI
// says so rather than inventing one.
const ACTION_LABEL = {
  PICK_AND_ROLL: "Pick and roll", POST_UP: "Post up", ISOLATION: "Isolation",
  SPOT_UP: "Spot up", CUT: "Cuts", OFF_BALL_SCREEN: "Off-ball screens",
  HANDOFF: "Handoffs", GENERIC_HALF_COURT: "Half court", TRANSITION: "Transition",
};
const TRIGGER_LABEL = {
  PNR_FAILURE: "the pick-and-roll stopped working",
  POST_MISMATCH_AVAILABLE: "a post mismatch was available",
  MATCHUP_REPEATEDLY_BEATEN: "a matchup was repeatedly beaten",
  EXCESSIVE_RIM_PRESSURE: "too much rim pressure was conceded",
  TURNOVER_SPIRAL: "turnovers were piling up",
  SECOND_CHANCE_BLEEDING: "second chances were bleeding out",
  THREE_POINT_BLEEDING: "threes were falling too freely",
};
const RESPONSE_LABEL = {
  REDUCE_PNR: "ran fewer ball screens", INCREASE_POST_TARGETING: "fed the post more",
  CHANGE_PRIMARY_DEFENDER: "changed the primary defender", INCREASE_HELP: "sent more help",
  REDUCE_HELP: "pulled help back", INCREASE_SWITCHING: "switched more actions",
  SLOW_PACE: "slowed the game down", INCREASE_PACE: "pushed the pace",
  PULL_BACK_SHOOTERS: "pulled shooters back", CRASH_GLASS_LESS: "stopped crashing the glass",
};
const SHELL_LABEL = {
  MAN_ILLEGAL_DEFENSE: "Man-to-man (illegal-defense era)", MODERN_MAN_HELP: "Modern man with help",
  SWITCH_EVERYTHING: "Switch everything", ZONE_HYBRID: "Zone hybrid", PACK_THE_PAINT: "Pack the paint",
};
const pretty = (k, map) => map[k] ?? String(k ?? "").replace(/_/g, " ").toLowerCase();
const topActions = (mix, n = 3) => Object.entries(mix ?? {})
  .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => ({ action: ACTION_LABEL[k] ?? k, share: Math.round(v * 100) }));

const paceWord = (p) => (p >= 7.5 ? "fast" : p >= 6 ? "up-tempo" : p >= 4.5 ? "measured" : "deliberate");

const sideCoaching = (off, def, coachName, cards, qualify) => {
  const name = (id) => cards.get(id)?.name ?? id;
  const adjustments = [...(off?.adjustments ?? []), ...(def?.changes ?? [])]
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    .map((a) => ({
      possession: a.at ?? null,
      trigger: pretty(a.trigger, TRIGGER_LABEL),
      response: pretty(a.response, RESPONSE_LABEL),
    }));
  return {
    coach: coachName ?? null,
    openingPlan: {
      actions: topActions(off?.baselineActionMix),
      pace: off?.paceTarget != null ? paceWord(off.paceTarget) : null,
      initiator: off?.initiator ? name(off.initiator) : null,
      crashesGlass: off?.crashGlassPriority != null ? off.crashGlassPriority >= 5 : null,
    },
    // What the mix actually became once the game was played.
    finalActions: topActions(off?.finalActionMix),
    defense: def ? {
      shell: pretty(def.scheme?.shellType, SHELL_LABEL),
      ballScreenCoverage: String(def.scheme?.ballScreenCoverage ?? "").toLowerCase() || null,
      pressure: def.scheme?.pressureLevel != null ? (def.scheme.pressureLevel >= 6 ? "high" : def.scheme.pressureLevel >= 4 ? "moderate" : "conservative") : null,
      help: def.scheme?.helpAggression != null ? (def.scheme.helpAggression >= 6 ? "aggressive" : def.scheme.helpAggression >= 4 ? "balanced" : "conservative") : null,
      // Why the scheme could not be what the coach wanted.
      constraints: (def.scheme?.constraints ?? []).map((c) => ({ dimension: c.dimension, limitedBy: c.limitedBy, detail: c.detail })),
    } : null,
    adjustments,
    // Matchups the OPPONENT attacked against this defence. When the same
    // person appears on both rosters, the bare name is ambiguous — every
    // reference is qualified with the side it belongs to.
    attackedMatchups: (def?.exploitation ?? []).slice(0, 3)
      .map((e) => ({ scorer: qualify(name(e.off), "off"), defender: qualify(name(e.def), "def"), possessions: e.events })),
  };
};

export const deriveCoaching = (g, cards, coachNames, rosters) => {
  if (!g?.offense || !g?.defense) return null;
  // People on BOTH rosters must never be printed as a bare name.
  const nameOf = (id) => cards.get(id)?.name ?? id;
  const goldNames = new Set((rosters?.gold ?? []).map(nameOf));
  const blueNames = new Set((rosters?.blue ?? []).map(nameOf));
  const dupes = new Set([...goldNames].filter((n) => blueNames.has(n)));
  // On a side's panel the DEFENDER is that side's player and the SCORER is the
  // opponent's, so the qualifier follows the role.
  const qualifier = (side) => (n, role) => {
    if (!dupes.has(n)) return n;
    const owner = role === "def" ? side : (side === "gold" ? "blue" : "gold");
    return `${owner === "gold" ? "Gold" : "Blue"}'s ${n}`;
  };
  return {
    coachingVersion: 1,
    duplicatePeople: [...dupes],
    gold: sideCoaching(g.offense.gold, g.defense.gold, coachNames?.gold, cards, qualifier("gold")),
    blue: sideCoaching(g.offense.blue, g.defense.blue, coachNames?.blue, cards, qualifier("blue")),
  };
};
