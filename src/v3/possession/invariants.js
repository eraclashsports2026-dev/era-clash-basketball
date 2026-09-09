// ── Statistical invariants ───────────────────────────────────────────────────
// Not a formality. Every one of these has a failure mode behind it that a
// simulation engine reaches for naturally: allocating assists after the fact,
// generating steals independently of turnovers, handing out rebounds from
// historical RPG, letting a blocked shot vanish instead of staying an attempt.
//
// A violation is a defect, not a warning. The engine asserts these on every
// game in development and the benchmark asserts them across thousands.

// `side` is carried as a field rather than only prefixed into `detail`, so
// reporting can sample both sides evenly instead of parsing it back out of a
// string. See assertNoViolations for why that matters.
const VIOLATION = (code, detail, side = null) => ({ code, detail, side });

/** Player lines must sum to the team line, for every counting statistic. */
const SUMMED = ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "to"];

export const checkTeamBox = (box, opponentBox, label) => {
  const raw = [];
  // Collected without a side, then stamped once on return, so a new check
  // added below cannot forget to label itself.
  const v = raw;
  const t = box.totals;

  for (const stat of SUMMED) {
    const sum = box.players.reduce((a, p) => a + (p[stat] || 0), 0);
    if (sum !== t[stat]) v.push(VIOLATION("PLAYER_TEAM_MISMATCH", `${label}.${stat}: players ${sum} != team ${t[stat]}`));
  }

  for (const p of box.players) {
    if (p.oreb + p.dreb !== p.reb) v.push(VIOLATION("REB_PARTS", `${label}.${p.cardId}: ${p.oreb}+${p.dreb} != ${p.reb}`));
    if (p.tpm > p.tpa) v.push(VIOLATION("TPM_GT_TPA", `${label}.${p.cardId}`));
    if (p.tpm > p.fgm) v.push(VIOLATION("TPM_GT_FGM", `${label}.${p.cardId}`));
    if (p.tpa > p.fga) v.push(VIOLATION("TPA_GT_FGA", `${label}.${p.cardId}`));
    if (p.fgm > p.fga) v.push(VIOLATION("FGM_GT_FGA", `${label}.${p.cardId}`));
    if (p.ftm > p.fta) v.push(VIOLATION("FTM_GT_FTA", `${label}.${p.cardId}`));
    // Points must be exactly what the shots produced — not an independent tally.
    const derived = (p.fgm - p.tpm) * 2 + p.tpm * 3 + p.ftm;
    if (derived !== p.pts) v.push(VIOLATION("PTS_NOT_DERIVED", `${label}.${p.cardId}: shots imply ${derived}, line says ${p.pts}`));
    for (const stat of SUMMED) {
      if (!Number.isFinite(p[stat])) v.push(VIOLATION("NOT_FINITE", `${label}.${p.cardId}.${stat}`));
      if (p[stat] < 0) v.push(VIOLATION("NEGATIVE", `${label}.${p.cardId}.${stat} = ${p[stat]}`));
    }
  }

  if (t.oreb + t.dreb !== t.reb) v.push(VIOLATION("TEAM_REB_PARTS", label));
  if (t.ftm > t.fta) v.push(VIOLATION("TEAM_FTM_GT_FTA", label));
  // An assist requires a made field goal to assist.
  if (t.ast > t.fgm) v.push(VIOLATION("AST_GT_FGM", `${label}: ${t.ast} assists on ${t.fgm} made field goals`));

  if (opponentBox) {
    // A steal is a way a turnover happened; it cannot be generated on its own.
    if (t.stl > opponentBox.totals.to) v.push(VIOLATION("STL_GT_OPP_TO", `${label}: ${t.stl} steals vs ${opponentBox.totals.to} opponent turnovers`));
    // A block requires an opponent attempt to block.
    if (t.blk > opponentBox.totals.fga) v.push(VIOLATION("BLK_GT_OPP_FGA", `${label}: ${t.blk} blocks vs ${opponentBox.totals.fga} opponent attempts`));
  }
  return raw.map((x) => ({ ...x, side: label }));
};

/** Whole-game invariants, including the ones about the game itself. */
export const checkGame = (game) => {
  const v = [
    ...checkTeamBox(game.gold, game.blue, "gold"),
    ...checkTeamBox(game.blue, game.gold, "blue"),
  ];

  if (game.gold.totals.pts === game.blue.totals.pts) {
    v.push(VIOLATION("FINAL_TIE", "a game may never end level — regulation ties go to overtime"));
  }
  const winnerPts = game.winner === "Gold" ? game.gold.totals.pts : game.blue.totals.pts;
  const loserPts = game.winner === "Gold" ? game.blue.totals.pts : game.gold.totals.pts;
  if (!(winnerPts > loserPts)) v.push(VIOLATION("WINNER_NOT_LEADING", `${game.winner} declared winner with ${winnerPts} vs ${loserPts}`));

  if (game.periods < 4) v.push(VIOLATION("TOO_FEW_PERIODS", `${game.periods} periods`));
  if (game.overtimes > 0 && game.periods !== 4 + game.overtimes) v.push(VIOLATION("PERIOD_COUNT", `${game.periods} periods with ${game.overtimes} overtimes`));

  // Three-point shots must not exist in an era that had no three-point line.
  if (!game.threePointLegal) {
    for (const side of ["gold", "blue"]) {
      if (game[side].totals.tpa !== 0 || game[side].totals.tpm !== 0) {
        v.push(VIOLATION("THREE_IN_PRE_THREE_ERA", `${side}: ${game[side].totals.tpa} 3PA in ${game.eraStyleId}`));
      }
    }
  }
  return v;
};

export const assertNoViolations = (game) => {
  const v = checkGame(game);
  if (v.length) {
    // Gold's violations are collected before blue's, so a flat slice(0, 12)
    // reported gold's and silently dropped blue's whenever there were more than
    // twelve. A side-symmetry gate that reads "zero invariant failures" cannot
    // rest on a message that can hide one side's failures, so the sample is
    // drawn evenly from both.
    const bySide = (side) => v.filter((x) => x.side === side);
    const shown = [
      ...bySide("gold").slice(0, 6),
      ...bySide("blue").slice(0, 6),
      ...v.filter((x) => x.side == null).slice(0, 4),
    ];
    const lines = shown.map((x) => `  ${x.code}: ${x.detail}`).join("\n");
    const omitted = v.length - shown.length;
    throw new Error(`possession engine produced ${v.length} invariant violation(s)`
      + ` (gold ${bySide("gold").length}, blue ${bySide("blue").length}):\n${lines}`
      + (omitted > 0 ? `\n  ... and ${omitted} more` : ""));
  }
  return true;
};
