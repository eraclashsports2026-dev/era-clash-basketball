// ── Zone resolution ─────────────────────────────────────────────────────────
// Phase 6B1 left ZONE_MIXED as a scheme LABEL: it capped help and pre-rotation
// but every possession still resolved through ordinary man code with five
// primary assignments. That was honest as far as it went and is documented as a
// limitation — this module replaces it.
//
// A zone does not assign five men to five men. It assigns AREAS, and the
// offence attacks the seams between them. So a zone possession has no primary
// defender in the man sense: it has an area responsible for the ball, a gap
// being attacked, and a rotation that either arrives or does not.
//
// Bounded on purpose. Three base shells plus two evidence-gated specials — not
// every zone in basketball history.
import { versionOf } from "../../versions.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

export const ZONE_RESOLUTION_VERSION = versionOf("zoneResolutionVersion");

export const ZONE_AREAS = ["top", "wings", "corners", "highPost", "lowBlocks", "shortCorners", "rim"];

// ── Shells ──────────────────────────────────────────────────────────────────
// Each shell states what it protects and what it concedes. The vulnerabilities
// are the whole point: a zone is a trade, not a bonus.
export const ZONE_SHELLS = {
  "2-3": {
    key: "2-3",
    label: "2-3 zone",
    // Two guards up, three across the baseline.
    coverage: { top: 0.8, wings: 0.55, corners: 0.4, highPost: 0.3, lowBlocks: 0.85, shortCorners: 0.45, rim: 0.9 },
    protects: ["rim", "lowBlocks", "top"],
    concedes: ["highPost", "corners", "shortCorners"],
    // Where the offence finds seams.
    gaps: { HIGH_POST: 0.9, CORNER: 0.8, SHORT_CORNER: 0.7, SKIP_PASS: 0.75, BASELINE: 0.35, TOP: 0.2 },
    // Baseline defenders start wide, so the glass is contested by fewer bodies
    // inside — a real cost, not an automatic penalty.
    reboundExposure: 0.14,
    requires: { size: 5, help: 4.5, communication: 4 },
    about: "Paint density and rim protection at the cost of the high post and both corners.",
  },
  "3-2": {
    key: "3-2",
    label: "3-2 zone",
    coverage: { top: 0.85, wings: 0.8, corners: 0.5, highPost: 0.6, lowBlocks: 0.45, shortCorners: 0.35, rim: 0.5 },
    protects: ["top", "wings", "highPost"],
    concedes: ["lowBlocks", "corners", "shortCorners", "rim"],
    gaps: { BASELINE: 0.9, CORNER: 0.75, LOW_POST: 0.85, SHORT_CORNER: 0.8, HIGH_POST: 0.3, TOP: 0.15 },
    reboundExposure: 0.2,
    requires: { speed: 5.5, pressure: 4.5, communication: 4.5 },
    about: "Perimeter and above-the-break pressure at the cost of the baseline and the interior glass.",
  },
  MATCHUP: {
    key: "MATCHUP",
    label: "matchup zone",
    // Blends area responsibility with threat tracking. Demanding, not superior.
    coverage: { top: 0.75, wings: 0.7, corners: 0.6, highPost: 0.6, lowBlocks: 0.7, shortCorners: 0.55, rim: 0.7 },
    protects: ["balanced"],
    concedes: ["confusion under fast ball movement"],
    gaps: { SKIP_PASS: 0.8, ZONE_OVERLOAD: 0.85, HIGH_POST: 0.55, CORNER: 0.55, BASELINE: 0.5, TOP: 0.35 },
    reboundExposure: 0.1,
    // The highest bar in the module: it needs communication AND versatility AND
    // an adaptable coach, so it cannot be a default.
    requires: { communication: 6.5, switchability: 6, help: 6, adaptability: 7 },
    about: "Area responsibility with threat tracking. Covers more, and breaks down faster under quick ball movement.",
  },
  BOX_AND_ONE: {
    key: "BOX_AND_ONE",
    label: "box-and-one",
    coverage: { top: 0.6, wings: 0.5, corners: 0.45, highPost: 0.5, lowBlocks: 0.7, shortCorners: 0.4, rim: 0.75 },
    protects: ["one dominant perimeter creator"],
    concedes: ["everyone else", "corners", "offensive glass"],
    gaps: { CORNER: 0.85, HIGH_POST: 0.75, SKIP_PASS: 0.8, ZONE_OVERLOAD: 0.9, BASELINE: 0.6, TOP: 0.3 },
    reboundExposure: 0.22,
    requires: { communication: 6, help: 5.5, adaptability: 6 },
    special: true,
    about: "Four in a box, one chasing. Only defensible when a single creator carries the offence.",
  },
  TRIANGLE_AND_TWO: {
    key: "TRIANGLE_AND_TWO",
    label: "triangle-and-two",
    coverage: { top: 0.55, wings: 0.5, corners: 0.4, highPost: 0.45, lowBlocks: 0.65, shortCorners: 0.35, rim: 0.7 },
    protects: ["two dominant scorers"],
    concedes: ["the other three", "corners", "the glass"],
    gaps: { CORNER: 0.9, HIGH_POST: 0.8, SKIP_PASS: 0.85, ZONE_OVERLOAD: 0.95, BASELINE: 0.65, TOP: 0.35 },
    reboundExposure: 0.26,
    requires: { communication: 6.5, help: 6, adaptability: 7 },
    special: true,
    about: "Three in a triangle, two chasing. Only defensible when exactly two players carry the offence.",
  },
};

