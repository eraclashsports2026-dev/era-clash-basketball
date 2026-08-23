// ── Coach database loader ──────────────────────────────────────────────────────
// 25 researched coach profiles live in data/coaches.json (build-time research
// with provenance — see docs/simulation-v3/coaches-research.md). Coaches are
// NEVER flat bonuses and there is NO universal coach OVR: their effect flows
// entirely through gameplan translation (ideal system × roster × era ×
// opponent × adaptability).
import coachData from "./data/coaches.js";

export const COACHES = coachData.coaches;
export const getCoach = (id) => COACHES.find((c) => c.id === id) || null;

// League-typical baseline used when V3 runs without an explicit coach pick
// (e.g. auto-generated season opponents). Every attribute is 5 = typical.
export const NEUTRAL_COACH = {
  id: "neutral",
  name: "League-Average Staff",
  span: "—", wins: 0, losses: 0, pct: 0.5, championships: 0, teams: [], eras: [],
  systemTags: ["Balanced"],
  offense: { tempo: 5, transition: 5, motion: 5, pnr: 5, post: 5, iso: 5, threeEmphasis: 5, insideOut: 5, offBall: 5, ballMovement: 5, starFreedom: 5 },
  defense: { man: 6, zone: 3, switching: 4, drop: 5, pressure: 5, helpAggression: 5, rimPriority: 5, defRebPriority: 5 },
  management: { adaptability: 5, rotationDepth: 5, roleDiscipline: 5, starEmpowerment: 5, tacticalAdjustment: 5 },
  rosterFit: { traditionalCenters: 5, passingBigs: 5, shootingBigs: 5, primaryCreators: 5, multipleCreators: 5, switchableWings: 5, shooters: 5, defenders: 5, transitionAthletes: 5 },
  bestWith: [], concern: "", documented: [], inferred: [], sources: [], confidence: "N/A",
};
