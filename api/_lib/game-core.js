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
// Postgame fallback when AI narration is unavailable. 4–6 sentences, grounded
// in the slot-by-slot duels (names + actual box lines). No invented claims.
const POS_LABEL = { PG: "the point", SG: "shooting guard", SF: "the wing", PF: "power forward", C: "center" };

export const templateSummary = (core, goldChem, blueChem) => {
  const goldWon = core.winner === "Gold";
  const winner = goldWon ? "Team Gold" : "Team Blue";
  const loser = goldWon ? "Team Blue" : "Team Gold";
  const per = core.isSeries ? " a game" : "";
  const W = (d) => (goldWon ? d.gold : d.blue);
  const L = (d) => (goldWon ? d.blue : d.gold);

  // s1: result + the real structural edges
  const winEdges = (core.edges || [])
    .filter((e) => (goldWon ? e.edge > 0 : e.edge < 0))
    .slice(0, 2);
  const edgeText = winEdges.length
    ? `behind ${winEdges.map((e) => `a ${Math.abs(e.edge) >= 10 ? "decisive" : "clear"} ${e.category.toLowerCase()} edge (+${Math.abs(e.edge)})`).join(" and ")}`
    : "in a matchup with no dominant structural edge";
  const s1 = `${winner} ${core.isSeries ? "took the series" : "won"} ${core.seriesResult} ${edgeText}.`;

  // s2–s3: the two most lopsided duels the winner claimed, by scoring gap
  const duels = core.slotDuels || [];
  const wonDuels = duels
    .filter((d) => W(d).pts > L(d).pts)
    .sort((a, b) => (W(b).pts - L(b).pts) - (W(a).pts - L(a).pts));
  const duelSentence = (d, lead) => {
    const w = W(d), l = L(d);
    const extra = w.ast >= 5 ? ` and ${w.ast} assists` : w.reb >= 8 ? ` and ${w.reb} rebounds` : w.stl + w.blk >= 3 ? ` with ${w.stl + w.blk} combined steals and blocks` : "";
    return `${lead} at ${POS_LABEL[d.pos]}, where ${w.name} outplayed ${l.name} — ${w.pts} points${per}${extra} to ${l.name.split(" ").slice(-1)[0]}'s ${l.pts}.`;
  };
  const s2 = wonDuels[0] ? duelSentence(wonDuels[0], "The defining mismatch came") : "";
  const s3 = wonDuels[1] ? duelSentence(wonDuels[1], "The gap widened") : "";

  // s4: the loser's best duel — honest about where they actually competed
  const lostDuels = duels
    .filter((d) => L(d).pts > W(d).pts)
    .sort((a, b) => (L(b).pts - W(b).pts) - (L(a).pts - W(a).pts));
  const s4 = lostDuels[0]
    ? `${L(lostDuels[0]).name} gave ${loser} its best minutes, taking his matchup with ${W(lostDuels[0]).name} ${L(lostDuels[0]).pts}-${W(lostDuels[0]).pts}, but one duel was never going to swing it.`
    : `No ${loser} starter clearly won his individual matchup, and that clean sweep across the five slots told the story.`;

  // s5: chemistry context (real labels)
  const chem = goldWon ? goldChem : blueChem;
  const loserChem = goldWon ? blueChem : goldChem;
  const s5 = loserChem.weaknesses.length
    ? `Roster construction mattered too: ${loser} was fighting its own ${loserChem.weaknesses[0].toLowerCase()} all ${core.isSeries ? "series" : "game"}.`
    : chem.strengths.length
      ? `${winner}'s ${chem.strengths[0].toLowerCase()} kept every run organized.`
      : "";

  // s6: MVP capper
  const s6 = `${core.mvp} led the way.`;
  return [s1, s2, s3, s4, s5, s6].filter(Boolean).join(" ");
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
