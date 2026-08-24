// ── Server-authoritative V3 result assembly ────────────────────────────────────
// Same authority rules as V2: the client submits IDs only; players, coaches,
// and the Era Style are loaded canonically server-side. The result payload is
// backward-compatible with the V2 postgame shape (core.teamAStats etc.) and
// carries a `v3` block with the possession-engine detail (full box, usage,
// assignments, plans, expectation).
import { simulateGameV3, simulateSeriesV3, simulateSeasonV3, resolveCoach, resolveEra, V3_VERSIONS } from "../../src/v3/engine.js";
import { opponentGenerator, DIFFICULTIES } from "../../src/v3/difficulty.js";
import { expectedWinPct, gameSummary, seriesSummary, turningPointV3, matchupPreviewV3, classifyOutcome, edgeBand } from "../../src/v3/analysis.js";
import { mvpSummary } from "./game-core.js";
import { genOpponent } from "../../src/draft.js";
import { deriveSeed, mulberry32 } from "../../src/v3/seed.js";
import { hashString } from "../../src/v3/seed.js";

// V2-compatible box row (season-style five columns) from a V3 line
const compatRow = (l) => ({ name: l.name, pts: l.pts, reb: l.oreb + l.dreb, ast: l.ast, stl: l.stl, blk: l.blk });

const POS_ORDER = ["PG", "SG", "SF", "PF", "C"];
// Same-slot duels PLUS the engine's real defensive assignment for each player.
// The AI recap is required to narrate duels; without this it invented matchups
// that contradicted the DEFENSIVE ASSIGNMENTS panel on the same screen.
const slotDuelsV3 = (game) => game.gold.lines.map((g, i) => {
  const b = game.blue.lines[i];
  const guardedByBlue = game.assignments.onGold[i]?.defender || null;  // who guarded this Gold player
  const guardedByGold = game.assignments.onBlue[i]?.defender || null;  // who guarded this Blue player
  return {
    pos: POS_ORDER[i] || g.pos,
    gold: { ...compatRow(g), guardedBy: guardedByBlue },
    blue: { ...compatRow(b), guardedBy: guardedByGold },
  };
});

const compatCore = (game, preview) => ({
  engine: "v3-possession",
  winner: game.winner,
  finalScore: game.finalScore,
  seriesResult: game.seriesResult,
  teamAStats: game.gold.lines.map(compatRow),
  teamBStats: game.blue.lines.map(compatRow),
  mvp: game.mvp.name,
  mvpLine: compatRow(game.mvp.line),
  edges: preview.categories.map((c) => ({ category: c.category, edge: c.edge })),
  keyEdge: [...preview.categories].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))[0],
  slotDuels: slotDuelsV3(game),
  turningPoint: null, // filled by caller with V3 turning point text
});


// ── Series helpers (shared by best-of-7 and every tournament round) ───────────
// A series is summarized as a SERIES: averaged lines across games, a series
// MVP from the winning side, and per-game scores. Nothing here describes the
// final game as if it were the whole series.
const seriesAvgLines = (series, side) => series.games[0][side].lines.map((_, i) => {
  const rows = series.games.map((g) => g[side].lines[i]);
  const m = (k) => Math.round((rows.reduce((s, r) => s + r[k], 0) / rows.length) * 10) / 10;
  return { name: rows[0].name, id: rows[0].id, pts: m("pts"), fgm: m("fgm"), fga: m("fga"), tpm: m("tpm"), tpa: m("tpa"), ftm: m("ftm"), fta: m("fta"), oreb: m("oreb"), dreb: m("dreb"), ast: m("ast"), stl: m("stl"), blk: m("blk"), to: m("to"), pf: m("pf") };
});
const seriesMvpOf = (series) => {
  const winnerAvg = seriesAvgLines(series, series.winner === "Gold" ? "gold" : "blue");
  const val = (l) => l.pts + l.ast * 0.7 + (l.oreb + l.dreb) * 0.5;
  return [...winnerAvg].sort((a, b) => val(b) - val(a))[0];
};
const seriesCore = (series, last, preview, era) => ({
  engine: "v3-possession", winner: series.winner,
  seriesResult: series.seriesResult, seriesScore: series.seriesScore, isSeries: true,
  games: series.games.map((g) => ({ winner: g.winner, score: g.seriesResult })),
  teamAStats: seriesAvgLines(series, "gold").map(compatRow),
  teamBStats: seriesAvgLines(series, "blue").map(compatRow),
  mvp: seriesMvpOf(series).name, mvpLine: compatRow(seriesMvpOf(series)),
  edges: preview.categories.map((c) => ({ category: c.category, edge: c.edge })),
  keyEdge: [...preview.categories].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))[0],
  slotDuels: slotDuelsV3(last),
  turningPoint: { game: `Game ${series.games.length}`, text: turningPointV3(last, era) },
});
// Series MVP blurb built from SERIES averages — never a single game's line.
const mvpSeriesV3 = (series, mvp) => {
  const g = series.games.length;
  const eff = mvp.fga ? ` on ${mvp.fgm}-of-${mvp.fga} shooting a night` : "";
  const extra = mvp.ast >= 5 ? ` and ${mvp.ast} assists` : (mvp.oreb + mvp.dreb) >= 9 ? ` and ${mvp.oreb + mvp.dreb} rebounds` : "";
  return `${mvp.name} was the best player of the series, averaging ${mvp.pts} points${eff}${extra} across ${g} games. Over a full series there is nowhere to hide — he carried that load every night, and the ${series.seriesResult} result followed him.`;
};

