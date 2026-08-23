// ── EraClash Deterministic Result Engine (simulation_engine 2.1) ──────────────
// Computes structured game results locally from player data, rating v2, and
// chemistry — no LLM in the loop. Used for:
//   • Matchup edges shown in Postgame (real numbers, never invented for looks)
//   • Win 82 season games (82 LLM calls → 0; the LLM narrates the finale only)
//   • The benchmark harness (reproducible, seedable)
// The AI narrative layer explains results; it does not decide engine results.
//
// Target architecture: PLAYER DATA → ATTRIBUTES → CHEMISTRY → MATCHUP ENGINE
// → RESULT ENGINE → STRUCTURED RESULT → AI NARRATIVE.
import { slotRating, analyzeBalance, teamRating } from "./rating.js";
import { teamAttributeProfile } from "./attributes.js";
import { VERSIONS } from "./versions.js";

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

// Seeded RNG (shared with Daily Challenge seeding)
export const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ── Matchup model ──────────────────────────────────────────────────────────────
// Category scores derive from real player stats/accolades (plus curated
// attributes where available). Edges are the A−B differences, scaled to a
// human-readable ±20 band. These feed the UI directly — no cosmetic numbers.
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

export const categoryScores = (team) => {
  const t = team.filter(Boolean);
  const guards = t.filter((p) => ["PG", "SG"].includes(p.pos));
  const attrs = teamAttributeProfile(t);
  return {
    "Perimeter Creation": sum(t, (p) => p.ast * 2.2 + p.pts * 0.25) + (attrs.playmaking || 0) * 2,
    "Interior Presence": sum(t, (p) => (["PF", "C"].includes(p.pos) ? p.reb * 0.9 + p.blk * 3 + p.pts * 0.2 : 0)),
    "Rim Protection": sum(t, (p) => p.blk * 4 + p.dpoy * 3 + (["PF", "C"].includes(p.pos) ? p.ad1 * 2 : 0)),
    "Rebounding": sum(t, (p) => p.reb),
    "Perimeter Defense": sum(guards.concat(t.filter((p) => p.pos === "SF")), (p) => p.stl * 3 + p.ad1 * 2.5 + p.ad2 + p.dpoy * 3),
    "Spacing & Shooting": (attrs.outsideGravity || 0) * 5 + sum(t, (p) => (["PG", "SG", "SF"].includes(p.pos) ? p.pts * 0.35 : p.pts * 0.15)),
    "Star Power": t.map((p, i) => slotRating(p, POSITIONS[i] || p.pos)).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) / 10,
  };
};

// Edges: positive means teamA advantage. Scaled per-category so the numbers
// read like broadcast graphics (±20 max) while preserving ordering.
export const matchupEdges = (teamA, teamB) => {
  const a = categoryScores(teamA), b = categoryScores(teamB);
  const scale = {
    "Perimeter Creation": 0.28, "Interior Presence": 0.35, "Rim Protection": 0.55,
    "Rebounding": 0.55, "Perimeter Defense": 0.55, "Spacing & Shooting": 0.45, "Star Power": 0.28,
  };
  return Object.keys(a).map((k) => ({
    category: k,
    edge: Math.max(-20, Math.min(20, Math.round((a[k] - b[k]) * scale[k]))),
  })).sort((x, y) => Math.abs(y.edge) - Math.abs(x.edge));
};

// ── Single game ────────────────────────────────────────────────────────────────
const round1 = (x) => Math.round(x * 10) / 10;

const allocateBox = (team, teamPts, rng, series) => {
  const t = team.filter(Boolean);
  // offensive share ∝ scoring average with noise; then rescale to the team total
  const weights = t.map((p) => Math.max(2, p.pts) * (0.8 + rng() * 0.4));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let pts = t.map((p, i) => Math.round((weights[i] / wSum) * teamPts));
  // fix rounding drift so player points reconcile with the team total exactly
  let drift = teamPts - pts.reduce((a, b) => a + b, 0);
  for (let i = 0; drift !== 0 && i < 20; i++) {
    const j = i % pts.length;
    const step = drift > 0 ? 1 : -1;
    if (pts[j] + step >= 0) { pts[j] += step; drift -= step; }
  }
  const jitter = (v) => Math.max(0, v * (0.75 + rng() * 0.5));
  return t.map((p, i) => ({
    name: p.name,
    pts: pts[i],
    reb: series ? round1(jitter(p.reb)) : Math.round(jitter(p.reb)),
    ast: series ? round1(jitter(p.ast)) : Math.round(jitter(p.ast)),
    stl: series ? round1(jitter(p.stl)) : Math.round(jitter(p.stl)),
    blk: series ? round1(jitter(p.blk)) : Math.round(jitter(p.blk)),
  }));
};

const gameScore = (s) => s.pts + 1.2 * s.reb + 1.5 * s.ast + 3 * s.stl + 3 * s.blk;

