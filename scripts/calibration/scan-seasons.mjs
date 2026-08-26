#!/usr/bin/env node
// ── Historical fixture feasibility scanner ──────────────────────────────────
// For a candidate team-season, how many of that season's actual players have
// cards, and can they field a legal five?
//
// This exists because the card `team` field is a player's PRIMARY franchise for
// a decade, not every team he played for — Dennis Rodman's 1990s card says
// "Pistons" but he played for the 1996-98 Bulls. Scanning by card label
// therefore misses real historical units, and scanning the SEASON ROSTER finds
// them.
//
//   npm run calibration:scan-seasons
import { writeFileSync, mkdirSync } from "node:fs";
import { fetchArticle, parsePlayerTable, parseRecord, parseRosterTable } from "./adapters/wikipedia.mjs";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";

const SLOTS = ["PG", "SG", "SF", "PF", "C"];

const normName = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

// Documented renames. Facts about a person, not guesses.
const NAME_EQUIVALENTS = Object.freeze({
  "kareem abduljabbar": ["lew alcindor"],
  "metta world peace": ["ron artest"],
  "nate archibald": ["tiny archibald"],
});

/**
 * Exact names, or a documented alias. Nothing looser.
 *
 * A last-name-plus-first-initial rule matched "Draymond Green" to the 2019-20
 * Lakers' Danny Green, which would have put a player who was never on the team
 * into a fixture labelled historical. In a corpus whose entire purpose is that
 * these five really played together, a fuzzy match is not a convenience — it is
 * a fabrication.
 */
export const matchesRow = (cardName, rowName) => {
  const a = normName(cardName);
  const b = normName(rowName);
  if (a === b) return true;
  for (const [k, alts] of Object.entries(NAME_EQUIVALENTS)) {
    if ((a === k && alts.includes(b)) || (b === k && alts.includes(a))) return true;
  }
  return false;
};

/** A legal five in PG-C order, by backtracking, or null. */
export const legalFive = (pool) => {
  const can = (p, slot) => (p.positions ?? [p.pos]).includes(slot);
  const assign = (i, used) => {
    if (i === SLOTS.length) return {};
    const options = pool.filter((p) => !used.has(p.id) && can(p, SLOTS[i]))
      .sort((a, b) => (a.positions ?? [a.pos]).length - (b.positions ?? [b.pos]).length);
    for (const c of options) {
      const rest = assign(i + 1, new Set([...used, c.id]));
      if (rest) return { [SLOTS[i]]: c.id, ...rest };
    }
    return null;
  };
  const found = assign(0, new Set());
  return found ? SLOTS.map((s) => found[s]) : null;
};

/**
 * Which cards correspond to players who actually appeared for this team-season.
 *
 * A card only counts when its DECADE also contains the season: Kareem's 1970s
 * card must not be used to represent his 1980s Lakers seasons, because the card
 * carries his 1970s production.
 */
export const scanSeason = async ({ article, eraStyleId, minGames = 20 }) => {
  const a = await fetchArticle(article);
  const table = parsePlayerTable(a.html);
  const roster = parseRosterTable(a.html);
  // Membership can come from the roster table even when no statistics exist.
  // Wikipedia's coverage of the two is independent, and treating a missing
  // statistics table as a missing team would understate what is verifiable.
  const source = table ? "PLAYER_STATISTICS" : roster ? "ROSTER_ONLY" : null;
  if (!source) return { article, eraStyleId, error: "no player statistics table and no roster table" };
  const record = parseRecord(a.html);

  const startYear = Number(article.slice(0, 4));
  const decade = `${Math.floor(startYear / 10) * 10}s`;

  const matched = [];
  const rows = table ? table.players.filter((r) => (r.gp ?? 0) >= minGames) : roster.players;
  for (const row of rows) {
    const card = PLAYERS.find((p) => p.decade === decade && matchesRow(p.name, row.name));
    if (card) matched.push({ card, row });
  }

  const five = legalFive(matched.map((m) => m.card));
  return {
    article,
    eraStyleId,
    decade,
    season: `${startYear}-${String(startYear + 1).slice(2)}`,
    record,
    revisionId: a.revisionId,
    sourceUrl: a.sourceUrl,
    contentHash: a.contentHash,
    evidence: source,
    rosterSize: rows.length,
    cardedPlayers: matched.length,
    canFieldLegalFive: Boolean(five),
    five,
    matched: matched.map((m) => ({
      cardId: m.card.id, name: m.card.name, positions: m.card.positions ?? [m.card.pos],
      gp: m.row.gp ?? null, ppg: m.row.ppg ?? null, rpg: m.row.rpg ?? null, apg: m.row.apg ?? null, fgPct: m.row.fgPct ?? null,
    })).sort((x, y) => (y.ppg ?? 0) - (x.ppg ?? 0)),
  };
};