export const computeResultV3 = (mode, gold, blue, opts, seed) => {
  const coachG = resolveCoach(opts.coachGoldId);
  const coachB = resolveCoach(opts.coachBlueId);
  const era = resolveEra(opts.eraStyleId);
  // Daily fairness (documented model): the official daily V3 seed is DERIVED
  // from the date + both lineups + coaches + era, so two players making
  // identical official decisions get the IDENTICAL game — no luck lottery.
  const gameSeed = mode === "daily" && opts.dailyDate
    ? hashString(`${opts.dailyDate}|${gold.map((p) => p.id).join(",")}|${blue.map((p) => p.id).join(",")}|${opts.coachGoldId}|${opts.coachBlueId}|${era.id}`)
    : seed;

  const base = { versions: { v2: undefined, ...V3_VERSIONS }, seed: gameSeed, eraId: era.id, coachIds: { gold: coachG.id, blue: coachB.id } };

  if (mode === "82") {
    // WHO you face scales with difficulty; HOW games are simulated never does.
    const season = simulateSeasonV3(gold, opponentGenerator(opts.difficulty), coachG, resolveCoach("neutral"), era, gameSeed);
    const preview = matchupPreviewV3(gold, season.finale.opp, coachG, resolveCoach("neutral"), era);
    const exp = expectedWinPct(gold, season.finale.opp, coachG, resolveCoach("neutral"), era, gameSeed);
    const core = compatCore(season.finale.game, preview);
    core.turningPoint = { text: turningPointV3(season.finale.game, era) };
    return {
      ...base, mode, wins: season.wins, losses: season.losses,
      difficulty: DIFFICULTIES[opts.difficulty] ? opts.difficulty : "pro",
      blueIds: season.finale.opp.map((p) => p.id),
      core,
      fallbackSummary: gameSummary(season.finale.game, gold, season.finale.opp, coachG, resolveCoach("neutral"), era, exp),
      mvpFallback: mvpV3(season.finale.game),
      v3: v3Block(season.finale.game, preview, exp),
    };
  }

  if (mode === "best7") {
    const series = simulateSeriesV3(gold, blue, coachG, coachB, era, gameSeed);
    const last = series.games[series.games.length - 1];
    const preview = matchupPreviewV3(gold, blue, coachG, coachB, era);
    const exp = expectedWinPct(gold, blue, coachG, coachB, era, gameSeed);
    const core = seriesCore(series, last, preview, era);
    const seriesMvp = seriesMvpOf(series);
    return {
      ...base, mode, core,
      fallbackSummary: seriesSummary(series, gold, blue, coachG, coachB, era, exp, seriesMvp),
      mvpFallback: mvpSeriesV3(series, seriesMvp),
      v3: { ...v3Block(last, preview, exp), gamesDetail: series.games.map((g) => ({ winner: g.winner, score: g.seriesResult, possessions: g.possessions })) },
    };
  }

  if (mode === "tournament") {
    // Four best-of-7 rounds against difficulty-scaled opponents. Each round is
    // its own derived seed, so a bracket is reproducible from the parent seed.
    const roundNames = ["Round 1", "Round 2", "Conference Finals", "Finals"];
    const genOpp = opponentGenerator(opts.difficulty);
    const oppRng = mulberry32(deriveSeed(gameSeed, 55501));
    const neutral = resolveCoach("neutral");
    const rounds = [];
    for (let r = 0; r < 4; r++) {
      const opp = genOpp(oppRng);
      const series = simulateSeriesV3(gold, opp, coachG, neutral, era, deriveSeed(gameSeed, 600 + r));
      const last = series.games[series.games.length - 1];
      const preview = matchupPreviewV3(gold, opp, coachG, neutral, era);
      const exp = expectedWinPct(gold, opp, coachG, neutral, era, deriveSeed(gameSeed, 600 + r));
      const advanced = series.winner === "Gold";
      const core = seriesCore(series, last, preview, era);
      const mvpLine = seriesMvpOf(series);
      rounds.push({
        name: roundNames[r],
        oppIds: opp.map((p) => p.id),
        core,
        advanced,
        fallbackSummary: seriesSummary(series, gold, opp, coachG, neutral, era, exp, mvpLine),
        mvpFallback: mvpSeriesV3(series, mvpLine),
        v3: v3Block(last, preview, exp),
      });
      if (!advanced) break;
    }
    const won = rounds.length === 4 && rounds[3].advanced;
    return {
      ...base, mode, rounds, won,
      difficulty: DIFFICULTIES[opts.difficulty] ? opts.difficulty : "pro",
      blueIds: rounds[rounds.length - 1].oppIds,
    };
  }

  // single / daily / challenge
  const game = simulateGameV3(gold, blue, coachG, coachB, era, gameSeed);
  const preview = matchupPreviewV3(gold, blue, coachG, coachB, era);
  const exp = expectedWinPct(gold, blue, coachG, coachB, era, gameSeed);
  const core = compatCore(game, preview);
  core.turningPoint = { text: turningPointV3(game, era) };
  return {
    ...base, mode, core,
    fallbackSummary: gameSummary(game, gold, blue, coachG, coachB, era, exp),
    mvpFallback: mvpV3(game),
    v3: v3Block(game, preview, exp),
  };
};

