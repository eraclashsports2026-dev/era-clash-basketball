// ── Server-authoritative game core ─────────────────────────────────────────────
// The browser sends player IDs and a mode; EVERYTHING competitive is computed
// here from canonical player data: ratings, chemistry, matchups, and the
// deterministic engine result. Client-supplied scores/winners/stats/ratings are
// never read. The AI narrative layer explains stored results later — it never
// decides them.
import { simulateGame, simulateSeries, mulberry32, matchupEdges } from "../../src/engine.js";
import { teamRating, analyzeBalance } from "../../src/rating.js";
import { genOpponent } from "../../src/draft.js";
import { VERSIONS } from "../../src/versions.js";

// Server-side random seed → reproducible result, recorded on the record.
export const newSeed = () => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] | 0;
};

const chemLabels = (team) => {
  const bal = analyzeBalance(team);
  return {
    strengths: bal.bonuses.map((b) => b.label),
    weaknesses: bal.gaps.map((g) => g.label),
    multiplier: bal.multiplier,
  };
};

// Deterministic templated recap built only from calculated fields — the
// Postgame fallback when AI narration is unavailable. No invented claims.
export const templateSummary = (core, goldChem, blueChem) => {
  const winner = core.winner === "Gold" ? "Team Gold" : "Team Blue";
  const loser = core.winner === "Gold" ? "Team Blue" : "Team Gold";
  const winEdges = (core.edges || [])
    .filter((e) => (core.winner === "Gold" ? e.edge > 0 : e.edge < 0))
    .slice(0, 2);
  const edgeText = winEdges.length
    ? `behind ${winEdges.map((e) => `a ${Math.abs(e.edge) >= 10 ? "decisive" : "clear"} ${e.category.toLowerCase()} edge`).join(" and ")}`
    : "in a matchup with no dominant statistical edge";
  const chem = core.winner === "Gold" ? goldChem : blueChem;
  const loserChem = core.winner === "Gold" ? blueChem : goldChem;
  const chemText = loserChem.weaknesses.length
    ? ` ${loser} was held back by ${loserChem.weaknesses[0].toLowerCase()}.`
    : chem.strengths.length
      ? ` ${winner}'s ${chem.strengths[0].toLowerCase()} set the tone.`
      : "";
  return `${winner} won ${core.seriesResult} ${edgeText}.${chemText} ${core.mvp} led the way.`;
};

// Deterministic 2–3 sentence MVP explanation from the computed result only:
// the MVP's actual line, their scoring rank in the game, the winning side, and
// the winner's biggest real matchup edge. Used as the always-present fallback;
// the AI narrative may replace it with a richer version, never a thinner one.
export const mvpSummary = (core) => {
  const row = core.mvpLine;
  if (!row) return "";
  const winName = core.winner === "Gold" ? "Team Gold" : "Team Blue";
  const allRows = [...core.teamAStats, ...core.teamBStats];
  const ledAll = row.pts >= Math.max(...allRows.map((r) => r.pts));
  const contributions = [];
  if (row.ast >= 5) contributions.push(`${row.ast} assists that kept the offense organized`);
  if (row.reb >= 8) contributions.push(`${row.reb} rebounds that ended possessions`);
  if (row.stl + row.blk >= 3) contributions.push(`${row.stl + row.blk} combined steals and blocks on the defensive end`);
  const s1 = `${row.name} ${ledAll ? "led all scorers" : `paced ${winName}`} with ${row.pts} points${contributions.length ? `, adding ${contributions[0]}` : ` on the winning side`}.`;
  const edge = core.keyEdge && Math.abs(core.keyEdge.edge) > 0 ? core.keyEdge : null;
  const s2 = edge
    ? `That production landed exactly where ${winName} already held its biggest edge — ${edge.category.toLowerCase()} (+${Math.abs(edge.edge)}) — turning a structural advantage into points.`
    : `That production came in a matchup with no dominant structural edge, which made every bucket count double.`;
  const s3 = `In a ${core.seriesResult} ${winName} win, no one did more to decide it.`;
  return `${s1} ${s2} ${s3}`;
};

// Compute the full authoritative result for a validated request.
// gold/blue: arrays of 5 canonical player objects. mode: validated.
export const computeResult = (mode, gold, blue, seed) => {
  const rng = mulberry32(seed);
  const base = {
    versions: { ...VERSIONS },
    seed,
    goldRating: teamRating(gold),
    blueRating: blue ? teamRating(blue) : null,
    goldChem: chemLabels(gold),
    blueChem: blue ? chemLabels(blue) : null,
  };

  if (mode === "82") {
    // Full engine season server-side: 82 games vs era-pool opponents.
    let wins = 0, losses = 0;
    let finale = null, finaleOpp = null;
    for (let i = 0; i < 82; i++) {
      const opp = genOpponent(rng);
      const g = simulateGame(gold, opp, rng);
      if (g.winner === "Gold") wins++; else losses++;
      if (i === 81) { finale = g; finaleOpp = opp; }
    }
    return {
      ...base,
      mode,
      wins,
      losses,
      blueIds: finaleOpp.map((p) => p.id),
      blueRating: teamRating(finaleOpp),
      blueChem: chemLabels(finaleOpp),
      core: finale,
      fallbackSummary: templateSummary(finale, base.goldChem, chemLabels(finaleOpp)),
      mvpFallback: mvpSummary(finale),
    };
  }

  if (mode === "tournament") {
    const roundNames = ["Round 1", "Round 2", "Conference Finals", "Finals"];
    const rounds = [];
    for (let r = 0; r < 4; r++) {
      const opp = genOpponent(rng);
      const s = simulateSeries(gold, opp, rng);
      const advanced = s.winner === "Gold";
      rounds.push({
        name: roundNames[r],
        oppIds: opp.map((p) => p.id),
        core: s,
        advanced,
        fallbackSummary: templateSummary(s, base.goldChem, chemLabels(opp)),
        mvpFallback: mvpSummary(s),
      });
      if (!advanced) break;
    }
    const won = rounds.length === 4 && rounds[3].advanced;
    return { ...base, mode, rounds, won };
  }

  const series = mode === "best7";
  const core = series ? simulateSeries(gold, blue, rng) : simulateGame(gold, blue, rng);
  return {
    ...base,
    mode,
    core,
    fallbackSummary: templateSummary(core, base.goldChem, base.blueChem),
    mvpFallback: mvpSummary(core),
  };
};

// Daily leaderboard score, computed ONLY from the stored server result.
export const dailyScore = (result) => {
  const core = result.core;
  const won = core.winner === "Gold";
  const margin = Math.abs(core.finalScore.gold - core.finalScore.blue) * (won ? 1 : -1);
  return (won ? 1000 : 0) + 500 + Math.max(-50, Math.min(50, margin));
};

export { matchupEdges };
