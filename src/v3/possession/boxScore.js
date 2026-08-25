// ── Box score ────────────────────────────────────────────────────────────────
// Every number here is WRITTEN BY AN EVENT. There is no post-hoc allocation
// step: no "distribute assists to match FGM", no "assign rebounds from RPG".
// The team line is the sum of the player lines by construction, because the
// team line is only ever incremented through the same call that increments a
// player line.
//
// Statistics that are not modelled are not exposed. Personal fouls are tracked
// INTERNALLY only (see PART 25): with no foul-outs and no bench, a displayed PF
// total would imply a disqualification rule that does not exist.

export const PLAYER_STATS = ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "to"];

export const createTeamBox = (team) => ({
  side: team.side,
  players: team.players.map((p) => ({
    cardId: p.cardId, personId: p.personId, name: p.name, position: p.position,
    pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0,
    _pf: 0, // internal only — never surfaced
  })),
  totals: {
    pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0,
    possessions: 0,
  },
});

/**
 * The only way a statistic changes. Player and team move together, so they
 * cannot diverge — a conservation bug would have to be a bug in this one
 * function rather than anywhere in the engine.
 */
export const credit = (box, playerIndex, stat, n = 1) => {
  const row = box.players[playerIndex];
  if (!row) throw new Error(`credit: no player at index ${playerIndex}`);
  if (stat === "_pf") { row._pf += n; return; }
  if (!Object.prototype.hasOwnProperty.call(row, stat)) throw new Error(`credit: unknown stat "${stat}"`);
  row[stat] += n;
  box.totals[stat] += n;
  // REB is derived from its parts at the moment they are credited, never
  // reconstructed later.
  if (stat === "oreb" || stat === "dreb") { row.reb += n; box.totals.reb += n; }
};

const pct = (made, att) => (att > 0 ? Math.round((made / att) * 1000) / 1000 : null);

/** Finalise: percentages only, no new counting. */
export const finaliseBox = (box) => ({
  side: box.side,
  players: box.players.map(({ _pf, ...row }) => ({ ...row })),
  totals: {
    ...box.totals,
    fgPct: pct(box.totals.fgm, box.totals.fga),
    tpPct: pct(box.totals.tpm, box.totals.tpa),
    ftPct: pct(box.totals.ftm, box.totals.fta),
  },
  // Kept out of the consumer shape but available for internal analysis, with
  // the limitation stated rather than implied.
  internal: {
    personalFouls: box.players.map((p) => ({ cardId: p.cardId, pf: p._pf })),
    personalFoulNote: "Tracked for analysis only. No disqualification is modelled: there are no bench players to replace a fouled-out starter, so a six-foul rule would end the game with four players.",
  },
});