const mvpV3 = (game) => {
  const l = game.mvp.line;
  const eff = l.fga ? ` on ${l.fgm}-of-${l.fga} shooting` : "";
  const extra = l.ast >= 5 ? ` and ${l.ast} assists` : (l.oreb + l.dreb) >= 9 ? ` and ${l.oreb + l.dreb} rebounds` : "";
  return `${l.name} earned it with ${l.pts} points${eff}${extra}. In a ${game.possessions}-possession game, nobody converted their share of the offense into more value. The engine's game score put him clear of every other starter on the floor.`;
};

const v3Block = (game, preview, exp) => ({
  possessions: game.possessions,
  overtimes: game.overtimes,
  // expected vs realized (stored BEFORE anyone sees the score; never rewritten).
  // The exact probability lives here for analytics; the UI shows bands only.
  expectedGoldWinPct: Math.round(exp * 100),
  expectedBand: edgeBand(exp),
  outcomeClass: classifyOutcome(game.winner === "Gold" ? exp : 1 - exp),
  // shot QUALITY vs shot MAKING: expected points from the looks each team
  // generated vs the points they actually scored
  expectedPoints: { gold: game.gold.xPts, blue: game.blue.xPts },
  // in-game coaching adjustments the possession engine actually made
  adjustments: { gold: game.gold.adjustments, blue: game.blue.adjustments },
  // complete reproduction fingerprint (see benchmarks/v3/replay.mjs)
  fingerprint: game.fingerprint,
  fullBox: { gold: game.gold.lines, blue: game.blue.lines },
  teamTotals: { gold: game.gold.totals, blue: game.blue.totals },
  usage: { gold: game.gold.usage, blue: game.blue.usage },
  plans: { gold: game.gold.plan, blue: game.blue.plan },
  assignments: game.assignments,
  preview,
});