export const ZONE_GAPS = ["HIGH_POST", "CORNER", "SHORT_CORNER", "SKIP_PASS", "BASELINE", "LOW_POST", "ZONE_OVERLOAD", "TOP"];

/**
 * Which shells are available at all. Era first — era rules are authoritative
 * and a zone-loving coach does not get a zone where zones were illegal.
 */
export const availableShells = ({ legality, toolkit, ceiling, threats }) => {
  const rejected = [];
  if (!legality.zoneLegal) {
    return {
      available: [],
      rejected: [{ shell: "ALL", reason: "ERA_ILLEGAL", detail: legality.note }],
    };
  }

  const communication = r1(clamp(ceiling.helpCeiling * 0.55 + ceiling.switchCeiling * 0.45, 0, 10));
  const sorted = [...threats].sort((a, b) => b.defensiveDemand - a.defensiveDemand);
  const dominant = sorted.filter((t) => t.defensiveDemand >= 8.5 && t.usageShare >= 0.2).length;

  const available = [];
  for (const shell of Object.values(ZONE_SHELLS)) {
    const req = shell.requires;
    const checks = [
      req.size != null ? ceiling.rimCeiling >= req.size : true,
      req.help != null ? ceiling.helpCeiling >= req.help : true,
      req.speed != null ? ceiling.pressureCeiling >= req.speed : true,
      req.pressure != null ? toolkit.pressure >= req.pressure : true,
      req.switchability != null ? ceiling.switchCeiling >= req.switchability : true,
      req.communication != null ? communication >= req.communication : true,
      req.adaptability != null ? toolkit.adaptability >= req.adaptability : true,
    ];
    if (!checks.every(Boolean)) {
      rejected.push({ shell: shell.key, reason: "PERSONNEL_OR_COACH", detail: `requires ${JSON.stringify(req)}` });
      continue;
    }
    // Specials need the opponent to justify them: a box-and-one against a
    // balanced five is a gift, not a scheme.
    if (shell.key === "BOX_AND_ONE" && dominant !== 1) {
      rejected.push({ shell: shell.key, reason: "OPPONENT_NOT_APPLICABLE", detail: `${dominant} dominant creators; box-and-one needs exactly 1` });
      continue;
    }
    if (shell.key === "TRIANGLE_AND_TWO" && dominant !== 2) {
      rejected.push({ shell: shell.key, reason: "OPPONENT_NOT_APPLICABLE", detail: `${dominant} dominant creators; triangle-and-two needs exactly 2` });
      continue;
    }
    available.push(shell.key);
  }
  return { available, rejected, communication, dominantCreators: dominant };
};

/**
 * Pick a shell. Deterministic, from coach preference × opponent shape ×
 * personnel. There is no zone-coach bonus: a coach who prefers zone gets a
 * zone more OFTEN, never a BETTER one.
 */