// Candidate team-seasons: a broad sweep across all eight eras, chosen for
// documented identity rather than for whether the engine does well on them.
export const CANDIDATES = [
  // 1950s
  ["1956–57 Boston Celtics season", "1950s"], ["1958–59 Boston Celtics season", "1950s"],
  ["1955–56 Philadelphia Warriors season", "1950s"], ["1953–54 Minneapolis Lakers season", "1950s"],
  ["1958–59 St. Louis Hawks season", "1950s"],
  // 1960s
  ["1961–62 Boston Celtics season", "1960s"], ["1962–63 Boston Celtics season", "1960s"],
  ["1964–65 Boston Celtics season", "1960s"], ["1966–67 Boston Celtics season", "1960s"],
  ["1961–62 Philadelphia Warriors season", "1960s"], ["1963–64 San Francisco Warriors season", "1960s"],
  ["1963–64 Cincinnati Royals season", "1960s"], ["1965–66 Cincinnati Royals season", "1960s"],
  ["1966–67 Philadelphia 76ers season", "1960s"], ["1968–69 Los Angeles Lakers season", "1960s"],
  ["1964–65 St. Louis Hawks season", "1960s"],
  // 1970s
  ["1970–71 Milwaukee Bucks season", "1970s"], ["1971–72 Los Angeles Lakers season", "1970s"],
  ["1972–73 New York Knicks season", "1970s"], ["1973–74 Boston Celtics season", "1970s"],
  ["1976–77 Portland Trail Blazers season", "1970s"], ["1977–78 San Antonio Spurs season", "1970s"],
  ["1974–75 Golden State Warriors season", "1970s"], ["1978–79 Seattle SuperSonics season", "1970s"],
  // 1980s
  ["1981–82 Boston Celtics season", "1980s"], ["1985–86 Boston Celtics season", "1980s"],
  ["1986–87 Los Angeles Lakers season", "1980s"], ["1987–88 Los Angeles Lakers season", "1980s"],
  ["1982–83 Philadelphia 76ers season", "1980s"], ["1988–89 Detroit Pistons season", "1980s"],
  ["1984–85 Milwaukee Bucks season", "1980s"], ["1986–87 Dallas Mavericks season", "1980s"],
  // 1990s
  ["1991–92 Chicago Bulls season", "1990s"], ["1995–96 Chicago Bulls season", "1990s"],
  ["1996–97 Chicago Bulls season", "1990s"], ["1992–93 Phoenix Suns season", "1990s"],
  ["1996–97 Utah Jazz season", "1990s"], ["1993–94 New York Knicks season", "1990s"],
  ["1994–95 Houston Rockets season", "1990s"], ["1998–99 San Antonio Spurs season", "1990s"],
  ["1989–90 Detroit Pistons season", "1990s"],
  // 2000s
  ["2000–01 Los Angeles Lakers season", "2000s"], ["2003–04 Detroit Pistons season", "2000s"],
  ["2004–05 San Antonio Spurs season", "2000s"], ["2006–07 Phoenix Suns season", "2000s"],
  ["2007–08 Boston Celtics season", "2000s"], ["2008–09 Orlando Magic season", "2000s"],
  ["2005–06 Dallas Mavericks season", "2000s"],
  // 2010s
  ["2012–13 Miami Heat season", "2010s"], ["2015–16 Golden State Warriors season", "2010s"],
  ["2016–17 Golden State Warriors season", "2010s"], ["2013–14 San Antonio Spurs season", "2010s"],
  ["2013–14 Los Angeles Clippers season", "2010s"], ["2017–18 Houston Rockets season", "2010s"],
  ["2018–19 Milwaukee Bucks season", "2010s"], ["2014–15 Atlanta Hawks season", "2010s"],
  // 2020s
  ["2020–21 Milwaukee Bucks season", "2020s"], ["2022–23 Denver Nuggets season", "2020s"],
  ["2023–24 Boston Celtics season", "2020s"], ["2021–22 Golden State Warriors season", "2020s"],
  ["2020–21 Phoenix Suns season", "2020s"], ["2022–23 Cleveland Cavaliers season", "2020s"],
  ["2021–22 Memphis Grizzlies season", "2020s"], ["2023–24 Oklahoma City Thunder season", "2020s"],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = [];
  for (const [article, era] of CANDIDATES) {
    try {
      const r = await scanSeason({ article, eraStyleId: era });
      results.push(r);
      if (r.error) { console.log(`  ${era}  ${article.padEnd(44)} — ${r.error}`); continue; }
      const flag = r.canFieldLegalFive ? "LEGAL FIVE" : "          ";
      console.log(`  ${era}  ${article.padEnd(44)} ${String(r.cardedPlayers).padStart(2)} carded  ${flag}  ${r.evidence.padEnd(18)} ${r.matched.slice(0, 5).map((m) => m.name.split(" ").pop()).join(", ")}`);
    } catch (e) {
      console.log(`  ${era}  ${article.padEnd(44)} — ${e.message.slice(0, 60)}`);
      results.push({ article, eraStyleId: era, error: e.message });
    }
  }
  const usable = results.filter((r) => r.canFieldLegalFive);
  console.log(`\n${usable.length} of ${CANDIDATES.length} candidate team-seasons can field a legal five from carded players`);
  const byEra = {};
  for (const r of usable) byEra[r.eraStyleId] = (byEra[r.eraStyleId] ?? 0) + 1;
  console.log(`by era: ${JSON.stringify(byEra)}`);
  mkdirSync(".cache/calibration", { recursive: true });
  writeFileSync(".cache/calibration/season-scan.json", JSON.stringify({ results }, null, 2) + "\n");
  console.log("\nwrote .cache/calibration/season-scan.json");
}
