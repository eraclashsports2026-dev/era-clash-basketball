// ── Career store ───────────────────────────────────────────────────────────────
// Single owner of persistent player progress. localStorage is the always-on
// source of truth (guests lose nothing); when the user claims a career (sets a
// display name) the same data syncs to /api/profile — that IS the migration
// path, existing local progress is pushed up on first claim and merged
// server-side with monotonic guards.
import { getUid, getDisplayName } from "./identity.js";
import { track } from "./analytics.js";

const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full/private */ } };

const EMPTY = {
  gamesPlayed: 0, wins: 0, losses: 0,
  bestWin82: 0, best7Wins: 0, best7Losses: 0,
  challengeWins: 0, challengeLosses: 0, tournamentWins: 0,
  dailyStreak: 0, longestDailyStreak: 0,
};

export const loadCareer = () => ({
  stats: { ...EMPTY, ...ls("ec_career", {}) },
  recentGames: ls("ec_recent", []),
  draftCounts: ls("ec_draftcounts", {}),
});

export const saveCareer = (career) => {
  lsSet("ec_career", career.stats);
  lsSet("ec_recent", career.recentGames.slice(0, 20));
  lsSet("ec_draftcounts", career.draftCounts);
};

// Record one finished game into the career. mode: single|best7|82|daily|challenge|tournament
export const recordGame = (career, { won, mode, score, mvp, vs }) => {
  const s = { ...career.stats };
  s.gamesPlayed += 1;
  if (won) s.wins += 1; else s.losses += 1;
  if (mode === "best7") { if (won) s.best7Wins += 1; else s.best7Losses += 1; }
  if (mode === "challenge") { if (won) s.challengeWins += 1; else s.challengeLosses += 1; }
  const next = {
    ...career,
    stats: s,
    recentGames: [{ w: won, mode, score: score || "", mvp: mvp || "", vs: vs || "", ts: Date.now() }, ...career.recentGames].slice(0, 20),
  };
  saveCareer(next);
  return next;
};

export const recordWin82 = (career, wins) => {
  const next = { ...career, stats: { ...career.stats, bestWin82: Math.max(career.stats.bestWin82, wins) } };
  saveCareer(next);
  return next;
};

export const recordTournamentWin = (career) => {
  const next = { ...career, stats: { ...career.stats, tournamentWins: career.stats.tournamentWins + 1 } };
  saveCareer(next);
  return next;
};

export const recordDraft = (career, team) => {
  const draftCounts = { ...career.draftCounts };
  for (const p of team.filter(Boolean)) draftCounts[p.id] = (draftCounts[p.id] || 0) + 1;
  const next = { ...career, draftCounts };
  saveCareer(next);
  return next;
};

// ── Daily streaks ──────────────────────────────────────────────────────────────
// daily = { "20260823": {won:true}, ... } (local-date keyed, matches todayKey()).
const dayMs = 864e5;
const keyFor = (d) => String(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());

export const computeDailyStreak = (daily, now = new Date()) => {
  let streak = 0;
  // streak counts back from today (or yesterday, if today isn't played yet)
  let cursor = daily[keyFor(now)] ? now : new Date(now - dayMs);
  while (daily[keyFor(cursor)]) { streak++; cursor = new Date(cursor - dayMs); }
  return streak;
};

export const updateDailyStreak = (career, daily) => {
  const streak = computeDailyStreak(daily);
  const next = {
    ...career,
    stats: {
      ...career.stats,
      dailyStreak: streak,
      longestDailyStreak: Math.max(career.stats.longestDailyStreak, streak),
    },
  };
  saveCareer(next);
  return next;
};

export const favoritePlayers = (career, n = 3) =>
  Object.entries(career.draftCounts).sort((a, b) => b[1] - a[1]).slice(0, n);

// ── Cloud sync ─────────────────────────────────────────────────────────────────
// Fire-and-forget; the app never blocks on it. Only syncs once a name is set
// ("Save your EraClash career") — that first sync migrates all local progress.
let syncTimer = null;
export const syncCareer = (career, extras = {}) => {
  const name = getDisplayName();
  if (!name) return; // guest: local-only until they claim
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: getUid(),
        profile: {
          name,
          stats: career.stats,
          draftCounts: career.draftCounts,
          recentGames: career.recentGames,
          badges: extras.badges || [],
          savedTeams: extras.savedTeams || [],
          daily: extras.daily || {},
        },
      }),
    }).catch(() => {});
  }, 1500);
};

export const claimCareer = (career, extras = {}) => {
  track("account_claimed", {});
  syncCareer(career, extras);
};
