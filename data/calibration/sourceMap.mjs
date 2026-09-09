// ── Fixture → historical source mapping ─────────────────────────────────────
// Which real team-season, if any, each fixture corresponds to.
//
// This distinction decides what a target even MEANS. A fixture whose five
// players never shared a floor has no team-season to be compared against, and
// pretending otherwise would measure the engine against a team that never
// played. That is not a missing number — it is a different question.
import { FIXTURES } from "./fixtures.mjs";

export const SEASON_BASIS = Object.freeze({
  // The documented starting five of a specific, named season. Team-season
  // targets are directly meaningful.
  REAL_TEAM_SEASON: "REAL_TEAM_SEASON",
  // The documented core of a named season, with one or more slots filled by a
  // card from a different team or decade. Team-season targets are a weak
  // REFERENCE, not a target: the roster is close but not the real lineup.
  APPROX_TEAM_SEASON: "APPROX_TEAM_SEASON",
  // Assembled to represent a style. No real team-season corresponds to it.
  SYNTHETIC_LINEUP: "SYNTHETIC_LINEUP",
});

/**
 * Wikipedia article titles per fixture. Wikipedia is CC BY-SA 4.0, which
 * explicitly permits reuse with attribution — the licence is why this source is
 * usable at all, and the attribution is recorded on every value it produces.
 *
 * `null` means no single season article applies. That is a statement about the
 * fixture, not a gap in the research.
 */
export const FIXTURE_SOURCES = Object.freeze({
  // ── real team-seasons ──
  "1980s-celtics-halfcourt": { basis: "REAL_TEAM_SEASON", season: "1985-86", wikipedia: "1985–86 Boston Celtics season" },
  "1990s-bulls-triangle": { basis: "REAL_TEAM_SEASON", season: "1995-96", wikipedia: "1995–96 Chicago Bulls season" },
  "2000s-spurs-balanced": { basis: "REAL_TEAM_SEASON", season: "2004-05", wikipedia: "2004–05 San Antonio Spurs season" },
  "1980s-lakers-showtime": { basis: "REAL_TEAM_SEASON", season: "1986-87", wikipedia: "1986–87 Los Angeles Lakers season" },
  "2000s-pistons-defense": { basis: "REAL_TEAM_SEASON", season: "2003-04", wikipedia: "2003–04 Detroit Pistons season" },
  "2010s-warriors-movement": { basis: "REAL_TEAM_SEASON", season: "2015-16", wikipedia: "2015–16 Golden State Warriors season" },

  // ── approximate team-seasons ──
  "1970s-bucks-balanced": { basis: "APPROX_TEAM_SEASON", season: "1970-71", wikipedia: "1970–71 Milwaukee Bucks season" },
  "1980s-sixers-transition": { basis: "APPROX_TEAM_SEASON", season: "1982-83", wikipedia: "1982–83 Philadelphia 76ers season" },
  "1990s-pistons-physical": { basis: "APPROX_TEAM_SEASON", season: "1989-90", wikipedia: "1989–90 Detroit Pistons season" },
  "2000s-lakers-interior": { basis: "APPROX_TEAM_SEASON", season: "2000-01", wikipedia: "2000–01 Los Angeles Lakers season" },
  "2010s-clippers-pnr": { basis: "APPROX_TEAM_SEASON", season: "2013-14", wikipedia: "2013–14 Los Angeles Clippers season" },
  "2010s-heat-switch": { basis: "APPROX_TEAM_SEASON", season: "2012-13", wikipedia: "2012–13 Miami Heat season" },
  "2020s-bucks-giannis": { basis: "APPROX_TEAM_SEASON", season: "2020-21", wikipedia: "2020–21 Milwaukee Bucks season" },
  "2020s-celtics-volume-threes": { basis: "APPROX_TEAM_SEASON", season: "2023-24", wikipedia: "2023–24 Boston Celtics season" },
  "1990s-jazz-pnr": { basis: "APPROX_TEAM_SEASON", season: "1996-97", wikipedia: "1996–97 Utah Jazz season" },
  "2020s-nuggets-hub": { basis: "APPROX_TEAM_SEASON", season: "2022-23", wikipedia: "2022–23 Denver Nuggets season" },

  // ── synthetic lineups: no team-season exists ──
  "1950s-celtics-team-basketball": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Roster spans Celtics, Warriors and Bullets cards across two decades. No single season corresponds to it." },
  "1950s-pace-extreme": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Assembled from the available 1950s pool to represent extreme pace, not a real lineup." },
  "1960s-celtics-dynasty": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Represents the dynasty across the decade rather than one season, so no season's totals apply." },
  "1960s-interior-dominance": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Assembled to represent interior dominance; not a real lineup." },
  "1960s-royals-creation": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Royals and Lakers cards combined to represent lead-guard creation." },
  "1970s-celtics-motion": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Represents 1970s motion offence across the decade, not one season." },
  "1970s-spurs-pace": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Spurs and Braves cards combined to represent pace." },
  "1980s-bucks-defense": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Bucks, Mavericks and Hawks cards combined to represent 1980s defence." },
  "1990s-suns-pace": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Suns and Spurs cards combined to represent pace." },
  "2020s-grizzlies-pace": { basis: "SYNTHETIC_LINEUP", season: null, wikipedia: null, why: "Grizzlies, Cavaliers and 76ers cards combined to represent pace." },
});

export const sourceFor = (fixtureId) => FIXTURE_SOURCES[fixtureId] ?? null;

export const basisOf = (fixtureId) => sourceFor(fixtureId)?.basis ?? "SYNTHETIC_LINEUP";

/** Every fixture must be classified — an unmapped fixture is an unanswered question. */
export const unmappedFixtures = () =>
  FIXTURES.map((f) => f.fixtureId).filter((id) => !(id in FIXTURE_SOURCES));

export const byBasis = () => {
  const out = { REAL_TEAM_SEASON: [], APPROX_TEAM_SEASON: [], SYNTHETIC_LINEUP: [] };
  for (const [id, s] of Object.entries(FIXTURE_SOURCES)) out[s.basis].push(id);
  return out;
};