export const selectZoneShell = ({ legality, toolkit, ceiling, threats, defenders }) => {
  const avail = availableShells({ legality, toolkit, ceiling, threats });
  if (!avail.available.length) return { shell: null, ...avail };

  const oppCorner = threats.reduce((a, t) => a + t.threats.spotUpShooting, 0) / threats.length;
  const oppHighPost = Math.max(...threats.map((t) => t.threats.passing * 0.5 + t.threats.postScoring * 0.5));
  const oppInterior = Math.max(...threats.map((t) => t.threats.postScoring));
  const oppMovement = Math.max(...threats.map((t) => t.threats.movementShooting));

  const score = (key) => {
    const sh = ZONE_SHELLS[key];
    // Protect what the opponent is best at; concede what they are worst at.
    let v = 4;
    v += sh.coverage.rim * oppInterior * 0.22;
    v += sh.coverage.corners * oppCorner * 0.18;
    v += sh.coverage.highPost * oppHighPost * 0.14;
    v += sh.coverage.wings * oppMovement * 0.12;
    v -= sh.reboundExposure * ceiling.rimCeiling * 0.25;
    if (key === "MATCHUP") v += toolkit.adaptability * 0.18;
    if (key === "BOX_AND_ONE" || key === "TRIANGLE_AND_TWO") v += toolkit.adaptability * 0.12 - 1.4;
    v += (toolkit.zonePreference / 10) * 1.2;
    return v;
  };

  const ranked = avail.available
    .map((k) => ({ shell: k, score: r2(score(k)) }))
    .sort((a, b) => b.score - a.score || a.shell.localeCompare(b.shell));

  return { shell: ranked[0].shell, ranked, ...avail };
};

/**
 * Build the zone shell state: areas, who covers what, the gaps, rebounding
 * responsibilities and the primary-threat tracker for hybrid shells.
 */
export const buildZoneShell = ({ shellKey, defenders, threats, toolkit, legality, ceiling }) => {
  const shell = ZONE_SHELLS[shellKey];
  if (!shell) throw new Error(`unknown zone shell "${shellKey}"`);

  // Assign areas by capability, in a canonical order so the shell is
  // deterministic: rim to the best protector, top to the best point-of-attack.
  const byRim = [...defenders].sort((a, b) => b.capabilities.rimProtection - a.capabilities.rimProtection || a.playerCardId.localeCompare(b.playerCardId));
  const byPerimeter = [...defenders].sort((a, b) => b.capabilities.pointOfAttack - a.capabilities.pointOfAttack || a.playerCardId.localeCompare(b.playerCardId));
  const byHelp = [...defenders].sort((a, b) => b.capabilities.helpDefense - a.capabilities.helpDefense || a.playerCardId.localeCompare(b.playerCardId));
  const byReb = [...defenders].sort((a, b) => b.capabilities.defensiveRebounding - a.capabilities.defensiveRebounding || a.playerCardId.localeCompare(b.playerCardId));

  const responsibilities = {
    rim: byRim[0].playerCardId,
    lowBlocks: [byRim[0].playerCardId, byRim[1].playerCardId],
    highPost: byHelp[0].playerCardId,
    top: byPerimeter[0].playerCardId,
    wings: [byPerimeter[0].playerCardId, byPerimeter[1].playerCardId],
    corners: [byPerimeter[1].playerCardId, byPerimeter[2].playerCardId],
    shortCorners: [byRim[1].playerCardId, byRim[2].playerCardId],
  };

  // Hybrid and special shells track specific threats by name; pure area shells
  // do not, and pretending otherwise is what the old label did.
  const sortedThreats = [...threats].sort((a, b) => b.defensiveDemand - a.defensiveDemand || a.playerCardId.localeCompare(b.playerCardId));
  const trackerCount = shellKey === "BOX_AND_ONE" ? 1 : shellKey === "TRIANGLE_AND_TWO" ? 2 : shellKey === "MATCHUP" ? 5 : 0;
  const primaryThreatTracker = sortedThreats.slice(0, trackerCount).map((t, i) => ({
    offensivePlayerId: t.playerCardId,
    defenderId: byPerimeter[Math.min(i, byPerimeter.length - 1)].playerCardId,
    mode: shellKey === "MATCHUP" ? "AREA_WITH_TRACKING" : "DEDICATED_CHASE",
  }));

  const communication = r1(clamp(ceiling.helpCeiling * 0.55 + ceiling.switchCeiling * 0.45, 0, 10));
  const rotationQuality = r1(clamp(communication * 0.5 + ceiling.helpCeiling * 0.3 + ceiling.pressureCeiling * 0.2, 0, 10));

  return {
    zoneResolutionVersion: ZONE_RESOLUTION_VERSION,
    shellType: shellKey,
    label: shell.label,
    about: shell.about,
    areas: shell.coverage,
    protects: shell.protects,
    concedes: shell.concedes,
    defenderResponsibilities: responsibilities,
    primaryThreatTracker,
    // Rotation quality gates whether the zone actually gets there.
    rotationRules: { quality: rotationQuality, communication, closeoutSpeed: r1(ceiling.pressureCeiling) },
    gapVulnerabilities: shell.gaps,
    reboundResponsibilities: {
      // In a zone, defenders box out an AREA rather than a body, so the
      // assignment is ambiguous by construction. Exposure is shell-specific
      // and offset by who is actually back there.
      exposure: r2(clamp(shell.reboundExposure - (ceiling.rimCeiling - 6) * 0.012, 0.03, 0.32)),
      primary: byReb[0].playerCardId,
      weakSide: byReb[1].playerCardId,
      longRebound: byPerimeter[0].playerCardId,
      note: "Zone defenders box out an area, not a man. Exposure is a shell property, not an automatic penalty.",
    },
    pressurePoints: Object.entries(shell.gaps).filter(([, v]) => v >= 0.75).map(([k]) => k),
    coachToolkitSource: { zonePreference: toolkit.zonePreference, adaptability: toolkit.adaptability },
    eraLegality: { zoneLegal: legality.zoneLegal, defensiveThreeSeconds: legality.defensiveThreeSeconds, note: legality.note },
    confidence: defenders.every((d) => d.confidence.physicalCoverage === "COMPLETE") ? "HIGH"
      : defenders.some((d) => d.confidence.physicalCoverage === "NONE") ? "LOW" : "MEDIUM",
  };
};

