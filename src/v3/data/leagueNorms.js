// ── League environment norms (per-team, per-game, at each era's anchor season) ─
// Used to translate RAW HISTORICAL PRODUCTION into RELATIVE-TO-ERA performance
// before deriving basketball capability (see docs/simulation-v3/
// translation-doctrine.md). 30 PPG in a league averaging 117 is not the same
// feat as 30 PPG in a league averaging 97 — and rebounding environments differ
// even more (1960s miss volume inflated every rebound total).
//
// HONESTY RULES ENCODED HERE:
// · steals/blocks were NOT officially recorded before 1973-74 → null. Any
//   steal/block-derived capability for pre-1974 players is an estimate and is
//   marked LOW confidence in provenance — never presented as measurement.
// · Team turnovers were not consistently recorded before the mid-1970s → null.
// · Values are league-average per-team per-game at the anchor season, verified
//   against standard public league-average tables (basketball-reference,
//   researched 2026-08-23). provenance: VERIFIED (recorded) / null (unrecorded).
export default {
  norms: {
    "1950s": { anchorSeason: "1955-56", ppg: 99, rpg: 60.1, apg: 24.3, spg: null, bpg: null, fgPct: 0.387, tovPg: null },
    "1960s": { anchorSeason: "1966-67", ppg: 117.4, rpg: 67.3, apg: 22.4, spg: null, bpg: null, fgPct: 0.441, tovPg: null },
    "1970s": { anchorSeason: "1974-75", ppg: 102.6, rpg: 47.1, apg: 23.8, spg: 8.8, bpg: 4.3, fgPct: 0.457, tovPg: 19.8 },
    "1980s": { anchorSeason: "1985-86", ppg: 110.2, rpg: 43.6, apg: 26, spg: 8.8, bpg: 5.3, fgPct: 0.487, tovPg: 17.8 },
    "1990s": { anchorSeason: "1992-93", ppg: 105.3, rpg: 43.1, apg: 24.7, spg: 8.6, bpg: 5.2, fgPct: 0.473, tovPg: 15.9 },
    "2000s": { anchorSeason: "2004-05", ppg: 97.2, rpg: 41.9, apg: 21.3, spg: 7.5, bpg: 4.9, fgPct: 0.447, tovPg: 14.5 },
    "2010s": { anchorSeason: "2015-16", ppg: 102.7, rpg: 43.8, apg: 22.3, spg: 7.8, bpg: 5, fgPct: 0.452, tovPg: 14.4 },
    "2020s": { anchorSeason: "2023-24", ppg: 114.2, rpg: 43.5, apg: 26.7, spg: 7.5, bpg: 5.1, fgPct: 0.474, tovPg: 13.6 },
  },
  recordingNotes: 'Steals and blocks: no official NBA recording before 1973-74. Team turnovers: inconsistent before the mid-1970s. Pre-1974 stl/blk-derived capabilities are estimates (LOW confidence), never measurements.',
};