// Slot-by-slot duels: each position's Gold player vs the Blue counterpart,
// with the rating gap and both ACTUAL box lines. This is the grounding data
// for every mismatch sentence — nothing generic, nothing invented.
const buildSlotDuels = (teamA, teamB, boxA, boxB) =>
  POSITIONS.map((pos, i) => ({
    pos,
    gold: { name: teamA[i].name, ...boxA[i] },
    blue: { name: teamB[i].name, ...boxB[i] },
    ratingEdge: Math.round(slotRating(teamA[i], pos) - slotRating(teamB[i], pos)),
  }));

const TURNING_MECHANISM = {
  "Perimeter Creation": ["a run built on relentless ball movement", "kept generating open looks faster than the defense could rotate"],
  "Interior Presence": ["a stretch of second-chance points in the paint", "wore the interior defense down possession after possession"],
  "Rim Protection": ["a defensive stand anchored at the rim", "turned away drive after drive and stripped the offense of easy points"],
  "Rebounding": ["control of the glass", "turned missed shots into extra possessions the other side never got back"],
  "Perimeter Defense": ["pressure on the ball that produced live-ball turnovers", "fed transition scoring at the worst possible time for the trailing side"],
  "Spacing & Shooting": ["a barrage of perimeter shooting", "forced the defense out of the paint and opened driving lanes it never closed again"],
  "Star Power": ["a stretch of pure shot-making from the top of the roster", "left the defense without an answer in the half court"],
};

// 4–6 sentence turning-point analysis built ONLY from the computed result:
// the winning side's biggest real edge, the specific positional duel that
// powered it (names + actual box lines), the loser's failed answer, the
// margin, and the MVP. Broad timing comes from the seeded simulation itself;
// no fabricated play-by-play or exact clock times.
const EDGE_SLOTS = {
  "Rim Protection": ["C", "PF"], "Interior Presence": ["C", "PF"], "Rebounding": ["C", "PF"],
  "Perimeter Creation": ["PG", "SG"], "Perimeter Defense": ["PG", "SG", "SF"],
  "Spacing & Shooting": ["SG", "SF", "PG"], "Star Power": ["PG", "SG", "SF", "PF", "C"],
};
const per = (isSeries) => (isSeries ? " a game" : "");

const turningPointText = (winner, keyEdge, margin, mvpRow, quarterLabel, duels, isSeries) => {
  const winName = winner === "Gold" ? "Team Gold" : "Team Blue";
  const loseName = winner === "Gold" ? "Team Blue" : "Team Gold";
  const W = (d) => (winner === "Gold" ? d.gold : d.blue);
  const L = (d) => (winner === "Gold" ? d.blue : d.gold);
  const [mechanism, consequence] = TURNING_MECHANISM[keyEdge?.category] || TURNING_MECHANISM["Star Power"];
  const edgeSize = Math.abs(keyEdge?.edge || 0);

  // the duel most responsible for the key edge: winner's top scorer among the
  // positions that drive that category
  const slots = EDGE_SLOTS[keyEdge?.category] || EDGE_SLOTS["Star Power"];
  const relevant = duels.filter((d) => slots.includes(d.pos));
  const drive = [...relevant].sort((a, b) => W(b).pts - W(a).pts)[0] || duels[0];
  // the loser's best answer anywhere on the floor
  const answer = [...duels].sort((a, b) => L(b).pts - L(a).pts)[0];

  const s1 = `The game turned ${quarterLabel} when ${winName} leaned on ${mechanism} — its biggest built-in advantage over ${loseName} (${keyEdge?.category ?? "overall edge"} ${edgeSize > 0 ? `+${edgeSize}` : ""}).`;
  const s2 = `The swing ran straight through the ${drive.pos} matchup, where ${W(drive).name} was giving ${L(drive).name} problems all night — ${W(drive).pts} points${per(isSeries)}${W(drive).ast >= 5 ? ` with ${W(drive).ast} assists` : W(drive).reb >= 8 ? ` with ${W(drive).reb} rebounds` : ""} against a defender who never found an answer.`;
  const s3 = `That stretch ${consequence}.`;
  const s4 = `${answer.pos === drive.pos ? "Even so, " : ""}${L(answer).name} tried to answer with ${L(answer).pts} points${per(isSeries)} of his own, but with no second front opening up, ${loseName} could never turn stops into a run.`;
  const s5 = mvpRow
    ? `${mvpRow.name} kept the pressure on to the finish, and ${winName} closed it out by ${margin}.`
    : `${winName} closed it out by ${margin}.`;
  return `${s1} ${s2} ${s3} ${s4} ${s5}`;
};

