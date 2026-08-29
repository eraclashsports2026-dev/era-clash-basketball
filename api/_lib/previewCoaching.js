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
// Every trigger the engine can emit. A missing entry used to fall through to a
// lowercased enum ("pnr repeatedly successful"), which read like debug output.
const TRIGGER_LABEL = {
  PNR_FAILURE: "the pick-and-roll stopped working",
  PNR_SUCCESS: "the pick-and-roll kept getting downhill",
  PNR_REPEATEDLY_SUCCESSFUL: "the pick-and-roll kept beating the coverage",
  POST_MISMATCH_AVAILABLE: "a post mismatch was there for the taking",
  POST_REPEATEDLY_EXPLOITED: "the post was being punished over and over",
  MATCHUP_REPEATEDLY_BEATEN: "one matchup kept getting beaten",
  EXCESSIVE_RIM_PRESSURE: "too much was getting to the rim",
  TURNOVER_SPIRAL: "turnovers were piling up",
  TURNOVER_SPIKE: "turnovers spiked",
  SECOND_CHANCE_BLEEDING: "second chances were bleeding out",
  THREE_POINT_BLEEDING: "threes were falling too freely",
  ISOLATION_FAILURE: "isolation was going nowhere",
  ISOLATION_SUCCESS: "isolation was working",
  MOVEMENT_SHOOTER_FREED: "a shooter kept coming free off movement",
  PAINT_CONGESTION: "the paint was too crowded to operate in",
  PRIMARY_CREATOR_NEUTRALIZED: "the primary creator was being taken away",
  ZONE_CORNER_OPEN: "the zone was leaving the corner open",
  ZONE_HIGH_POST_OPEN: "the zone was soft at the high post",
  HIDDEN_DEFENDER_DRAGGED_IN: "the hidden defender kept getting dragged into the action",
};
const RESPONSE_LABEL = {
  REDUCE_PNR: "ran fewer ball screens", INCREASE_POST_TARGETING: "fed the post more",
  CHANGE_PRIMARY_DEFENDER: "changed the primary defender", INCREASE_HELP: "sent more help",
  REDUCE_HELP: "pulled help back", INCREASE_SWITCHING: "switched more actions",
  SLOW_PACE: "slowed the game down", INCREASE_PACE: "pushed the pace",
  PULL_BACK_SHOOTERS: "pulled shooters back", CRASH_GLASS_LESS: "stopped crashing the glass",
};
const SHELL_LABEL = {
  MAN_ILLEGAL_DEFENSE: "Man-to-man defense under the era's illegal-defense rules",
  MODERN_MAN_HELP: "Man-to-man defense with modern help rules",
  SWITCH_EVERYTHING: "Switch-everything defense",
  ZONE_HYBRID: "A zone hybrid",
  PACK_THE_PAINT: "A packed paint",
};
// Internal enums are never printed raw. "switch_heavy" is a database value, not
// something a broadcast would say.
const COVERAGE_LABEL = {
  switch_heavy: "switching ball screens aggressively",
  drop_heavy: "conservative drop coverage",
  drop: "drop coverage",
  hedge: "hedging the ball screen",
  blitz: "blitzing the ball handler",
  ice: "icing side ball screens",
  weak: "sending the ball handler weak",
  switch: "switching ball screens",
  level: "playing ball screens at the level",
  aggressive_show: "showing hard on the ball screen",
  soft_show: "showing softly and recovering",
  mixed: "mixing its ball-screen coverages",
  conservative: "playing ball screens conservatively",
  aggressive: "playing ball screens aggressively",
  passive: "sitting back in ball screens",
  none: "no fixed ball-screen coverage",
};
const CONSTRAINT_LABEL = {
  ERA: "the era's rules", PERSONNEL: "the personnel on the floor",
  COACH: "the staff's own principles", SCHEME: "the shell itself",
};
/** Response phrased as something a NAMED coach did. */
const RESPONSE_VERB = {
  REDUCE_PNR: "ran fewer ball screens", INCREASE_POST_TARGETING: "put more possessions through the post",
  CHANGE_PRIMARY_DEFENDER: "changed the primary defender", INCREASE_HELP: "sent more help",
  REDUCE_HELP: "pulled help back", INCREASE_SWITCHING: "switched more actions",
  SLOW_PACE: "slowed the game down", INCREASE_PACE: "pushed the pace",
  PULL_BACK_SHOOTERS: "pulled the shooters back", CRASH_GLASS_LESS: "stopped crashing the glass",
  INCREASE_ISOLATION_TARGETING: "leaned harder on isolation",
  REHIDE_WEAK_DEFENDER: "re-hid the weak defender", IMPROVE_SPACING: "opened the floor up",
  INCREASE_PNR: "ran more ball screens",
  INCREASE_OFF_BALL_SCREENS: "ran more off-ball screens",
  CHANGE_PRIMARY_INITIATOR: "changed who started the offense",
  REDUCE_CREATOR_CONCENTRATION: "spread the creation around",
  ATTACK_ZONE_CORNERS: "attacked the corners of the zone",
  ATTACK_ZONE_HIGH_POST: "attacked the high post against the zone",
  CHANGE_BALL_SCREEN_COVERAGE: "changed the ball-screen coverage",
  INCREASE_DOUBLE_TEAM: "started doubling",
  CONTAIN_PRIMARY_THREAT: "committed to containing the primary threat",
  CONTAIN_HIGH_DEMAND_THREAT: "committed to containing their busiest scorer",
  CROSS_MATCH_FOR_FIT: "cross-matched to get a better fit",
};
const pretty = (k, map) => map[k] ?? String(k ?? "").replace(/_/g, " ").toLowerCase();
const topActions = (mix, n = 3) => Object.entries(mix ?? {})
  .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => ({ action: ACTION_LABEL[k] ?? k, share: Math.round(v * 100) }));

