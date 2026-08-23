// ── Benchmark lineup scenarios ─────────────────────────────────────────────────
// Internal simulation-quality harness (not a product surface). Lineups are
// referenced by player-database ids in slot order PG/SG/SF/PF/C. "Style" teams
// are inspired by historically dominant rosters, assembled from the existing
// player database — no new player data is invented here.
export const LINEUPS = {
  balanced_elite:      ["magic-80s", "moncrief-80s", "bird-80s", "duncan-00s", "hak-90s"],
  volume_scorers:      ["pete-70s", "george-70s", "alex-80s", "spencer-70s", "bob-mc-70s"],
  elite_spacing:       ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"],
  poor_spacing_titans: ["magic-80s", "jordan-90s", "lebron-10s", "duncan-00s", "shaq-00s"],
  defensive_wall:      ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "hak-90s"],
  small_ball:          ["curry-10s", "klay-10s", "butler-10s", "draymond-10s", "bam-20s"],
  elite_size:          ["kidd-00s", "kobe-00s", "lebron-10s", "duncan-00s", "shaq-90s"],
  interior_dominance:  ["stock-90s", "hal-60s", "elvin-70s", "moses-80s", "wilt-60s"],
  no_playmaking:       ["ben-00s", "reggie-90s", "dantley-80s", "mcHale-80s", "ewing-90s"],
  hero_ball:           ["ai-00s", "kobe-00s", "carmelo-00s", "zion-20s", "embiid-20s"],
  showtime_style:      ["magic-80s", "cooper-80s", "worthy-80s", "kareem-80s", "parish-80s"],
  nineties_bulls_style:["avery-90s", "jordan-90s", "pippen-90s", "rodman-90s", "luc-90s"],
  seventeen_dubs_style:["curry-10s", "klay-10s", "durant-10s", "draymond-10s", "dj-10s"],
  modern_meta:         ["shai-20s", "ant-20s", "tatum-20s", "giannis-20s", "wemby-20s"],
  glass_and_grit:      ["smart-20s", "jrue-20s", "butler-10s", "rodman-90s", "camby-2ks"],
  old_school_core:     ["oscar-60s", "jerry-60s", "elgin-60s", "bob-60s", "bill-60s"],
};

// Matchups exercising specific hypotheses about the engine. expect (optional)
// is a soft expectation: which side should win the majority of samples.
export const MATCHUPS = [
  { a: "balanced_elite", b: "volume_scorers", note: "construction should beat raw scoring", expect: "a" },
  { a: "elite_spacing", b: "interior_dominance", note: "spacing vs two-big interior era", expect: null },
  { a: "defensive_wall", b: "hero_ball", note: "elite defense vs iso-heavy scoring", expect: "a" },
  { a: "poor_spacing_titans", b: "elite_spacing", note: "talent overload w/ cramped spacing vs shooters", expect: null },
  { a: "small_ball", b: "elite_size", note: "switch+shoot vs size", expect: null },
  { a: "no_playmaking", b: "balanced_elite", note: "no creator should lose the majority", expect: "b" },
  { a: "showtime_style", b: "nineties_bulls_style", note: "style-inspired classic clash", expect: null },
  { a: "seventeen_dubs_style", b: "poor_spacing_titans", note: "spacing meta vs stacked bigs", expect: null },
  { a: "modern_meta", b: "old_school_core", note: "cross-era clash", expect: null },
  { a: "glass_and_grit", b: "volume_scorers", note: "defense/rebounding vs volume", expect: null },
  { a: "balanced_elite", b: "poor_spacing_titans", note: "balance vs raw star power", expect: null },
  { a: "defensive_wall", b: "elite_spacing", note: "defense vs spacing", expect: null },
  { a: "hero_ball", b: "no_playmaking", note: "two flawed teams", expect: null },
  { a: "small_ball", b: "interior_dominance", note: "modern small vs 60s-70s interior", expect: null },
  { a: "modern_meta", b: "seventeen_dubs_style", note: "2020s meta vs 2010s meta", expect: null },
];