// Simulate one game. Returns a structured GameResult. Deterministic given rng.
export const simulateGame = (teamA, teamB, rng = Math.random) => {
  const rA = teamRating(teamA), rB = teamRating(teamB);
  // Elo-style win probability, wide spread (team ratings span ~700–2300), and
  // clamped so any-given-night upsets always exist: benchmark-calibrated.
  const raw = 1 / (1 + Math.pow(10, -(rA - rB) / 650));
  const pA = Math.max(0.04, Math.min(0.96, raw));
  const aWins = rng() < pA;

  const base = 96 + Math.floor(rng() * 20);             // pace: 96–115 baseline
  const favoriteWon = (rA >= rB) === aWins;
  const expected = Math.min(13, Math.abs(rA - rB) / 90); // rating gap → expected margin
  const margin = favoriteWon
    ? Math.max(1, Math.min(32, Math.round(expected + rng() * 12 - 2)))
    : Math.max(1, Math.min(12, Math.round(1 + rng() * 8))); // upsets are close games
  const loserScore = base;
  const winnerScore = base + margin;
  const scoreA = aWins ? winnerScore : loserScore;
  const scoreB = aWins ? loserScore : winnerScore;

  const boxA = allocateBox(teamA, scoreA, rng, false);
  const boxB = allocateBox(teamB, scoreB, rng, false);
  const slotDuels = buildSlotDuels(teamA, teamB, boxA, boxB);

  const winnerBox = aWins ? boxA : boxB;
  const mvp = [...winnerBox].sort((x, y) => gameScore(y) - gameScore(x))[0];
  const edges = matchupEdges(teamA, teamB);
  const winEdges = edges.filter((e) => (aWins ? e.edge > 0 : e.edge < 0));
  const keyEdge = winEdges[0] || edges[0];

  const q = 3 + Math.floor(rng() * 2); // simulated swing window: 3rd or 4th quarter
  const quarterLabel = q === 3 ? "midway through the third quarter" : "early in the fourth quarter";
  const winnerName = aWins ? "Gold" : "Blue";

  return {
    engine: "deterministic",
    versions: { ...VERSIONS },
    winner: winnerName,
    finalScore: { gold: scoreA, blue: scoreB },
    seriesResult: `${scoreA}-${scoreB}`,
    teamAStats: boxA,
    teamBStats: boxB,
    mvp: mvp.name,
    mvpLine: mvp,
    ratings: { gold: rA, blue: rB, winProbGold: Math.round(pA * 100) / 100 },
    chemistry: { gold: analyzeBalance(teamA), blue: analyzeBalance(teamB) },
    edges,
    keyEdge,
    slotDuels,
    turningPoint: keyEdge
      ? { quarter: `Q${q}`, text: turningPointText(winnerName, keyEdge, margin, mvp, quarterLabel, slotDuels, false) }
      : null,
  };
};

// Best-of-7: play games until one side has 4 wins. Box = per-game averages.
export const simulateSeries = (teamA, teamB, rng = Math.random) => {
  const games = [];
  let a = 0, b = 0;
  while (a < 4 && b < 4) {
    const g = simulateGame(teamA, teamB, rng);
    if (g.winner === "Gold") a++; else b++;
    games.push(g);
  }
  const avg = (boxes) => boxes[0].map((_, i) => {
    const rows = boxes.map((box) => box[i]);
    const m = (f) => round1(rows.reduce((s, r) => s + f(r), 0) / rows.length);
    return { name: rows[0].name, pts: m((r) => r.pts), reb: m((r) => r.reb), ast: m((r) => r.ast), stl: m((r) => r.stl), blk: m((r) => r.blk) };
  });
  const boxA = avg(games.map((g) => g.teamAStats));
  const boxB = avg(games.map((g) => g.teamBStats));
  const slotDuels = buildSlotDuels(teamA, teamB, boxA, boxB);
  const aWon = a === 4;
  const winnerBox = aWon ? boxA : boxB;
  const mvp = [...winnerBox].sort((x, y) => gameScore(y) - gameScore(x))[0];
  const last = games[games.length - 1];
  return {
    engine: "deterministic",
    versions: { ...VERSIONS },
    winner: aWon ? "Gold" : "Blue",
    // winner-first, always: "4-2" means the WINNER took 4 (never "2-4")
    seriesResult: aWon ? `${a}-${b}` : `${b}-${a}`,
    seriesScore: { gold: a, blue: b },
    games: games.map((g) => ({ winner: g.winner, score: g.seriesResult })),
    teamAStats: boxA,
    teamBStats: boxB,
    mvp: mvp.name,
    mvpLine: mvp,
    ratings: last.ratings,
    chemistry: last.chemistry,
    edges: last.edges,
    keyEdge: last.keyEdge,
    slotDuels,
    isSeries: true,
    turningPoint: last.keyEdge
      ? {
          quarter: last.turningPoint?.quarter,
          game: `Game ${games.length}`,
          text: turningPointText(aWon ? "Gold" : "Blue", last.keyEdge, `taking the series ${Math.max(a, b)}-${Math.min(a, b)}`, mvp, "in the deciding stretch of the series", slotDuels, true),
        }
      : null,
  };
};

// Full 82-game season vs a stream of opponents (generator fn returns a team).
export const simulateSeason = (team, genOpp, rng = Math.random) => {
  let wins = 0, losses = 0;
  const games = [];
  for (let i = 0; i < 82; i++) {
    const opp = genOpp(rng);
    const g = simulateGame(team, opp, rng);
    const w = g.winner === "Gold";
    if (w) wins++; else losses++;
    games.push({ w, score: g.seriesResult, opp: opp.map((p) => p.id) });
  }
  return { wins, losses, games };
};