/**
 * Where a possession index sat in the game: period, Early/Mid/Late within it,
 * and the score at the time. The engine records no clock, so "Poss. 84" becomes
 * "Mid Q3 — Gold leading 76-69" rather than a fabricated "Q3 6:42".
 */
const buildPossessionIndex = (ledger) => {
  const map = new Map();
  if (!Array.isArray(ledger)) return map;
  const bounds = new Map();
  for (const e of ledger) {
    const b = bounds.get(e.period);
    if (!b) bounds.set(e.period, { first: e.i, last: e.i });
    else { b.first = Math.min(b.first, e.i); b.last = Math.max(b.last, e.i); }
  }
  let g = 0, b = 0;
  for (const e of ledger) {
    if (Number(e.points) > 0) { if (e.offense === "gold") g += e.points; else b += e.points; }
    const bd = bounds.get(e.period);
    const f = bd && bd.last > bd.first ? (e.i - bd.first) / (bd.last - bd.first) : 0.5;
    map.set(e.i, {
      period: e.period <= 4 ? `Q${e.period}` : e.period === 5 ? "OT" : `OT${e.period - 4}`,
      phase: f < 0.34 ? "Early" : f < 0.67 ? "Mid" : "Late",
      gold: g, blue: b,
    });
  }
  return map;
};

/** Detail strings the engine writes for machines, said the way a person would. */
const humanDetail = (d) => String(d ?? "")
  .replace(/^only 0 of 5 defenders can switch$/i, "no defender on the floor can switch cleanly")
  .replace(/^only 1 of 5 defenders can switch$/i, "only one defender on the floor can switch cleanly")
  .replace(/^personnel speed$/i, "this group does not have the foot speed the scheme wants")
  .replace(/^personnel size$/i, "this group does not have the size the scheme wants")
  .replace(/^personnel switchability$/i, "this group cannot switch the way the scheme wants")
  .replace(/\bdefence\b/g, "defense")
  .replace(/\.$/, "");

/**
 * A constraint reads as one plain sentence. The attribution is appended only
 * when it adds information: "personnel speed — imposed by the personnel on the
 * floor" is a tautology, and an era rule that already names its era does not
 * need to be told it came from the era.
 */
const constraintText = (c) => {
  const detail = humanDetail(c.detail);
  const src = CONSTRAINT_LABEL[c.limitedBy] ?? (c.limitedBy ? String(c.limitedBy).toLowerCase() : null);
  if (!src) return `${detail}.`;
  const d = detail.toLowerCase();
  const redundant =
    (c.limitedBy === "PERSONNEL" && /\bpersonnel|defender|defenders\b/.test(d)) ||
    (c.limitedBy === "ERA" && /\b(era|illegal-defense|zones?|hand-check|\d{4}s)\b/.test(d));
  return redundant ? `${detail}.` : `${detail} — imposed by ${src}.`;
};

const scoreState = (at, side) => {
  if (!at) return null;
  if (at.gold === at.blue) return `tied ${at.gold}-${at.blue}`;
  const leading = at.gold > at.blue ? "gold" : "blue";
  const hi = Math.max(at.gold, at.blue), lo = Math.min(at.gold, at.blue);
  return leading === side ? `leading ${hi}-${lo}` : `trailing ${lo}-${hi}`;
};

/**
 * Broadcast surname. Naively taking the last token turned "Stan Van Gundy" into
 * "Coach Gundy"; nobody calls him that. Particles are kept with the surname.
 */
