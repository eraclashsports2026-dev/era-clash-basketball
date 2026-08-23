// ── EraClash Rating Engine v2 ─────────────────────────────────────────────────
// Answers the genre's #1 algorithm complaint: raw stat totals undervalue
// role players. Stats are weighted BY THE POSITION A PLAYER OCCUPIES —
// assists/steals count more for guards, rebounds/blocks more for bigs —
// and the TEAM is scored on category coverage, not just summed production.

// Per-slot stat multipliers
export const POS_WEIGHTS = {
  PG: { pts: 1.30, reb: 1.00, ast: 1.90, stl: 2.30, blk: 1.20 },
  SG: { pts: 1.50, reb: 1.00, ast: 1.40, stl: 2.10, blk: 1.30 },
  SF: { pts: 1.50, reb: 1.20, ast: 1.30, stl: 2.00, blk: 1.50 },
  PF: { pts: 1.35, reb: 1.55, ast: 1.20, stl: 1.70, blk: 2.00 },
  C:  { pts: 1.30, reb: 1.60, ast: 1.30, stl: 1.50, blk: 2.30 },
};

// Accolade weights (defense-inclusive: DPOY + All-Defensive teams carry real weight)
const ACCOLADES = (p) =>
  p.mvp * 30 + p.fmvp * 22 + p.dpoy * 20 +
  p.an1 * 10 + p.an2 * 7 + p.an3 * 4 +
  p.ad1 * 9 + p.ad2 * 5 +
  p.win * 5 + p.pop * 3;

// Rating for a player IN a specific slot (position-weighted)
export const slotRating = (p, slotPos) => {
  const w = POS_WEIGHTS[slotPos] || POS_WEIGHTS[p.pos] || POS_WEIGHTS.SF;
  const production = p.pts * w.pts + p.reb * w.reb + p.ast * w.ast + p.stl * w.stl + p.blk * w.blk;
  // Out-of-position penalty: occupying a slot the player never played costs 12%
  const fits = (p.positions || [p.pos]).includes(slotPos);
  return (production + ACCOLADES(p)) * (fits ? 1 : 0.88);
};

// Display OVR on a 60–99 scale (answers "I would love seeing an individual OVR").
// Percentile-calibrated against the full player pool at their primary position,
// so the scale spreads properly instead of pinning role players at the floor.
import { PLAYERS } from "./players.js";
let _baseline = null;
const baseline = () => {
  if (!_baseline) _baseline = PLAYERS.map((p) => slotRating(p, p.pos)).sort((a, b) => a - b);
  return _baseline;
};
export const displayOVR = (p, slotPos) => {
  const r = slotRating(p, slotPos || p.pos);
  const arr = baseline();
  // binary search: fraction of pool rated below r
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < r) lo = mid + 1; else hi = mid; }
  const pct = lo / arr.length;
  return Math.max(60, Math.min(99, Math.round(60 + pct * 39)));
};

// ── Team Balance Analyzer ────────────────────────────────────────────────────
// Scores the LINEUP as a unit. Returns bonuses, gaps, and a multiplier so the
// UI can show players exactly WHY their team rates the way it does.
export const analyzeBalance = (team, slots = ["PG", "SG", "SF", "PF", "C"]) => {
  const t = team.filter(Boolean);
  if (t.length < 5) return { multiplier: 1, bonuses: [], gaps: [], totals: {} };

  const totals = {
    pts: t.reduce((s, p) => s + p.pts, 0),
    reb: t.reduce((s, p) => s + p.reb, 0),
    ast: t.reduce((s, p) => s + p.ast, 0),
    stl: t.reduce((s, p) => s + p.stl, 0),
    blk: t.reduce((s, p) => s + p.blk, 0),
  };

  const bonuses = [];
  const gaps = [];

  // Playmaking engine: someone has to run the offense
  if (totals.ast >= 22) bonuses.push({ label: "Elite playmaking", detail: `${totals.ast.toFixed(1)} team AST` });
  else if (totals.ast < 15) gaps.push({ label: "No playmaking engine", detail: `${totals.ast.toFixed(1)} team AST — who runs the offense?` });

  // Rim protection
  if (totals.blk >= 4.5) bonuses.push({ label: "Rim protected", detail: `${totals.blk.toFixed(1)} team BLK` });
  else if (totals.blk < 2.0) gaps.push({ label: "No rim protection", detail: `${totals.blk.toFixed(1)} team BLK — layup line for opponents` });

  // Glass control
  if (totals.reb >= 48) bonuses.push({ label: "Owns the glass", detail: `${totals.reb.toFixed(1)} team REB` });
  else if (totals.reb < 32) gaps.push({ label: "Weak on the boards", detail: `${totals.reb.toFixed(1)} team REB` });

  // Perimeter pressure
  if (totals.stl >= 6.5) bonuses.push({ label: "Perimeter menace", detail: `${totals.stl.toFixed(1)} team STL` });
  else if (totals.stl < 3.0) gaps.push({ label: "No perimeter pressure", detail: `${totals.stl.toFixed(1)} team STL` });

  // Scoring balance: one hero + four spectators caps the ceiling
  const topPts = Math.max(...t.map((p) => p.pts));
  const share = topPts / totals.pts;
  if (share > 0.34) gaps.push({ label: "Hero-ball risk", detail: `${Math.round(share * 100)}% of scoring from one player` });
  else if (share < 0.27 && totals.pts >= 105) bonuses.push({ label: "Balanced attack", detail: "No single point of failure" });

  // Defensive pedigree: All-D selections and DPOYs across the roster
  const defPedigree = t.reduce((s, p) => s + p.dpoy * 2 + p.ad1 + p.ad2 * 0.5, 0);
  if (defPedigree >= 8) bonuses.push({ label: "Championship DNA on defense", detail: "Deep All-Defensive pedigree" });

  // Multiplier: each bonus +2%, each gap −3% (caps: +8% / −12%)
  const multiplier = Math.max(0.88, Math.min(1.08, 1 + bonuses.length * 0.02 - gaps.length * 0.03));

  return { multiplier, bonuses, gaps, totals };
};

// Full team rating: position-weighted slot ratings × balance multiplier
export const teamRating = (team, slots = ["PG", "SG", "SF", "PF", "C"]) => {
  const base = team.reduce((sum, p, i) => (p ? sum + slotRating(p, slots[i]) : sum), 0);
  return Math.round(base * analyzeBalance(team, slots).multiplier);
};

// Legacy raw-sum rating (kept for reference/AB comparisons)
export const rawRating = (p) =>
  p.pts * 1.5 + p.reb * 1.2 + p.ast * 1.3 + p.stl * 2.0 + p.blk * 1.8 + ACCOLADES(p);