/**
 * Which gap the offence attacks this possession, and how well the zone gets
 * there. Deterministic given the rng.
 */
export const attackZone = ({ zoneShell, offense, threats, rng }) => {
  const gaps = zoneShell.gapVulnerabilities;
  // Weighted by how vulnerable the gap is AND whether the offence can use it.
  const capability = {
    HIGH_POST: Math.max(...threats.map((t) => t.threats.passing * 0.5 + t.threats.postScoring * 0.5)),
    CORNER: Math.max(...threats.map((t) => t.threats.spotUpShooting)),
    SHORT_CORNER: Math.max(...threats.map((t) => t.threats.postScoring * 0.5 + t.threats.spotUpShooting * 0.5)),
    SKIP_PASS: offense.offense.passing,
    BASELINE: Math.max(...threats.map((t) => t.threats.cutting)),
    LOW_POST: Math.max(...threats.map((t) => t.threats.postScoring)),
    ZONE_OVERLOAD: offense.offense.passing * 0.6 + offense.offense.spacing * 0.4,
    TOP: Math.max(...threats.map((t) => t.threats.pullUpShooting)),
  };
  const gap = rng.weighted(Object.keys(gaps), (k) => (gaps[k] ?? 0.2) * clamp((capability[k] ?? 5) / 10, 0.05, 1) * 10);

  // Did the rotation arrive? Better rotation closes the gap; a hard gap in a
  // vulnerable shell does not close.
  const closed = rng.chance(clamp(zoneShell.rotationRules.quality * 0.075 - (gaps[gap] ?? 0.5) * 0.35 + 0.42, 0.08, 0.82));
  return {
    gap,
    gapVulnerability: gaps[gap] ?? 0.5,
    offensiveCapability: r1(capability[gap] ?? 5),
    rotationClosed: closed,
    closeoutQuality: r1(clamp(zoneShell.rotationRules.closeoutSpeed * (closed ? 1 : 0.45), 0, 10)),
  };
};
