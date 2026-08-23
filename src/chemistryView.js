// ── Chemistry display layer ────────────────────────────────────────────────────
// Maps the REAL chemistry state (analyzeBalance v2 multiplier + bonuses/gaps,
// plus v2.5 attribute insights) onto presentation scales. This file computes
// nothing new about basketball — it only translates existing engine values
// into a 0–100 score, labels, and per-player Team Fit. teamRating is untouched.
import { analyzeBalance } from "./rating.js";
import { attributeInsights } from "./attributes.js";

// 0–100 display score. Anchors: multiplier 0.88 (worst) ≈ 35, 1.00 ≈ 62,
// 1.08 (best) + full bonuses ≈ 97. Purely a rescaling of real values.
export const chemistryScore = (team) => {
  const t = (team || []).filter(Boolean);
  if (t.length < 5) return null;
  const bal = analyzeBalance(t);
  const style = attributeInsights(t);
  const raw = 62
    + (bal.multiplier - 1) * 320
    + bal.bonuses.length * 2.5 + style.bonuses.length * 1.5
    - bal.gaps.length * 3 - style.gaps.length * 2;
  return Math.max(25, Math.min(99, Math.round(raw)));
};

export const chemistryLabel = (score) =>
  score == null ? "" : score >= 88 ? "EXCELLENT" : score >= 75 ? "GOOD" : score >= 60 ? "AVERAGE" : "POOR";

// All named strengths/concerns (v2 + v2.5) for the meter.
export const chemistryTags = (team) => {
  const t = (team || []).filter(Boolean);
  if (t.length < 5) return { strengths: [], concerns: [] };
  const bal = analyzeBalance(t);
  const style = attributeInsights(t);
  return {
    strengths: [...bal.bonuses, ...style.bonuses],
    concerns: [...bal.gaps, ...style.gaps],
  };
};

// ── Team Fit per player ────────────────────────────────────────────────────────
// OVR ≠ FIT. Fit counts how many of the team's real chemistry outcomes this
// player materially drives: +1 for each team bonus they're an above-average
// contributor to, −1 for each gap they materially cause (e.g. the hero-ball
// scorer, or a non-shooter in a cramped-spacing lineup).
export const teamFit = (team, index) => {
  const t = (team || []).filter(Boolean);
  if (t.length < 5 || !team[index]) return null;
  const p = team[index];
  const bal = analyzeBalance(t);
  const avg = (k) => t.reduce((s, x) => s + x[k], 0) / t.length;

  let score = 0;
  for (const b of bal.bonuses) {
    if (b.label === "Elite playmaking" && p.ast > avg("ast")) score++;
    if (b.label === "Rim protected" && p.blk > avg("blk")) score++;
    if (b.label === "Owns the glass" && p.reb > avg("reb")) score++;
    if (b.label === "Perimeter menace" && p.stl > avg("stl")) score++;
    if (b.label === "Balanced attack") score += 0; // collective — no single driver
    if (b.label === "Championship DNA on defense" && (p.dpoy * 2 + p.ad1 + p.ad2 * 0.5) >= 2) score++;
  }
  for (const g of bal.gaps) {
    if (g.label === "Hero-ball risk" && p.pts === Math.max(...t.map((x) => x.pts))) score--;
    if (g.label === "No playmaking engine" && p.ast < 3 && ["PG", "SG"].includes(p.pos)) score--;
    if (g.label === "No rim protection" && ["PF", "C"].includes(p.pos) && p.blk < 1.2) score--;
    if (g.label === "Weak on the boards" && ["PF", "C"].includes(p.pos) && p.reb < 8) score--;
    if (g.label === "No perimeter pressure" && ["PG", "SG", "SF"].includes(p.pos) && p.stl < 1) score--;
  }
  return score >= 2 ? "EXCELLENT" : score === 1 ? "GOOD" : score === 0 ? "NEUTRAL" : "POOR";
};

export const fitColor = (fit, T) =>
  fit === "EXCELLENT" ? T.green : fit === "GOOD" ? "#9acd6a" : fit === "POOR" ? T.red : T.textDim;