const PARTICLES = new Set(["van", "von", "de", "del", "della", "di", "da", "la", "le", "st.", "st", "mac", "mc", "der", "den"]);
const surname = (full) => {
  const parts = String(full || "").trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "";
  let i = parts.length - 1;
  while (i > 0 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(" ");
};

const paceWord = (p) => (p >= 7.5 ? "fast" : p >= 6 ? "up-tempo" : p >= 4.5 ? "measured" : "deliberate");

const matchupPoints = (ledger, offId, defId) => {
  if (!Array.isArray(ledger)) return null;
  let pts = 0, seen = false;
  for (const e of ledger) {
    if (e.primary === offId && e.primaryDefenderId === defId) { seen = true; pts += Number(e.points) || 0; }
  }
  return seen ? pts : null;
};

const sideCoaching = (off, def, coachName, cards, qualify, possIndex, side, ledger) => {
  const name = (id) => cards.get(id)?.name ?? id;
  const coachRef = coachName ? `Coach ${surname(coachName)}` : "The staff";
  const raw = [...(off?.adjustments ?? []), ...(def?.changes ?? [])]
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const shape = (a) => {
    const at = possIndex.get(a.at);
    const state = scoreState(at, side);
    return {
      possession: a.at ?? null,
      period: at?.period ?? null,
      phase: at?.phase ?? null,
      // "Mid Q3 — Gold leading 76-69". Period and score state, never a clock.
      when: at ? `${at.phase} ${at.period}` : null,
      scoreState: state ? `${side === "gold" ? "Gold" : "Blue"} ${state}` : null,
      trigger: pretty(a.trigger, TRIGGER_LABEL),
      response: pretty(a.response, RESPONSE_VERB),
      coach: coachRef,
      // A named coach, a real trigger, and what changed.
      text: `${pretty(a.trigger, TRIGGER_LABEL)}, so ${coachRef} ${pretty(a.response, RESPONSE_VERB)}.`,
    };
  };
  // An adjustment the staff CONSIDERED and rejected is not something that
  // happened. Presenting it as one produced lines like "so the staff rejected."
  const applied = raw.filter((a) => a.response && a.response !== "REJECTED" && !a.rejected).map(shape);
  const declined = raw.filter((a) => a.response === "REJECTED" || a.rejected).map((a) => {
    const at = possIndex.get(a.at);
    return {
      possession: a.at ?? null,
      when: at ? `${at.phase} ${at.period}` : null,
      scoreState: scoreState(at, side) ? `${side === "gold" ? "Gold" : "Blue"} ${scoreState(at, side)}` : null,
      trigger: pretty(a.trigger, TRIGGER_LABEL),
      text: `${pretty(a.trigger, TRIGGER_LABEL)}, but ${coachRef} stayed with the plan.`,
    };
  });
  const adjustments = applied;
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
      // An unmapped coverage must still read as English, never as a shouted
      // enum ("AGGRESSIVE SHOW").
      ballScreenCoverage: COVERAGE_LABEL[String(def.scheme?.ballScreenCoverage ?? "").toLowerCase()]
        || (def.scheme?.ballScreenCoverage
          ? String(def.scheme.ballScreenCoverage).replace(/_/g, " ").toLowerCase()
          : null),
      pressure: def.scheme?.pressureLevel != null ? (def.scheme.pressureLevel >= 6 ? "high" : def.scheme.pressureLevel >= 4 ? "moderate" : "conservative") : null,
      help: def.scheme?.helpAggression != null ? (def.scheme.helpAggression >= 6 ? "aggressive" : def.scheme.helpAggression >= 4 ? "balanced" : "conservative") : null,
      // Why the scheme could not be what the coach wanted.
      constraints: (def.scheme?.constraints ?? []).map((c) => ({
        dimension: c.dimension, limitedBy: c.limitedBy, detail: c.detail,
        text: constraintText(c),
      })),
    } : null,
    adjustments,
    declinedAdjustments: declined,
    // Matchups the OPPONENT attacked against this defence. When the same
    // person appears on both rosters, the bare name is ambiguous — every
    // reference is qualified with the side it belongs to.
    attackedMatchups: (def?.exploitation ?? []).slice(0, 3)
      .map((e) => {
        const scorer = qualify(name(e.off), "off"), defender = qualify(name(e.def), "def");
        const pts = e.points ?? matchupPoints(ledger, e.off, e.def);
        return {
          scorer, defender, possessions: e.events, points: pts,
          // A possession count with no consequence tells the reader nothing.
          text: pts != null
            ? `${scorer} was run at ${defender} on ${e.events} possessions, and it produced ${pts} points.`
            : `${scorer} was run at ${defender} on ${e.events} possessions.`,
        };
      }),
  };
};

export const deriveCoaching = (g, cards, coachNames, rosters, ledger = null) => {
  if (!g?.offense || !g?.defense) return null;
  const possIndex = buildPossessionIndex(ledger ?? g.possessionLedger);
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
    coachingVersion: 2,
    duplicatePeople: [...dupes],
    gold: sideCoaching(g.offense.gold, g.defense.gold, coachNames?.gold, cards, qualifier("gold"), possIndex, "gold", ledger ?? g.possessionLedger),
    blue: sideCoaching(g.offense.blue, g.defense.blue, coachNames?.blue, cards, qualifier("blue"), possIndex, "blue", ledger ?? g.possessionLedger),
  };
};
