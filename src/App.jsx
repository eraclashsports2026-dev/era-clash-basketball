import { useState, useEffect, useRef, useCallback } from "react";
import { PLAYERS, POSITIONS, findCard } from "./players.js";
import { getWave1Scenario } from "./wave1Scenarios.js";
import { displayOVR, analyzeBalance, teamRating } from "./rating.js";
import { T, card, R, S, FONT } from "./theme.js";
import { genPlayer, genRoster, genOpponent } from "./draft.js";
import { utcDateKey, dailySeed, dailyRoll1, applyDailyRoll, dailyOpponent } from "./dailyChallenge.js";
import { runGame, requestNarrative } from "./gameClient.js";
import { track, trackSessionStart } from "./analytics.js";
import { installErrorMonitoring } from "./errors.js";
import {
  loadCareer, recordGame, recordWin82, recordTournamentWin, recordDraft,
  updateDailyStreak, syncCareer, computeDailyStreak,
} from "./career.js";
import { createChallenge, loadChallengeFromUrl } from "./challengeClient.js";
import { publishResult, shareText } from "./share.js";
import GameHeader from "./components/GameHeader.jsx";
import Postgame from "./components/Postgame.jsx";
import DailyPanel from "./components/DailyPanel.jsx";
import DailyCoachEra from "./components/DailyCoachEra.jsx";
import Profile from "./components/Profile.jsx";
import Credits from "./components/Credits.jsx";
import RosterBalance from "./components/RosterBalance.jsx";
import MatchupPreview, { VsDivider } from "./components/MatchupPreview.jsx";
import SimulationLoading from "./components/SimulationLoading.jsx";
import ManualPicker from "./components/ManualPicker.jsx";
import CoachPick from "./components/CoachPick.jsx";
import PlayerImage from "./components/PlayerImage.jsx";
import StageWizard from "./components/StageWizard.jsx";
import ChaosClash from "./components/chaos/ChaosClash.jsx";
import AccountGate from "./components/chaos/AccountGate.jsx";
import { currentTier, hasAccount } from "./account.js";
import { simulateChaos } from "./chaos/client.js";
import { can, CAPABILITIES } from "./entitlements.js";
import RosterGrid from "./components/RosterGrid.jsx";
import { MatchupGrid, ArenaCentre, BallIqToggle } from "./components/PlayPanels.jsx";
import { EraStage, VsRow } from "./components/StageViews.jsx";
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from "./v3/difficulty.js";
import { TeamShell, EmptySlot, FilledSlot, LineupList } from "./components/TeamSlots.jsx";
import { teamFit } from "./chemistryView.js";
import { v3meta } from "./v3meta.js";
import { runNarrative, toViewStatus } from "./narrativeMachine.js";
import { shortBuild, watchForNewBuild } from "./buildStamp.js";

// The qualitative pre-sim preview, in the concept's icon grid. One fetch of the
// server's edges; placeholder until both fives exist. No numbers, no winner.
function EdgePreview({ gold, blue, coachGoldId, coachBlueId, eraStyleId, onArena }) {
  const ready = gold?.filter(Boolean).length === 5 && blue?.filter(Boolean).length === 5;
  const [data, setData] = useState(null);
  const goldIds = (gold ?? []).filter(Boolean).map((p) => p.id);
  const blueIds = (blue ?? []).filter(Boolean).map((p) => p.id);
  useEffect(() => {
    let alive = true;
    setData(null);
    if (!ready) return;
    v3meta({ goldIds, blueIds, coachGoldId, coachBlueId, eraStyleId })
      .then((j) => { if (alive && j) setData(j); });
    return () => { alive = false; };
  }, [ready, JSON.stringify(goldIds), JSON.stringify(blueIds), coachGoldId, coachBlueId, eraStyleId]); // eslint-disable-line
  if (!ready) return <MatchupGrid placeholder onArena={onArena} />;
  return <MatchupGrid edges={data?.edges} keyClash={data?.keyClash} loading={!data} onArena={onArena} />;
}

// One side of the tipoff composition: the five, the coach, on the arena band.
function ReadySide({ side, team, coach, fallbackLabel }) {
  const accent = side === "blue" ? T.blueOnDark : T.goldOnDark;
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 2, color: accent }}>TEAM {side === "blue" ? "BLUE" : "GOLD"}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", margin: "8px 0 6px" }}>
        {team ? team.map((p) => <PlayerImage key={p.id} player={p} variant="card" team={side} />)
              : <span style={{ fontSize: 13, color: T.onArenaDim }}>{fallbackLabel}</span>}
      </div>
      {coach && <div style={{ fontSize: 12.5, color: T.onArenaDim }}>Coach <b style={{ color: T.onArena }}>{coach.name}</b></div>}
    </div>
  );
}

// Five-portrait roster summary used above the coach panels (stage 2).
function PlayerImageMini({ p, side }) {
  return (
    <span title={p.name} style={{ display: "inline-flex" }}>
      <PlayerImage player={p} variant="thumbnail" team={side} />
    </span>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────
const BADGES = {
  perfect_82: { name: "Perfect Season", icon: "🏆", desc: "82-0" },
  tournament_champion: { name: "Champion", icon: "👑", desc: "Won the Tournament" },
  all_eras: { name: "Time Traveler", icon: "⏰", desc: "5 different eras in one lineup" },
  giant_slayer: { name: "Giant Slayer", icon: "⚡", desc: "Beat a higher-rated opponent" },
  win_streak_5: { name: "On Fire", icon: "🔥", desc: "5-game win streak" },
  win_streak_10: { name: "Unstoppable", icon: "🌟", desc: "10-game win streak" },
  daily_done: { name: "Daily Grinder", icon: "📅", desc: "Completed a Daily Challenge" },
  daily_streak_7: { name: "Seven Straight", icon: "📆", desc: "7-day Daily streak" },
  challenge_win: { name: "Called Shot", icon: "🎯", desc: "Won a friend challenge" },
  balanced_60: { name: "Architect", icon: "🏗️", desc: "60+ wins with zero balance gaps" },
};

const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

let gamesThisSession = 0;
const noteGameStarted = () => {
  gamesThisSession += 1;
  if (gamesThisSession === 2) track("second_game_started", {});
};

const GAME_MODES = [
  ["Chaos", "CHAOS CLASH", "Three rolls. Hold your legends. Adapt to the era."],
  ["Single", "DREAM MATCHUP", "Build both teams exactly how you want."],
  ["Best7", "BEST OF 7", "Settle the debate."],
  ["Win82", "WIN 82", "Survive the season."],
  ["Tournament", "TOURNAMENT", "Four rounds to a title."],
];
const MODE_ICON = { Chaos: "🎲", Single: "🏀", Best7: "🏆", Win82: "🗓️", Tournament: "🏟️" };
const MODE_TO_ANALYTICS = { Win82: "82", Single: "single", Best7: "best7", Tournament: "tournament", Daily: "daily", Challenge: "challenge" };

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [nav, setNav] = useState("Play");             // Play | Daily | Challenges | Board | Profile | Credits
  const [view, setView] = useState("builder");        // builder | simulating | postgame
  const [gameMode, setGameMode] = useState("Chaos");  // Chaos | Single (Dream Matchup) | Best7 | Win82 | Tournament
  const [chaosAvailable, setChaosAvailable] = useState(true); // until the server says otherwise
  const [playStage, setPlayStage] = useState("ROSTERS"); // ROSTERS | COACHES | ERA | READY (v3 wizard)
  const [chaosReady, setChaosReady] = useState(null);     // a Chaos run at phase READY
  const [tier, setTier] = useState(() => currentTier());  // GUEST | FREE (central entitlement input)
  const [gate, setGate] = useState(null);                 // an entitlement gate to render
  const [chaosChallengeId, setChaosChallengeId] = useState(null);
  const [chaosNonce, setChaosNonce] = useState(0);   // remounts ChaosClash for a fresh run
  const [eraLocked, setEraLocked] = useState(false);      // the era step is a confirmation, not a default
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY); // opponent pool for Win82/Tournament
  const [buildMethod, setBuildMethod] = useState("manual"); // manual (concept default) | rolls (Chaos Draft)
  const [yz, setYz] = useState(null);
  const [ballIQ, setBallIQ] = useState(false);
  const [team, setTeam] = useState(null);              // completed gold five
  const [manual, setManual] = useState([null, null, null, null, null]);
  const [blueManual, setBlueManual] = useState([null, null, null, null, null]);
  const [picker, setPicker] = useState(null);          // {slot, target: gold-manual|gold-swap|blue-manual|blue-swap}
  const [opponent, setOpponent] = useState(null);      // user-built blue five (never auto-locked)
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simStage, setSimStage] = useState("");
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const [share, setShare] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [sharedResult, setSharedResult] = useState(null);
  const [flashSlot, setFlashSlot] = useState(null);
  const [narrative, setNarrative] = useState({ status: "none" }); // enhanced recap state
  const [v3, setV3] = useState({ enabled: false, eras: [], coaches: [] }); // V3 engine meta (flag-gated)
  const [activeScenario, setActiveScenario] = useState(null); // Wave 1 guided scenario (?scenario=w1-sN)
  const [newBuild, setNewBuild] = useState(false); // a newer deploy is live — offer a reload
  const [coachGold, setCoachGold] = useState(null);
  const [coachBlue, setCoachBlue] = useState(null);
  const [eraStyle, setEraStyle] = useState("2020s");
  const lastOppRef = useRef(null);
  const dailyDecisionsRef = useRef(null); // recorded daily draft decisions for server verification
  // Official Daily configuration (server-authoritative). The browser renders
  // it and submits ONE choice out of it — never the era, never the seed,
  // never a coach that is not in today's three.
  const [dailyCfg, setDailyCfg] = useState(null);
  const [dailyCoach, setDailyCoach] = useState(null);
  const dailyOptionsSeenRef = useRef(null); // one analytics event per dailyId

  const [saved, setSaved] = useState(() => ls("ec_saved", []));
  const [streaks, setStreaks] = useState(() => ls("ec_streaks", { current: 0, personalBest: 0, thisWeekBest: 0, weekOf: "" }));
  const [badges, setBadges] = useState(() => ls("ec_badges", []));
  const [board, setBoard] = useState(() => ls("ec_board", []));
  const [daily, setDaily] = useState(() => ls("ec_daily", {}));
  const [career, setCareer] = useState(() => loadCareer());

  useEffect(() => localStorage.setItem("ec_saved", JSON.stringify(saved)), [saved]);
  useEffect(() => localStorage.setItem("ec_streaks", JSON.stringify(streaks)), [streaks]);
  useEffect(() => localStorage.setItem("ec_badges", JSON.stringify(badges)), [badges]);
  useEffect(() => localStorage.setItem("ec_board", JSON.stringify(board)), [board]);
  useEffect(() => localStorage.setItem("ec_daily", JSON.stringify(daily)), [daily]);
  useEffect(() => {
    syncCareer(career, { badges, savedTeams: saved.map((t) => ({ name: t.name, ids: t.ids, rating: t.rating })), daily });
  }, [career, badges, saved, daily]);

  useEffect(() => {
    fetch("/api/health").then((r) => (r.ok ? r.json() : null)).then((h) => {
      if (!h?.simV3) return;
      fetch("/api/v3meta").then((r) => (r.ok ? r.json() : null)).then((m) => {
        if (!m) return;
        setV3({ enabled: true, eras: m.eras, coaches: m.coaches });
        // Chaos Clash is the default Play mode, but only where the server has
        // it switched on. Where it is off (production today) the default falls
        // back to Dream Matchup rather than a Play screen that cannot start.
        const on = m.modes?.chaosClash !== false;
        setChaosAvailable(on);
        if (!on) setGameMode((g) => (g === "Chaos" ? "Single" : g));
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  useEffect(() => {
    trackSessionStart();
    installErrorMonitoring();
    const onPrompt = () => track("pwa_install_prompt_shown", {});
    const onInstalled = () => track("pwa_installed", {});
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const wk = `${new Date().getFullYear()}-W${Math.ceil(((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 864e5 + 1) / 7)}`;
    if (streaks.weekOf !== wk) setStreaks((s) => ({ ...s, thisWeekBest: 0, weekOf: wk }));
  }, []); // eslint-disable-line

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("c") || params.get("ch")) {
      loadChallengeFromUrl().then((ch) => {
        if (ch) { setChallenge(ch); setNav("Challenges"); }
      });
    } else if (params.get("r")) {
      const id = params.get("r");
      if (/^[a-z0-9]{6,16}$/.test(id)) {
        fetch(`/api/result?id=${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((snap) => { if (snap) { setSharedResult(snap); track("shared_link_opened", { kind: snap.kind }); } })
          .catch(() => {});
      }
    }
  }, []);

  // Chaos challenge deep link: /?chaos=<opaque id> reproduces the same opening
  // rolls and rules. It carries no seed, no credential and no tester identity.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("chaos");
    if (id && /^[a-z0-9]{4,14}$/.test(id)) {
      setChaosChallengeId(id);
      setNav("Play"); setGameMode("Chaos");
      track("chaos_challenge_opened", {});
    }
  }, []);

  // Wave 1 guided-scenario launcher (?scenario=w1-sN). Preview-cohort feature:
  // it rides the existing query-state pattern and only PRELOADS a legal setup —
  // teams, coaches, one Era Style — exactly as if the tester built it by hand.
  // Coaches come from the server's own v3meta cards, so this waits for them.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("scenario");
    if (!id || !v3.coaches.length || activeScenario) return;
    const sc = getWave1Scenario(id);
    if (!sc) return;
    const five = (ids) => ids.map((pid) => PLAYERS.find((p) => p.id === pid)).filter(Boolean);
    const gold = five(sc.gold), blue = five(sc.blue);
    const cg = v3.coaches.find((c) => c.id === sc.coachGold);
    const cb = v3.coaches.find((c) => c.id === sc.coachBlue);
    if (gold.length !== 5 || blue.length !== 5 || !cg || !cb) return;
    setBuildMethod("manual"); setTeam(gold); setOpponent(blue);
    setCoachGold(cg); setCoachBlue(cb); setEraStyle(sc.era);
    setEraLocked(true); setPlayStage("READY");
    setActiveScenario(sc);
    track("preview_scenario_loaded", { scenario_id: sc.id });
  }, [v3.coaches]); // eslint-disable-line

  // A tester can sit on a long-open tab for hours. Notice when a newer build is
  // deployed and offer one tap to pick it up, instead of leaving them to judge
  // an old interface.
  useEffect(() => watchForNewBuild(() => setNewBuild(true)), []);

  const addBadge = (k) => setBadges((b) => (b.includes(k) ? b : [...b, k]));
  const recordWinStreak = () => setStreaks((s) => {
    const cur = s.current + 1;
    if (cur >= 5) addBadge("win_streak_5");
    if (cur >= 10) addBadge("win_streak_10");
    return { ...s, current: cur, personalBest: Math.max(s.personalBest, cur), thisWeekBest: Math.max(s.thisWeekBest, cur) };
  });
  const recordLossStreak = () => setStreaks((s) => ({ ...s, current: 0 }));

  const isDaily = nav === "Daily";
  const isChaos = nav === "Play" && gameMode === "Chaos";
  const isChallenge = nav === "Challenges" && !!challenge;
  const activeMode = isDaily ? "Daily" : isChallenge ? "Challenge" : gameMode;
  // modes where the user builds Team Blue (Win82/Tournament opponents are
  // server-generated per game; Challenge locks the stored rival five)
  // Team Blue is user-built only in the open modes. In the Daily the opponent
  // is the day's seeded five (same for everyone) and in a Challenge it is the
  // rival's stored lineup — neither is the player's to choose.
  const blueBuildable = !isChallenge && (activeMode === "Single" || activeMode === "Best7");
  // V3 steps (TEAM → COACH → ERA STYLE) appear for standard modes only; Daily
  // keeps its fairness model (neutral coaches, derived seed) and Challenge
  // keeps the rival's five as-is.
  const v3Steps = v3.enabled && !isChallenge && !isDaily && !isChaos;
  const coachesReady = !v3Steps || (blueBuildable ? (!!coachGold && !!coachBlue) : !!coachGold);
  // ── Wizard stage gating (v3 modes) ────────────────────────────────────────
  const rosterDone = !!team && (!blueBuildable || !!opponent);
  const stageDone = { ROSTERS: rosterDone, COACHES: rosterDone && coachesReady, ERA: eraLocked };
  const jumpStage = (id) => {
    if (id === "ROSTERS") setPlayStage("ROSTERS");
    else if (id === "COACHES" && rosterDone) setPlayStage("COACHES");
    else if (id === "ERA" && rosterDone && coachesReady) setPlayStage("ERA");
    else if (id === "READY" && rosterDone && coachesReady && eraLocked) setPlayStage("READY");
  };
  // A stage can never outrun its prerequisites (reset, roster edits, coach clears).
  useEffect(() => {
    if (!v3Steps) return;
    if (!rosterDone && playStage !== "ROSTERS") setPlayStage("ROSTERS");
    else if ((playStage === "ERA" || playStage === "READY") && !coachesReady) setPlayStage("COACHES");
    else if (playStage === "READY" && !eraLocked) setPlayStage("ERA");
  }, [v3Steps, rosterDone, coachesReady, eraLocked, playStage]);
  // The Daily has its own coach step: three server-chosen options, one pick.
  // The sim stays locked until the roster AND the coach are both settled —
  // an unhired coach is an incomplete submission, not a default.
  const dailyCoachRequired = isDaily && (dailyCfg?.coachOptions?.length || 0) > 0;
  const dailyChoiceReady = !dailyCoachRequired || !!dailyCoach;

  // Reveal the Blue five once Gold is complete (single/best7/daily). Same
  // generator the sim always used — just shown before tipoff now.
  // Team Blue is USER-controlled: it stays empty until the user picks Manual or
  // Random. The only exception is Challenge mode, where the rival five is the
  // stored challenge lineup (that IS the game). No hidden auto-lock-in.
  useEffect(() => {
    if (isChallenge) setOpponent(challenge.team);
  }, [isChallenge, challenge]); // eslint-disable-line

  // ── Draft: Chaos (yahtzee rolls) ───────────────────────────────────────────
  // Daily uses the shared authoritative generator (UTC seed from the server;
  // pure — identical rolls for everyone) and records every keep/re-spin
  // decision so the server can replay and verify the final lineup.
  const startBuild = async (seeded) => {
    let roster, seed = null;
    if (seeded) {
      seed = dailySeed(utcDateKey());
      try {
        const cfg = await fetch("/api/daily?config=1").then((r) => (r.ok ? r.json() : null));
        if (cfg?.seed != null) seed = cfg.seed; // server date wins over device clock
        // A coach/era Daily also ships the official era and today's three
        // coaches. When the flag is off the payload simply has neither and
        // the Daily behaves exactly as it did before.
        if (cfg?.coachOptions?.length) {
          setDailyCfg(cfg);
          setDailyCoach(null); // a new draft is a new decision
          track("daily_config_loaded", { daily_id: cfg.dailyId, era_style: cfg.officialEraStyleId, options: cfg.coachOptions.length, cached: !!cfg.cached });
          track("daily_era_viewed", { daily_id: cfg.dailyId, era_style: cfg.officialEraStyleId });
        } else {
          setDailyCfg(null); setDailyCoach(null);
        }
      } catch { /* offline fallback: same computation from device UTC */ }
      roster = dailyRoll1(seed);
    } else {
      roster = genRoster(Math.random);
    }
    setYz({ roll: 1, roster, keep: [false, false, false, false, false], respin: [null, null, null, null, null], done: false, seeded: !!seeded, seed, decisions: [] });
    setTeam(null); setResult(null); setProgress(null); setOpponent(null);
    track("draft_started", { mode: MODE_TO_ANALYTICS[activeMode], method: "rolls", ball_iq: ballIQ, seeded: !!seeded });
    if (seeded) track("daily_challenge_started", {});
    roster.forEach((p, i) => track("player_option_shown", { slot: POSITIONS[i], position: p.pos, player_id: p.id, player_era: p.decade, ovr: displayOVR(p, POSITIONS[i]), roll: 1 }));
  };

  const toggleKeep = (i) => setYz((z) => {
    const keeping = !z.keep[i];
    if (keeping) {
      const p = z.roster[i];
      track("player_selected", { slot: POSITIONS[i], player_id: p.id, player_era: p.decade, ovr: displayOVR(p, POSITIONS[i]), roll: z.roll });
    }
    return { ...z, keep: z.keep.map((v, j) => (j === i ? !v : v)), respin: z.keep[i] ? z.respin : z.respin.map((r, j) => (j === i ? null : r)) };
  });
  const setRespin = (i, type) => setYz((z) => ({ ...z, respin: z.respin.map((r, j) => (j === i ? type : r)) }));

  const finalizeTeam = (roster) => {
    setTeam(roster);
    if (new Set(roster.map((p) => p.decade)).size === 5) addBadge("all_eras");
    setCareer((c) => recordDraft(c, roster));
    track("draft_completed", { mode: MODE_TO_ANALYTICS[activeMode], team_rating: teamRating(roster), chemistry_multiplier: analyzeBalance(roster).multiplier, ball_iq: ballIQ });
  };

  const doRoll = () => setYz((z) => {
    const respins = z.respin.filter(Boolean).length;
    if (respins) track("reroll_used", { roll: z.roll, respins });

    let roster;
    const decisions = z.seeded ? [...z.decisions, { keeps: [...z.keep], respins: [...z.respin] }] : z.decisions;
    if (z.seeded) {
      // shared authoritative generator — the server replays these exact steps
      roster = applyDailyRoll(z.seed, z.roll, z.roster, z.keep, z.respin);
    } else {
      const rng = Math.random;
      const names = z.roster.filter((_, i) => z.keep[i]).map((p) => p.name); // one person per lineup
      roster = z.roster.map((p, i) => {
        if (z.keep[i]) return p;
        const opts = { excludeNames: [...names] };
        const next = z.respin[i] === "position" ? genPlayer(null, rng, { ...opts, era: p.decade, eliteN: 10 })
          : z.respin[i] === "era" ? genPlayer(POSITIONS[i], rng, { ...opts, eliteN: 10 })
          : genPlayer(POSITIONS[i], rng, { ...opts, eliteN: 12 });
        names.push(next.name);
        return next;
      });
    }
    if (z.roll === 3) {
      if (z.seeded) dailyDecisionsRef.current = decisions;
      finalizeTeam(roster);
      return { ...z, roster, decisions, done: true };
    }
    roster.forEach((p, i) => { if (!z.keep[i]) track("player_option_shown", { slot: POSITIONS[i], player_id: p.id, player_era: p.decade, roll: z.roll + 1 }); });
    return { ...z, roll: z.roll + 1, roster, decisions, keep: [false, false, false, false, false], respin: [null, null, null, null, null] };
  });

  // ── Draft: Manual + Random (both teams) ────────────────────────────────────
  const pickManual = (p) => {
    const { slot, target } = picker;
    // V3 duplicate-person rule: one team can't field two era-versions of the
    // same player (server enforces this too; across teams it's allowed)
    if (v3.enabled) {
      const roster = target === "gold-swap" ? team
        : target === "blue-swap" && opponent ? opponent
        : target === "blue-manual" ? blueManual
        : manual;
      if (roster?.some((x, i) => x && i !== slot && x.name === p.name)) {
        setErr(`${p.name} is already on this team — a lineup can't field two era-versions of the same player. (Different versions CAN face each other on opposite teams.)`);
        setPicker(null);
        return;
      }
    }
    if (target === "gold-swap" && team) {
      setTeam(team.map((x, i) => (i === slot ? p : x)));
      setResult(null);
      setCareer((c) => recordDraft(c, [p]));
      track("player_selected", { slot: POSITIONS[slot], player_id: p.id, player_era: p.decade, method: "swap" });
    } else if (target === "blue-manual" || target === "blue-swap") {
      const base = target === "blue-swap" && opponent ? opponent : blueManual;
      const next = base.map((x, i) => (i === slot ? p : x));
      track("player_selected", { slot: POSITIONS[slot], player_id: p.id, player_era: p.decade, method: "blue-manual" });
      if (next.every(Boolean)) { setOpponent(next); setBlueManual([null, null, null, null, null]); }
      else setBlueManual(next);
    } else {
      const next = manual.map((x, i) => (i === slot ? p : x));
      if (!manual.some(Boolean)) track("draft_started", { mode: MODE_TO_ANALYTICS[activeMode], method: "manual", ball_iq: ballIQ });
      track("player_selected", { slot: POSITIONS[slot], player_id: p.id, player_era: p.decade, ovr: displayOVR(p, POSITIONS[slot]), method: "manual" });
      setManual(next);
      if (next.every(Boolean)) { finalizeTeam(next); setManual([null, null, null, null, null]); }
    }
    setFlashSlot(slot);
    setTimeout(() => setFlashSlot(null), 600);
    setPicker(null);
  };

  // Random Team: one click → a complete legal five of canonical player IDs.
  // Same validation path as everything else — the server re-validates the ids.
  const randomGold = () => {
    const roster = genRoster(Math.random);
    setYz(null); setManual([null, null, null, null, null]); setResult(null);
    setCoachGold(null); // a coach picked for the OLD roster never survives a re-roll
    finalizeTeam(roster);
    track("draft_started", { mode: MODE_TO_ANALYTICS[activeMode], method: "random" });
  };
  const randomBlue = () => {
    setOpponent(genOpponent(Math.random));
    setBlueManual([null, null, null, null, null]);
    setCoachBlue(null); setResult(null); // stale coach/result never survive a re-roll
    track("draft_started", { mode: MODE_TO_ANALYTICS[activeMode], method: "blue-random" });
  };

  // Per-team refresh: clear ONE side without touching the other. Available in
  // every build method so no lineup state is ever a dead end.
  const resetGold = () => {
    if ((yz && !yz.done) || manual.some(Boolean)) track("draft_abandoned", { roll: yz?.roll });
    setYz(null); setManual([null, null, null, null, null]); setTeam(null); setResult(null);
    setCoachGold(null);
    // The hired coach belonged to that roster; a new draft is a new decision.
    setDailyCoach(null);
    dailyDecisionsRef.current = null;
  };
  const resetBlue = () => {
    if (isChallenge) return; // the rival five is the challenge — not resettable
    setOpponent(null); setBlueManual([null, null, null, null, null]);
    setCoachBlue(null);
  };

  const abandonDraftIfNeeded = () => {
    if ((yz && !yz.done) || (manual.some(Boolean) && !manual.every(Boolean))) track("draft_abandoned", { roll: yz?.roll });
  };

  const resetPlay = () => {
    abandonDraftIfNeeded();
    setYz(null); setTeam(null); setResult(null); setErr(""); setProgress(null);
    setManual([null, null, null, null, null]); setBlueManual([null, null, null, null, null]);
    setOpponent(null); setPicker(null); setView("builder");
    setPlayStage("ROSTERS"); setEraLocked(false);
  };
  const handleNav = (id) => { resetPlay(); setSharedResult(null); setNav(id); };

  // ── Game bookkeeping ───────────────────────────────────────────────────────
  // `mine` is passed explicitly by callers whose roster is not yet in state.
  // Chaos Clash builds its five from the server response and calls this in the
  // same handler as setTeam(), where the state update has not committed — so
  // reading `team` here threw on every Chaos win (teamRating(null).reduce).
  const bookkeepGame = (won, mode, score, mvp, vs, opp, mine = team) => {
    if (won) {
      recordWinStreak();
      const ours = mine || team;
      if (opp?.length === 5 && ours?.length === 5 && teamRating(opp) > teamRating(ours)) addBadge("giant_slayer");
    } else recordLossStreak();
    setCareer((c) => recordGame(c, { won, mode, score, mvp, vs }));
  };

  // ── Simulations (server-authoritative, v2.3) ───────────────────────────────
  // /api/game computes and stores every result; the client renders it and then
  // requests the OPTIONAL enhanced recap. AI failure never fails a game.
  // findCard resolves retired aliases: a team saved before a card rename must
  // still load.
  const idsToPlayers = (ids) => (ids || []).map((id) => findCard(id)).filter(Boolean);

  // Coach id → display name. Today's Daily options first (the Daily may offer
  // a coach the general V3 list has not loaded), then the V3 coach list.
  const coachDisplayName = (id) => {
    if (!id || id === "neutral") return null;
    const fromDaily = (dailyCfg?.coachOptions || []).find((c) => c.coachId === id);
    if (fromDaily) return fromDaily.name;
    return v3.coaches?.find((c) => c.id === id)?.name || null;
  };

  const viewSim = (record, n) => ({
    ...record.core,
    simulation_id: record.id,
    summary: n?.summary || record.fallbackSummary,
    teamAStrengths: n?.teamAStrengths?.length ? n.teamAStrengths : record.goldChem?.strengths || [],
    teamAWeaknesses: n?.teamAWeaknesses?.length ? n.teamAWeaknesses : record.goldChem?.weaknesses || [],
    teamBStrengths: n?.teamBStrengths?.length ? n.teamBStrengths : record.blueChem?.strengths || [],
    teamBWeaknesses: n?.teamBWeaknesses?.length ? n.teamBWeaknesses : record.blueChem?.weaknesses || [],
    mvpReason: n?.mvpReason || record.mvpFallback || null, // never blank: deterministic 2-3 sentence fallback
    turningPoint: n?.turningPoint || record.core?.turningPoint || null,
    v3: record.v3 || null,
    story: record.story || null,
    draftConsequences: record.draftConsequences || null,
    // Candidate identity travels with the view model: a Candidate 3 result may
    // not lead into a series that would run on a different engine.
    previewCandidate: record.preview === true ? (record.candidate ?? null) : null,
    // The pregame read exactly as it was stored before the game was simulated.
    pregame: record.pregame ?? null,
    eraId: record.eraId || null,
    coachIds: record.coachIds || null,
    // Names for display only, resolved from what the SERVER reported it used
    // (record.coachIds), never from the local selection — the postgame should
    // show what actually ran.
    coachNames: {
      gold: coachDisplayName(record.coachIds?.gold),
      blue: coachDisplayName(record.coachIds?.blue),
    },
    eraLabel: dailyCfg?.era?.label && dailyCfg.era.id === record.eraId ? dailyCfg.era.label : null,
  });

  // The recap runs through an explicit state machine (src/narrativeMachine.js).
  // A 202 is POLLED to a conclusion rather than reported as success, polling is
  // finite, and the request is cancelled when the result changes or the view
  // unmounts — so a stale response can never overwrite a newer game.
  const narrativeAbort = useRef(null);
  const fetchNarrative = (resultId, record, persisted) => {
    if (!record?.core) { setNarrative({ status: "none" }); return; }
    narrativeAbort.current?.abort();
    const ctrl = new AbortController();
    narrativeAbort.current = ctrl;
    setNarrative({ status: "pending" });
    runNarrative({
      resultId, result: record, persisted, signal: ctrl.signal,
      onState: ({ state }) => {
        if (ctrl.signal.aborted) return;
        const view = toViewStatus(state);
        if (view === "pending") setNarrative({ status: "pending" });
      },
    }).then((out) => {
      if (ctrl.signal.aborted || out.state === "ABORTED") return;
      if (out.state === "READY") {
        setNarrative({ status: "complete", data: out.data });
        setResult((r) => {
          if (!r || r.resultId !== resultId) return r;   // a newer game is on screen
          const sim = viewSim(record, out.data);
          return r.type === "82" ? { ...r, lastSim: sim } : { ...r, sim };
        });
      } else {
        setNarrative({ status: toViewStatus(out.state), code: out.code });
      }
    });
  };
  useEffect(() => () => narrativeAbort.current?.abort(), []);

  // ── Daily coach step handlers ──────────────────────────────────────────────
  const onDailyOptionsViewed = useCallback(() => {
    const id = dailyCfg?.dailyId;
    if (!id || dailyOptionsSeenRef.current === id) return; // once per Daily
    dailyOptionsSeenRef.current = id;
    track("daily_coach_options_viewed", {
      daily_id: id,
      era_style: dailyCfg?.officialEraStyleId,
      option_ids: (dailyCfg?.coachOptions || []).map((c) => c.coachId).join(","),
    });
  }, [dailyCfg]);

  const selectDailyCoach = useCallback((option) => {
    setDailyCoach(option);
    setResult(null);
    track("daily_coach_selected", {
      daily_id: dailyCfg?.dailyId,
      era_style: dailyCfg?.officialEraStyleId,
      coach_id: option.coachId,
      strategy: option.strategy,
    });
  }, [dailyCfg]);

  const applyDaily = (records, won) => {
    setDaily((d) => {
      const next = { ...d, [utcDateKey()]: { won } };
      setCareer((c) => {
        const c2 = updateDailyStreak(c, next);
        if (c2.stats.dailyStreak >= 7) addBadge("daily_streak_7");
        return c2;
      });
      return next;
    });
    addBadge("daily_done");
    track(won ? "daily_challenge_completed" : "daily_challenge_failed", { result: won ? "win" : "loss", server_claimed: !!records?.daily?.claimed });
  };

  // Presentation pacing only: the arena transition holds briefly so a fast
  // core result doesn't flash-cut. Stages shown are real; the hold is capped
  // and ends immediately after — never blocks on AI.
  const holdSimScreen = async (t0) => {
    const remaining = 900 - (Date.now() - t0);
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
  };

  const runSingle = async (oppOverride, tag) => {
    if (loading) return;
    const simT0 = Date.now();
    setView("simulating");
    setLoading(true); setErr(""); setSimStage(""); setNarrative({ status: "none" });
    noteGameStarted();
    const mode = tag || "single";
    try {
      const opp = oppOverride || opponent || genOpponent();
      lastOppRef.current = opp;
      if (mode === "daily") {
        track("daily_started", {
          daily_id: dailyCfg?.dailyId || null,
          era_style: dailyCfg?.officialEraStyleId || null,
          coach_id: dailyCoach?.coachId || null,
        });
      }
      const { resultId, result: record, records } = await runGame({
        mode, gold: team, blue: opp,
        challengeId: tag === "challenge" ? challenge?.id : undefined,
        dailyDecisions: tag === "daily" ? dailyDecisionsRef.current : undefined,
        // Daily: submit ONLY the coach id. The era, the opponent staff, the
        // seed and every data version are the server's to decide — sending
        // them from here is what would make the leaderboard meaningless.
        coachGoldId: tag === "daily" ? (dailyCoach?.coachId || undefined) : (v3Steps ? coachGold?.id : undefined),
        coachBlueId: tag === "daily" ? undefined : (v3Steps ? coachBlue?.id : undefined),
        eraStyleId: tag === "daily" ? undefined : (v3Steps ? eraStyle : undefined),
        onStage: setSimStage,
      });
      const w = record.core.winner === "Gold";
      bookkeepGame(w, mode, record.core.seriesResult, record.core.mvp, tag === "challenge" ? (challenge?.challengerName || "a friend") : "", opp);

      if (tag === "challenge") {
        if (w) addBadge("challenge_win");
        track(w ? "challenge_won" : "challenge_lost", { challenge_id: challenge?.id || null });
        track("challenge_completed", { challenge_id: challenge?.id || null });
        if (records?.challenge?.record) {
          setChallenge((c) => (c ? { ...c, rivalry: records.challenge.record } : c));
        }
      }
      if (tag === "daily") {
        applyDaily(records, w);
        track("daily_completed", {
          daily_id: dailyCfg?.dailyId || null,
          era_style: record.eraId || null,
          coach_id: record.coachIds?.gold || null,
          result: w ? "win" : "loss",
          rank: records?.daily?.rank ?? null,
        });
      }

      setResult({ type: "single", sim: viewSim(record), w, tag, opp, resultId, record, persisted: !!records?.persisted, dailyRank: records?.daily?.rank ?? null });
      fetchNarrative(resultId, record, !!records?.persisted);
      await holdSimScreen(simT0);
      setView("postgame");
    } catch (e) {
      // Daily rejections are their own signal: they mean the submission did
      // not match the official configuration, and (verified server-side) the
      // attempt was NOT consumed. A version mismatch means today's config
      // moved under us, so drop the stale copy and make the player re-draft
      // against the current one rather than retrying into the same rejection.
      const code = e.code || "";
      if (code === "DAILY_INVALID_COACH") track("daily_invalid_coach", { daily_id: dailyCfg?.dailyId || null, coach_id: dailyCoach?.coachId || null });
      if (code === "DAILY_INVALID_ERA") track("daily_invalid_era", { daily_id: dailyCfg?.dailyId || null });
      if (code === "DAILY_VERSION_MISMATCH") {
        track("daily_version_mismatch", { daily_id: dailyCfg?.dailyId || null });
        setDailyCfg(null); setDailyCoach(null); dailyOptionsSeenRef.current = null;
      }
      setErr(e.message); setView("builder");
    }
    setLoading(false);
  };

  const runBest7 = async (oppOverride, tag) => {
    if (loading) return;
    const simT0 = Date.now();
    setView("simulating");
    setLoading(true); setErr(""); setSimStage(""); setNarrative({ status: "none" });
    noteGameStarted();
    track("best_of_7_started", { from: tag || "menu" });
    try {
      const opp = oppOverride || opponent || genOpponent();
      lastOppRef.current = opp;
      const { resultId, result: record, records } = await runGame({ mode: "best7", gold: team, blue: opp, coachGoldId: v3Steps ? coachGold?.id : undefined, coachBlueId: v3Steps ? coachBlue?.id : undefined, eraStyleId: v3Steps ? eraStyle : undefined, onStage: setSimStage });
      const won = record.core.winner === "Gold";
      bookkeepGame(won, "best7", record.core.seriesResult, record.core.mvp, "", opp);
      setResult({ type: "best7", sim: viewSim(record), won, tag, opp, resultId, record, persisted: !!records?.persisted });
      fetchNarrative(resultId, record, !!records?.persisted);
      await holdSimScreen(simT0);
      setView("postgame");
    } catch (e) { setErr(e.message); setView("builder"); }
    setLoading(false);
  };

  const runWin82 = async () => {
    if (loading) return;
    const simT0 = Date.now();
    setView("simulating");
    setLoading(true); setErr(""); setSimStage(""); setNarrative({ status: "none" });
    noteGameStarted();
    try {
      const { resultId, result: record, records } = await runGame({ mode: "82", gold: team, coachGoldId: v3Steps ? coachGold?.id : undefined, eraStyleId: v3Steps ? eraStyle : undefined, difficulty, onStage: setSimStage });
      const { wins, losses } = record;
      // streaks: season summary counts once toward the win/loss streak
      if (wins > losses) recordWinStreak(); else recordLossStreak();
      setCareer((c) => recordWin82(recordGame(c, { won: wins > losses, mode: "82", score: `${wins}-${losses}`, mvp: record.core?.mvp }), wins));
      if (wins === 82) addBadge("perfect_82");
      const bal = analyzeBalance(team);
      if (wins >= 60 && bal.gaps.length === 0) addBadge("balanced_60");
      setBoard((b) => [...b, { wins, team: team.map((p) => p.id), ts: Date.now() }].sort((a, c) => c.wins - a.wins).slice(0, 10));
      const opp = idsToPlayers(record.blueIds);
      lastOppRef.current = opp.length === 5 ? opp : null;
      setResult({ type: "82", wins, losses, lastSim: viewSim(record), opp, resultId, record, persisted: !!records?.persisted });
      fetchNarrative(resultId, record, !!records?.persisted);
      await holdSimScreen(simT0);
      setView("postgame");
    } catch (e) { setErr(e.message); setView("builder"); }
    setLoading(false); setProgress(null);
  };

  const runTournament = async () => {
    if (loading) return;
    const simT0 = Date.now();
    setView("simulating");
    setLoading(true); setErr(""); setSimStage(""); setNarrative({ status: "none" });
    noteGameStarted();
    try {
      const { resultId, result: record, records } = await runGame({ mode: "tournament", gold: team, coachGoldId: v3Steps ? coachGold?.id : undefined, eraStyleId: v3Steps ? eraStyle : undefined, difficulty, onStage: setSimStage });
      const rounds = (record.rounds || []).map((r) => ({
        name: r.name,
        opp: idsToPlayers(r.oppIds),
        sim: { ...r.core, summary: r.fallbackSummary },
        advanced: r.advanced,
      }));
      for (const r of rounds) {
        if (r.advanced) recordWinStreak(); else recordLossStreak();
        setCareer((c) => recordGame(c, { won: r.advanced, mode: "tournament", score: r.sim.seriesResult, mvp: r.sim.mvp }));
      }
      if (record.won) { addBadge("tournament_champion"); setCareer((c) => recordTournamentWin(c)); }
      setResult({ type: "tournament", rounds, won: record.won, resultId, persisted: !!records?.persisted });
      await holdSimScreen(simT0);
      setView("postgame");
    } catch (e) { setErr(e.message); setView("builder"); }
    setLoading(false); setProgress(null);
  };

  const runTheSim = () => {
    if (activeMode === "Single") return runSingle(opponent, null);
    if (activeMode === "Daily") return runSingle(opponent, "daily");
    if (activeMode === "Challenge") return runSingle(challenge.team, "challenge");
    if (activeMode === "Best7") return runBest7(opponent, null);
    if (activeMode === "Win82") return runWin82();
    if (activeMode === "Tournament") return runTournament();
  };

  // ── Replay actions ─────────────────────────────────────────────────────────
  const doRematch = (tag) => {
    track(tag === "challenge" ? "challenge_rematch_started" : "rematch_started", {});
    setResult(null);
    runSingle(tag === "challenge" ? challenge?.team : lastOppRef.current, tag);
  };
  const doBest7FromResult = () => { setResult(null); runBest7(lastOppRef.current, "from_result"); };
  // Swap One: back to the builder with BOTH squads preserved (spec #12/#13).
  // ── Run the Clash ─────────────────────────────────────────────────────────
  // The setup is entirely server-side: this call sends a run id and nothing
  // else. The team, the coaches and the era all come from the stored run.
  const runChaosClash = async () => {
    if (!chaosReady || loading) return;
    setLoading(true); setErr(""); setSimStage(""); setNarrative({ status: "none" }); setView("simulating");
    const simT0 = Date.now();
    try {
      const simulationId = (() => { try { return crypto.randomUUID().replace(/-/g, "").slice(0, 20); } catch { return `chaos${Date.now()}`.slice(0, 20); } })();
      const { resultId, result: record, records } = await simulateChaos(chaosReady.chaosRunId, simulationId, tier);
      const five = (ids) => (ids || []).map((id) => PLAYERS.find((p) => p.id === id)).filter(Boolean);
      const gold = five(record.goldIds), opp = five(record.blueIds);
      setTeam(gold); setOpponent(opp); lastOppRef.current = opp;
      const w = record.core.winner === "Gold";
      bookkeepGame(w, "single", record.core.seriesResult, record.core.mvp, "", opp, gold);
      setResult({ type: "single", sim: viewSim(record), w, tag: "chaos", opp, resultId, record, persisted: !!records?.persisted });
      fetchNarrative(resultId, record, !!records?.persisted);
      track("chaos_clash_completed", { era_style: record.eraId || null });
      // The run is spent; a return to Chaos Clash starts from an empty board.
      try { localStorage.removeItem("ec_chaos_run"); } catch { /* private mode */ }
      await holdSimScreen(simT0);
      setView("postgame");
    } catch (e) {
      setErr(e.message || "We couldn't run that Clash. Nothing was recorded.");
      setView("builder");
    }
    setLoading(false);
  };

  const newChaosClash = () => {
    setChaosReady(null); setChaosChallengeId(null); setResult(null);
    setTeam(null); setOpponent(null); setView("builder");
    setChaosNonce((n) => n + 1);
  };

  const startSwap = () => { track("swap_one_started", {}); setResult(null); setView("builder"); setPlayStage("READY"); };
  const retryNarrative = () => { if (result?.record) fetchNarrative(result.resultId, result.record, result.persisted); };

  // ── Share ──────────────────────────────────────────────────────────────────
  const buildSnapshot = () => {
    const kind = result?.type === "82" ? "82" : result?.type === "best7" ? "best7"
      : result?.tag === "daily" ? "daily" : result?.tag === "challenge" ? "challenge" : "single";
    const sim = result?.sim || result?.lastSim;
    const won = result?.type === "82" ? result.wins > result.losses : (result?.w ?? result?.won ?? false);
    const scoreline = result?.type === "82" ? `${result.wins}-${result.losses}` : sim?.seriesResult || "";
    const mvpRow = sim && [...(sim.teamAStats || []), ...(sim.teamBStats || [])]
      .find((r) => sim.mvp && r.name && sim.mvp.toLowerCase().includes(r.name.split(" ").slice(-1)[0].toLowerCase()));
    return {
      kind,
      teamIds: team.map((p) => p.id),
      oppIds: result?.opp ? result.opp.map((p) => p.id) : null,
      won,
      scoreline,
      mvp: sim?.mvp || null,
      mvpLine: mvpRow ? `${mvpRow.pts} PPG ${mvpRow.reb} REB ${mvpRow.ast} AST` : null,
      headline: result?.type === "82" ? `${result.wins}–${result.losses} season` : won ? "Victory" : "Defeat",
      insight: (typeof sim?.turningPoint === "string" ? sim.turningPoint : sim?.turningPoint?.text) || sim?.summary?.split(". ")[0] || "",
      rating: teamRating(team),
      chemistry: `${Math.round((analyzeBalance(team).multiplier - 1) * 100)}%`,
    };
  };

  const doShare = async () => {
    const rec = result?.type === "82" ? `${result.wins}-${result.losses}`
      : result?.type === "best7" ? (result.sim?.seriesResult || (result.won ? "4 wins" : "series loss"))
      : result?.type === "tournament" ? (result.won ? "CHAMPION" : "eliminated")
      : result?.w ? "W" : "L";
    const [resultUrl, ch] = await Promise.all([
      result && result.type !== "tournament" ? publishResult(buildSnapshot()) : Promise.resolve(null),
      createChallenge(team, rec),
    ]);
    if (resultUrl) track("result_created", { kind: result?.type || "single" });
    const url = resultUrl || ch.url;
    const roster = POSITIONS.map((pos, i) => `${pos}: ${team[i].name} (${team[i].decade})`).join("\n");
    const text = `🏀 My EraClash squad went ${rec}\n\n${roster}\n\nTeam Rating: ${teamRating(team)}\n\nThink you can beat my five? Play them here:\n${resultUrl ? `${resultUrl}\n(or take the direct challenge: ${ch.url})` : url}`;
    if (result?.tag === "daily") track("daily_result_shared", {});
    const outcome = await shareText(text, result?.tag === "daily" ? "daily_result" : result?.type || "result");
    if (outcome !== "shared") setShare({ text, url });
  };

  const dailyDone = !!daily[utcDateKey()];

  // Show today's official opponent in the Daily (locked, identical worldwide).
  // Re-asserted whenever it is missing, because starting the daily draft clears
  // the opponent the way it does in the open modes — here it must come back.
  useEffect(() => {
    if (!isDaily || opponent) return;
    setOpponent(dailyOpponent(utcDateKey()));
  }, [isDaily, opponent]);
  const dailyStreak = computeDailyStreak(daily);
  const winnerClass = result ? ((result.w ?? result.won ?? (result.type === "82" && result.wins > result.losses)) ? "win-gold" : "win-blue") : "";
  const goldCount = team ? 5 : buildMethod === "manual" ? manual.filter(Boolean).length : (yz ? yz.roster.filter((_, i) => yz.keep[i]).length : 0);
  const feedbackCtx = result?.sim ? {
    simulation_id: result.sim.simulation_id,
    resultId: result.resultId || null,
    scenarioId: activeScenario?.id || null,
    mode: result.tag || result.type,
    my_team: (team || []).map((p) => p.id),
    opp_team: result.opp ? result.opp.map((p) => p.id) : undefined,
  } : null;

  // ── Views ──────────────────────────────────────────────────────────────────
  const playView = (
    <div>
      {activeScenario && (
        <div style={{ margin: "0 auto 14px", maxWidth: 680, padding: "10px 14px", borderRadius: 10,
          background: T.bgCardHover, border: `1px solid ${T.gold}`, fontSize: 12.5, color: T.textDim }}>
          <div style={{ fontWeight: 800, color: T.gold, marginBottom: 3 }}>
            GUIDED SCENARIO {activeScenario.id.replace("w1-s", "")} — {activeScenario.title}
          </div>
          {activeScenario.instruction}
        </div>
      )}
      {/* Compact hero — the roster panels own this viewport. Chaos Clash brings
          its own hero, so this one stands down rather than stacking two. */}
      {!team && !result && !isChaos && (
        <div style={{ textAlign: "center", padding: "16px 6px 2px" }}>
          <div style={{ fontSize: 11, letterSpacing: 5, color: T.gold, fontWeight: 800 }}>BUILD YOUR FIVE</div>
          <h1 style={{ margin: "4px 0 2px", fontSize: 34, fontWeight: 900, letterSpacing: 0.5, fontFamily: FONT.display, color: T.text }}>
            CLASH ACROSS ERAS
          </h1>
          <div style={{ fontSize: 14, color: T.textDim }}>Draft legends. Pick coaches. Run the sim.</div>
        </div>
      )}

      {/* Selected mode — chosen from the Play menu in the header */}
      {!isChallenge && !isDaily && !result && !isChaos && (
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: R.pill,
            border: `1px solid ${T.goldBorder}`, background: T.goldSoft, color: T.gold, fontWeight: 800, fontSize: 13 }}>
            <span aria-hidden="true">{MODE_ICON[gameMode]}</span>
            {GAME_MODES.find(([id]) => id === gameMode)?.[1]}
          </span>
        </div>
      )}

      {/* Opponent difficulty — only Win 82 and Tournament generate a schedule.
          This changes WHO you face, never how a game is simulated. */}
      {!isChallenge && !isDaily && !result && (gameMode === "Win82" || gameMode === "Tournament") && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 0 4px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>OPPONENT DIFFICULTY</div>
          <div role="tablist" aria-label="Opponent difficulty" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {Object.values(DIFFICULTIES).map((d) => (
              <button key={d.id} role="tab" aria-selected={difficulty === d.id} aria-label={`Difficulty ${d.label}`}
                onClick={() => setDifficulty(d.id)} style={{
                  padding: "8px 15px", borderRadius: R.sm, cursor: "pointer", minHeight: 42, fontSize: 13, fontWeight: 800,
                  border: `1px solid ${difficulty === d.id ? T.goldBorder : T.border}`,
                  background: difficulty === d.id ? T.goldSoft : T.bgCard,
                  color: difficulty === d.id ? T.gold : T.textDim,
                }}>{d.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: T.textDim, textAlign: "center", maxWidth: 460, lineHeight: 1.5 }}>
            {DIFFICULTIES[difficulty].blurb} <span style={{ color: T.textMuted }}>Games are simulated identically at every setting — only who you face changes.</span>
          </div>
        </div>
      )}

      {v3Steps && !result && (
        <StageWizard stage={playStage} done={stageDone} onJump={jumpStage} />
      )}

      {/* ── CHAOS CLASH — the default Play experience ────────────────────── */}
      {isChaos && !result ? (
        gate ? (
          <AccountGate
            title="Keep playing Chaos Clash"
            blurb={gate.message}
            onCreated={() => { setGate(null); setTier(currentTier()); setChaosNonce((n) => n + 1); }}
            onBack={() => { setGate(null); }} />
        ) : (
        <div>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: -0.5 }}>ROLL YOUR CLASH</h1>
            <div style={{ fontSize: 14, color: T.textDim, marginTop: 5, lineHeight: 1.55 }}>
              Three rolls. Hold your legends. Adapt to the era.
            </div>
          </div>
          <ChaosClash key={`${chaosNonce}:${chaosChallengeId || "new"}`}
            tier={tier} challengeId={chaosChallengeId}
            onReady={(r) => setChaosReady(r)}
            onGated={(g) => setGate(g)} />
          {chaosReady && (
            <button onClick={runChaosClash} disabled={loading} style={{
              marginTop: 14, minHeight: 58, width: "100%", borderRadius: R.md,
              cursor: loading ? "default" : "pointer", fontWeight: 900, fontSize: 16, letterSpacing: 1.2,
              border: `1px solid ${T.goldBorder}`, background: T.gold, color: "#fff", opacity: loading ? 0.6 : 1,
            }}>{loading ? "RUNNING…" : "RUN THE CLASH"}</button>
          )}
          {err && <div role="alert" style={{ marginTop: 10, textAlign: "center", color: T.red, fontSize: 13 }}>{err}</div>}
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { setGameMode("Single"); setChaosReady(null); }} style={{
              minHeight: 44, padding: "0 18px", borderRadius: R.pill, cursor: "pointer",
              fontWeight: 800, fontSize: 13, letterSpacing: 0.6,
              border: `1px solid ${T.border}`, background: "transparent", color: T.textDim,
            }}>BUILD A DREAM MATCHUP</button>
          </div>
        </div>
        )
      ) : gameMode === "Single" && nav === "Play" && !result && !can(tier, CAPABILITIES.DREAM_MATCHUP) ? (
        <AccountGate
          title="Dream Matchup"
          blurb="Build both teams by hand, pick from the full coach library and choose the era yourself. A free account keeps your matchups and history."
          onCreated={() => setTier(currentTier())}
          onBack={() => setGameMode("Chaos")} />
      ) : isDaily && dailyDone && !team && !result ? (
        <div>
          <div style={{ ...card, padding: 30, textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
            <div style={{ fontSize: 36 }}>✅</div>
            <h2 style={{ margin: "8px 0 4px" }}>Today's Clash is done</h2>
            <p style={{ color: T.textDim, fontSize: 13.5 }}>New seeded lineup at midnight — everyone in the world gets the same rolls.</p>
          </div>
          <div style={{ maxWidth: 520, margin: "0 auto" }}><DailyPanel daily={daily} career={career} /></div>
        </div>
      ) : (
        <>
          {/* THE MATCHUP — stage 1 (and the whole layout for Daily/Challenge) */}
          {(!v3Steps || playStage === "ROSTERS") && (
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* TEAM GOLD */}
            <TeamShell team="gold" title="TEAM GOLD" count={goldCount}>
              {isChallenge && !team && !yz && buildMethod === "rolls" && (
                <div style={{ textAlign: "center", margin: "0 0 10px", fontSize: 13, fontWeight: 900, letterSpacing: 2 }}>BUILD YOUR TEAM ↓</div>
              )}
              {!team && (
                <>
                  {/* Build method (Daily stays seeded rolls — that IS the daily) */}
                  {!isDaily && (
                    <div role="tablist" aria-label="Build method" style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                      {[["manual", "✍️ Manual Draft"], ["rolls", "🎲 Chaos Draft"]].map(([id, label]) => (
                        <button key={id} role="tab" aria-selected={buildMethod === id} onClick={() => { setBuildMethod(id); setYz(null); setManual([null, null, null, null, null]); }} style={{
                          flex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 40,
                          border: `1px solid ${buildMethod === id ? T.goldBorder : T.border}`,
                          background: buildMethod === id ? T.goldSoft : "transparent",
                          color: buildMethod === id ? T.gold : T.textDim,
                        }}>{label}</button>
                      ))}
                      <button onClick={randomGold} style={{
                        flex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 40,
                        border: `1px solid ${T.goldBorder}`, background: T.goldSoft, color: T.gold,
                      }}>🔀 Random Team</button>
                      <button onClick={resetGold} disabled={!yz && !manual.some(Boolean)} aria-label="Reset Team Gold" style={{
                        flex: "0 0 auto", padding: "8px 12px", fontSize: 12, fontWeight: 800, borderRadius: 8, minHeight: 40,
                        border: `1px solid ${T.border}`, background: "transparent",
                        color: (!yz && !manual.some(Boolean)) ? T.textMuted : T.textDim,
                        cursor: (!yz && !manual.some(Boolean)) ? "default" : "pointer",
                      }}>↻ Reset</button>
                    </div>
                  )}
                  {!isDaily && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                      <BallIqToggle on={ballIQ} onChange={setBallIQ} />
                    </div>
                  )}
                  {buildMethod === "manual" && !isDaily ? (
                    <RosterGrid five={manual} team="gold" hideStats={ballIQ} flashSlot={flashSlot}
                      onSlot={(i) => setPicker({ slot: i, target: "gold-manual" })} />
                  ) : (
                    <RollBuilder yz={yz} ballIQ={ballIQ} isDaily={isDaily}
                      onStart={() => startBuild(isDaily)} onKeep={toggleKeep} onRespin={setRespin} onRoll={doRoll} />
                  )}
                  <RosterBalance team={buildMethod === "manual" ? manual : (yz ? yz.roster.map((p, i) => (yz.keep[i] ? p : null)) : [])} side="gold" compact />
                </>
              )}
              {team && (
                <>
                  <RosterGrid five={team} team="gold" flashSlot={flashSlot} fitFor={(i) => teamFit(team, i)}
                    onSlot={!loading && !isDaily ? (i) => setPicker({ slot: i, target: "gold-swap" }) : null} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontSize: 12, color: T.textDim }}>
                    <span style={{ display: "flex", gap: 6 }}>
                      {!isDaily && (
                        <button onClick={randomGold} aria-label="Re-roll Team Gold" style={{
                          padding: "6px 11px", fontSize: 11.5, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 34,
                          border: `1px solid ${T.goldBorder}`, background: T.goldSoft, color: T.gold,
                        }}>🔀 Re-roll</button>
                      )}
                      <button onClick={resetGold} aria-label="Reset Team Gold" style={{
                        padding: "6px 11px", fontSize: 11.5, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 34,
                        border: `1px solid ${T.border}`, background: "transparent", color: T.textDim,
                      }}>↻ Reset</button>
                    </span>
                    <span />
                  </div>
                  <RosterBalance team={team} side="gold" />
                </>
              )}
            </TeamShell>

            {/* CENTER: VS + steps + era + preview + CTA */}
            <div style={{ flex: "0 1 310px", minWidth: 250, display: "flex", flexDirection: "column", gap: 12, alignSelf: "stretch", justifyContent: "center", margin: "0 auto" }}>
              
              {/* Daily coach + era step. Appears once the seeded roster is
                  locked, because hiring a coach for a lineup you have not
                  finished drafting is a decision with no information. */}
              {dailyCoachRequired && !!team && !result && (
                <DailyCoachEra
                  config={dailyCfg}
                  selectedCoachId={dailyCoach?.coachId || null}
                  disabled={loading || dailyDone}
                  onOptionsViewed={onDailyOptionsViewed}
                  onSelectCoach={selectDailyCoach}
                />
              )}
              {dailyCoachRequired && !!team && !dailyChoiceReady && !result && (
                <div style={{ textAlign: "center", fontSize: 12, color: T.gold, fontWeight: 700 }}>
                  Hire one of today's three coaches to unlock the sim.
                </div>
              )}

              <ArenaCentre>
                {v3Steps
                  ? <EdgePreview gold={team} blue={blueBuildable ? opponent : null} coachGoldId={coachGold?.id} coachBlueId={coachBlue?.id} eraStyleId={eraStyle} onArena />
                  : <MatchupPreview gold={team} blue={blueBuildable ? opponent : null} v3={null} />}
              </ArenaCentre>
              {team && blueBuildable && !opponent && (
                <div style={{ textAlign: "center", fontSize: 12, color: T.textDim, padding: "0 10px" }}>
                  Build <b style={{ color: T.blue }}>Team Blue</b> — Manual or Random — to continue.
                </div>
              )}
              {v3Steps && rosterDone && (
                <button onClick={() => setPlayStage("COACHES")} style={{
                  width: "100%", padding: "14px 18px", fontSize: 14, fontWeight: 900, letterSpacing: 0.5,
                  border: "none", borderRadius: 12, cursor: "pointer", minHeight: 50,
                  background: T.gold, color: "#fffdf8", boxShadow: T.glowGold,
                }}>Continue to Coaches →</button>
              )}
              {!v3Steps && team && (activeMode !== "Single" && activeMode !== "Best7" && activeMode !== "Daily" && activeMode !== "Challenge" ? true : !!opponent) && coachesReady && dailyChoiceReady && !result && !loading && (
                <div className="sticky-sim">
                  <button onClick={runTheSim} disabled={isDaily && dailyDone} style={{
                    width: "100%", padding: "16px 20px", fontSize: 15, fontWeight: 900, letterSpacing: 1,
                    border: "none", borderRadius: 12, cursor: "pointer", minHeight: 54,
                    background: `linear-gradient(120deg, ${T.gold} 0%, #ffd76a 60%, ${T.gold} 100%)`,
                    color: "#fffdf8", boxShadow: T.shadowRaised,
                  }}>
                    ⚡ RUN THE SIM
                  </button>
                  <div style={{ textAlign: "center", fontSize: 11, color: T.textDim, marginTop: 6 }}>
                    {GAME_MODES.find(([id]) => id === activeMode)?.[2] || (isChallenge ? "Beat their five." : isDaily ? "One official attempt." : "")}
                  </div>
                </div>
              )}
            </div>

            {/* TEAM BLUE */}
            <TeamShell team="blue" title={isChallenge ? `TEAM BLUE — ${challenge.challengerName || "RIVAL"}` : "TEAM BLUE"} count={opponent ? 5 : null}>
              {isChallenge && (
                <div style={{ marginBottom: 10, fontSize: 12.5, color: T.text }}>
                  <b style={{ color: T.blue }}>🎯 YOU'VE BEEN CHALLENGED.</b> {challenge.challengerName || "A rival"} thinks this five beats anything you build{challenge.record ? ` — they went ${challenge.record} with it` : ""}.
                  {challenge.rivalry && (challenge.rivalry.challenger + challenge.rivalry.opponent > 0) && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: T.textDim }}>
                      🥊 Rivalry: <b style={{ color: T.text }}>them {challenge.rivalry.challenger} — {challenge.rivalry.opponent} you</b>
                    </div>
                  )}
                </div>
              )}
              {/* Blue build methods — Team Blue is user-controlled, never auto-locked */}
              {!isChallenge && blueBuildable && !opponent && (
                <div role="tablist" aria-label="Blue build method" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <button role="tab" onClick={() => setPicker({ slot: blueManual.findIndex((x) => !x) === -1 ? 0 : blueManual.findIndex((x) => !x), target: "blue-manual" })} style={{
                    flex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 40,
                    border: `1px solid ${T.border}`, background: "transparent", color: T.textDim,
                  }}>✍️ Manual Draft</button>
                  <button role="tab" onClick={randomBlue} style={{
                    flex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 40,
                    border: `1px solid ${T.blueBorder}`, background: T.blueSoft, color: T.blue,
                  }}>🔀 Random Team</button>
                  <button onClick={resetBlue} disabled={!blueManual.some(Boolean)} aria-label="Reset Team Blue" style={{
                    flex: "0 0 auto", padding: "8px 12px", fontSize: 12, fontWeight: 800, borderRadius: 8, minHeight: 40,
                    border: `1px solid ${T.border}`, background: "transparent",
                    color: !blueManual.some(Boolean) ? T.textMuted : T.textDim,
                    cursor: !blueManual.some(Boolean) ? "default" : "pointer",
                  }}>↻ Reset</button>
                </div>
              )}
              {!isChallenge && blueBuildable && !opponent && (
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10, lineHeight: 1.45 }}>
                  Chaos Draft is a drafting game for your own five — build the opposition by hand or at random.
                </div>
              )}
              {opponent ? (
                <>
                  <RosterGrid five={opponent} team="blue" fitFor={(i) => teamFit(opponent, i)}
                    onSlot={!isChallenge && !isDaily && !loading ? (i) => setPicker({ slot: i, target: "blue-swap" }) : null} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontSize: 12, color: T.textDim }}>
                    {!isChallenge && !isDaily ? (
                      <span style={{ display: "flex", gap: 6 }}>
                        <button onClick={randomBlue} aria-label="Re-roll Team Blue" style={{
                          padding: "6px 11px", fontSize: 11.5, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 34,
                          border: `1px solid ${T.blueBorder}`, background: T.blueSoft, color: T.blue,
                        }}>🔀 Re-roll</button>
                        <button onClick={resetBlue} aria-label="Reset Team Blue" style={{
                          padding: "6px 11px", fontSize: 11.5, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 34,
                          border: `1px solid ${T.border}`, background: "transparent", color: T.textDim,
                        }}>↻ Reset</button>
                      </span>
                    ) : isDaily ? (
                      <span style={{ fontSize: 11, color: T.textDim }}>🔒 Today's official opponent — same for everyone</span>
                    ) : <span />}
                    <span />
                  </div>
                  <RosterBalance team={opponent} side="blue" compact />
                </>
              ) : blueBuildable ? (
                <RosterGrid five={blueManual} team="blue" flashSlot={flashSlot}
                  onSlot={(i) => setPicker({ slot: i, target: "blue-manual" })} />
              ) : (
                <div>
                  <LineupList team={[]} side="blue" />
                  <div style={{ marginTop: 10, fontSize: 11.5, color: T.textDim, lineHeight: 1.6, textAlign: "center" }}>
                    {activeMode === "Win82" ? "82 rival squads from every era await — finish your five to start the season."
                      : "Four playoff rivals stand between you and the title."}
                  </div>
                </div>
              )}
            </TeamShell>
          </div>
          )}

          {/* ── STAGE 2: COACHES ─────────────────────────────────────────── */}
          {v3Steps && playStage === "COACHES" && !result && (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
              <div style={{ flex: "1 1 340px", minWidth: 300 }}>
                <TeamShell team="gold" title="TEAM GOLD" count={5}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                    {(team || []).map((p) => <PlayerImageMini key={p.id} p={p} side="gold" />)}
                  </div>
                  <CoachPick side="gold" teamIds={(team || []).map((p) => p.id)}
                    eraStyleId={eraLocked ? eraStyle : undefined}
                    eraLabel={v3.eras?.find((e) => e.id === eraStyle)?.label}
                    selected={coachGold} onSelect={setCoachGold} allCoaches={v3.coaches} />
                </TeamShell>
              </div>
              <div style={{ flex: "0 1 320px", minWidth: 260, display: "flex", flexDirection: "column", gap: 12, alignSelf: "stretch", justifyContent: "center", margin: "0 auto" }}>
                <VsDivider active />
                <EdgePreview gold={team} blue={blueBuildable ? opponent : null} coachGoldId={coachGold?.id} coachBlueId={coachBlue?.id} eraStyleId={eraStyle} />
                <button onClick={() => setPlayStage("ERA")} disabled={!coachesReady} style={{
                  width: "100%", padding: "14px 18px", fontSize: 14, fontWeight: 900, letterSpacing: 0.5,
                  border: "none", borderRadius: 12, cursor: coachesReady ? "pointer" : "default", minHeight: 50,
                  background: coachesReady ? T.gold : T.border, color: coachesReady ? "#fffdf8" : T.textMuted,
                }}>Continue to Era Style →</button>
                {!coachesReady && (
                  <div style={{ textAlign: "center", fontSize: 12, color: T.textDim }}>
                    {blueBuildable && !coachGold && !coachBlue ? "Hire a coach for each team to continue."
                      : !coachGold ? "Team Gold still needs a coach." : "Team Blue still needs a coach."}
                  </div>
                )}
              </div>
              {blueBuildable ? (
                <div style={{ flex: "1 1 340px", minWidth: 300 }}>
                  <TeamShell team="blue" title="TEAM BLUE" count={5}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      {(opponent || []).map((p) => <PlayerImageMini key={p.id} p={p} side="blue" />)}
                    </div>
                    <CoachPick side="blue" teamIds={(opponent || []).map((p) => p.id)}
                      eraStyleId={eraLocked ? eraStyle : undefined}
                      eraLabel={v3.eras?.find((e) => e.id === eraStyle)?.label}
                      selected={coachBlue} onSelect={setCoachBlue} allCoaches={v3.coaches} />
                  </TeamShell>
                </div>
              ) : (
                <div style={{ flex: "1 1 340px", minWidth: 300 }}>
                  <TeamShell team="blue" title="THE FIELD" count={null}>
                    <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>
                      {gameMode === "Win82" ? "82 rival squads are generated with their own staffs — your coach carries the season." : "Each playoff rival arrives with its own staff — your coach carries the run."}
                    </div>
                  </TeamShell>
                </div>
              )}
            </div>
          )}

          {/* ── STAGE 3: ERA STYLE ───────────────────────────────────────── */}
          {v3Steps && playStage === "ERA" && !result && (
            <div style={{ marginTop: 8 }}>
              <VsRow gold={team} blue={blueBuildable ? opponent : null} coachGold={coachGold} coachBlue={blueBuildable ? coachBlue : null}
                blueTitle={blueBuildable ? "TEAM BLUE" : "THE FIELD"} />
              <EraStage eras={v3.eras} selected={eraStyle} onSelect={setEraStyle}
                gold={team || []} blue={blueBuildable ? (opponent || []) : []} />
              <div style={{ maxWidth: 420, margin: "16px auto 0" }}>
                <button onClick={() => { setEraLocked(true); setPlayStage("READY"); }} style={{
                  width: "100%", padding: "15px 18px", fontSize: 14, fontWeight: 900, letterSpacing: 0.5,
                  border: "none", borderRadius: 12, cursor: "pointer", minHeight: 52,
                  background: T.gold, color: "#fffdf8", boxShadow: T.glowGold,
                }}>Lock Era Style and Continue →</button>
              </div>
            </div>
          )}

          {/* ── READY TO RUN — the tipoff moment ─────────────────────────── */}
          {v3Steps && playStage === "READY" && !result && !loading && (
            <div style={{ marginTop: 8, maxWidth: 900, marginLeft: "auto", marginRight: "auto" }}>
              <div className="ec-arena-inset" style={{ padding: "22px 18px" }}>
                <div style={{ fontSize: 10.5, letterSpacing: 4, color: T.onArenaDim, fontWeight: 800, textAlign: "center" }}>READY TO RUN</div>
                <div className="ready-row">
                  <ReadySide side="gold" team={team} coach={coachGold} />
                  <div style={{ textAlign: "center" }}>
                    <div aria-hidden="true" style={{
                      fontSize: 40, fontWeight: 900, fontStyle: "italic", fontFamily: FONT.display, letterSpacing: -1,
                      background: `linear-gradient(120deg, ${T.goldOnDark} 28%, #ffffff 50%, ${T.blueOnDark} 72%)`,
                      WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                    }}>VS</div>
                    <div style={{ fontSize: 12.5, color: T.onArenaDim, marginTop: 2 }}>
                      {v3.eras?.find((e) => e.id === eraStyle)?.label || eraStyle} Era Style
                    </div>
                  </div>
                  <ReadySide side="blue" team={blueBuildable ? opponent : null} coach={blueBuildable ? coachBlue : null}
                    fallbackLabel={gameMode === "Win82" ? "82 generated rivals" : "Four playoff rivals"} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", margin: "12px 0" }}>
                {[["Edit rosters", "ROSTERS"], ["Edit coaches", "COACHES"], ["Edit era", "ERA"]].map(([label, stage]) => (
                  <button key={stage} onClick={() => setPlayStage(stage)} style={{
                    background: T.bgCard, border: `1px solid ${T.border}`, color: T.textDim, borderRadius: R.sm,
                    padding: "8px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, minHeight: 42,
                  }}>{label}</button>
                ))}
              </div>

              <div style={{ maxWidth: 460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
                <EdgePreview gold={team} blue={blueBuildable ? opponent : null} coachGoldId={coachGold?.id} coachBlueId={coachBlue?.id} eraStyleId={eraStyle} />
                <div className="sticky-sim">
                  <button onClick={runTheSim} style={{
                    width: "100%", padding: "17px 20px", fontSize: 16, fontWeight: 900, letterSpacing: 1,
                    border: "none", borderRadius: 12, cursor: "pointer", minHeight: 58,
                    background: `linear-gradient(120deg, ${T.gold} 0%, #d9a83a 60%, ${T.gold} 100%)`,
                    color: "#fffdf8", boxShadow: T.shadowRaised,
                  }}>
                    ⚡ RUN THE SIM
                  </button>
                  <div style={{ textAlign: "center", fontSize: 12, color: T.textDim, marginTop: 6 }}>
                    {GAME_MODES.find(([id]) => id === activeMode)?.[2] || ""}
                  </div>
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );

  // ── Dedicated simulation transition (builder leaves the stage) ──────────────
  const simulatingView = (
    <div style={{ maxWidth: 720, margin: "8vh auto 0" }}>
      <SimulationLoading stage={simStage} progress={progress}
        goldLabel="TEAM GOLD" blueLabel={isChallenge ? (challenge?.challengerName || "TEAM BLUE").toUpperCase() : "TEAM BLUE"}
        coachGold={coachGold?.name} coachBlue={blueBuildable ? coachBlue?.name : null}
        eraLabel={v3.eras?.find((e) => e.id === eraStyle)?.label || null} />
    </div>
  );

  // ── Dedicated Postgame view (no builder above it) ───────────────────────────
  const postgameView = result && (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <ResultView result={result} team={team} feedbackCtx={feedbackCtx}
        narrative={narrative} onRetryNarrative={retryNarrative}
        onRematch={() => doRematch(result?.tag)}
        onBest7={result.type !== "best7" ? doBest7FromResult : null}
        onChallenge={doShare} onSwap={startSwap} onShare={doShare}
        onLeaderboard={() => handleNav("Daily")} />
      {result.tag === "daily" && <DailyPanel daily={daily} career={career} />}
      <div style={{ display: "flex", gap: 10, maxWidth: 700, margin: "12px auto 0" }}>
        <button onClick={() => setSaved((s) => [...s, { id: Date.now(), name: `Squad ${s.length + 1}`, ids: team.map((p) => p.id), rating: teamRating(team) }])}
          style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 800, borderRadius: 9, background: T.bgCardHover, color: T.text, cursor: "pointer", border: `1px solid ${T.border}` }}>💾 Save Squad</button>
        <button onClick={resetPlay} style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 800, borderRadius: 9, background: T.bgCardHover, color: T.text, cursor: "pointer", border: `1px solid ${T.border}` }}>🎲 New Game</button>
      </div>
    </div>
  );

  const challengesHub = (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div style={{ ...card, padding: 26, textAlign: "center" }}>
        <div style={{ fontSize: 34 }}>⚔️</div>
        <h2 style={{ margin: "8px 0 6px" }}>Challenges</h2>
        <p style={{ fontSize: 13.5, color: T.textDim, lineHeight: 1.65 }}>
          Build a five, run a game, then hit <b style={{ color: T.gold }}>Challenge a Friend</b> on the postgame.
          Anyone who opens your link plays against your exact lineup — wins, losses and rematches are tracked as a rivalry.
        </p>
        <button onClick={() => handleNav("Play")} style={{ padding: "13px 30px", fontSize: 14, fontWeight: 900, border: "none", borderRadius: 10, background: T.gold, color: "#fffdf8", cursor: "pointer", minHeight: 48 }}>
          BUILD A TEAM →
        </button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`arena ${winnerClass}`} style={{ color: T.text }}>
      <GameHeader nav={nav} onNav={handleNav} dailyStreak={dailyStreak}
        modes={chaosAvailable ? GAME_MODES : GAME_MODES.filter(([id]) => id !== "Chaos")} gameMode={gameMode}
        onMode={(id) => { if (nav !== "Play") handleNav("Play"); else resetPlay(); setGameMode(id); }} />

      {newBuild && (
        <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap",
          padding: "10px 16px", background: T.goldSoft, borderBottom: `1px solid ${T.goldBorder}`, fontSize: 12.5, color: T.text }}>
          <span>A newer version of EraClash is live — you're viewing build <b>{shortBuild()}</b>.</span>
          <button onClick={() => window.location.reload()} style={{
            padding: "7px 16px", fontSize: 12, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 40,
            border: "none", background: T.gold, color: "#fffdf8" }}>Reload to update</button>
        </div>
      )}
      {err && <div role="alert" style={{ background: "#3a1520", color: "#ff8a9a", padding: 12, textAlign: "center", fontSize: 13 }}>{err}</div>}

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "8px 16px 60px" }}>
        {sharedResult ? (
          <div style={{ maxWidth: 620, margin: "16px auto 0" }}>
            <SharedResultView snap={sharedResult} onPlay={() => {
              const t = sharedResult.teamIds.map((id) => findCard(id));
              if (!t.some((x) => !x)) {
                setChallenge({ id: sharedResult.challengeId || null, team: t, record: sharedResult.scoreline, challengerName: sharedResult.name, games: [], rivalry: null });
                setSharedResult(null); setNav("Challenges");
                track("challenge_started", { from: "shared_result" });
              }
            }} />
          </div>
        ) : nav === "Profile" ? (
          <div style={{ maxWidth: 860, margin: "16px auto 0" }}>
            <Profile career={career} badges={badges} BADGES={BADGES} saved={saved} daily={daily}
              onLoadTeam={(ids) => { const t = ids.map((id) => findCard(id)); if (!t.some((x) => !x)) { resetPlay(); setNav("Play"); setTeam(t); } }} />
          </div>
        ) : nav === "Board" ? (
          <div style={{ maxWidth: 720, margin: "16px auto 0" }}>
            <Board board={board} streaks={streaks} badges={badges} BADGES={BADGES} />
          </div>
        ) : nav === "Credits" ? (
          <div style={{ maxWidth: 860, margin: "16px auto 0" }}><Credits /></div>
        ) : nav === "Challenges" && !challenge ? (
          <div style={{ marginTop: 16 }}>{challengesHub}</div>
        ) : view === "simulating" ? (
          simulatingView
        ) : view === "postgame" && result ? (
          postgameView
        ) : (
          playView
        )}
      </main>

      {picker && (
        <ManualPicker slotPos={POSITIONS[picker.slot]}
          excludeIds={(picker.target === "gold-swap" && team ? team
            : picker.target === "blue-swap" && opponent ? opponent
            : picker.target === "blue-manual" ? blueManual
            : manual).filter(Boolean).map((p) => p.id)}
          onPick={pickManual} onClose={() => setPicker(null)} />
      )}
      {share && <ShareModal share={share} onClose={() => setShare(null)} />}

      <footer style={{ textAlign: "center", padding: 20, fontSize: 10.5, color: T.textDim, borderTop: `1px solid ${T.border}` }}>
        EraClash is an independent fan-made game. Not affiliated with or endorsed by the NBA.
        {" · "}
        <button onClick={() => handleNav("Credits")} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10.5, textDecoration: "underline", padding: 0 }}>
          Image credits
        </button>
        {" · "}
        <span title="Which build you are running — quote this if you report something">build {shortBuild()}</span>
      </footer>
    </div>
  );
}

// ── Chaos (yahtzee) builder inside the Gold panel ─────────────────────────────
function RollBuilder({ yz, ballIQ, isDaily, onStart, onKeep, onRespin, onRoll }) {
  if (!yz) {
    return (
      <div style={{ textAlign: "center", padding: "18px 4px" }}>
        <p style={{ color: T.textDim, fontSize: 13, margin: "0 0 14px", lineHeight: 1.6 }}>
          Three rolls, Yahtzee rules. Keep who you love, re-spin the rest by <b>era</b> or <b>player</b>.
        </p>
        <button onClick={onStart} style={{ padding: "13px 30px", fontSize: 14, fontWeight: 900, border: "none", borderRadius: 10, background: T.gold, color: "#fffdf8", cursor: "pointer", minHeight: 48 }}>
          {isDaily ? "Start Today's Challenge" : "🎲 Start Drafting"}
        </button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>Roll {yz.roll} of 3</span>
        <span style={{ fontSize: 11, color: T.textDim }}>{ballIQ ? "🧠 stats hidden" : "✓ keep · 🔁 re-spin"}</span>
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {yz.roster.map((p, i) => (
          <div key={i} style={{ padding: 10, borderRadius: 10, background: yz.keep[i] ? "rgba(46,204,113,0.08)" : T.bgCardHover, border: `1px solid ${yz.keep[i] ? T.green : T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={yz.keep[i]} onChange={() => onKeep(i)} aria-label={`Keep ${p.name}`} style={{ width: 17, height: 17, cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <FilledSlot p={p} pos={POSITIONS[i]} team="gold" hideStats={ballIQ} />
              </div>
            </div>
            {!yz.keep[i] && !yz.done && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, marginLeft: 25 }}>
                {[["era", "🔁 Era"], ["position", "🔁 Player"]].map(([t, label]) => (
                  <button key={t} onClick={() => onRespin(i, t)} style={{
                    flex: 1, padding: 6, fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: "pointer", minHeight: 34,
                    border: `1px solid ${yz.respin[i] === t ? T.gold : T.border}`,
                    background: yz.respin[i] === t ? T.goldSoft : "transparent", color: yz.respin[i] === t ? T.gold : T.textDim,
                  }}>{label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onRoll} disabled={yz.done} style={{ width: "100%", padding: 13, fontSize: 13.5, fontWeight: 900, border: "none", borderRadius: 10, background: yz.done ? T.border : T.gold, color: yz.done ? T.textDim : "#fffdf8", cursor: yz.done ? "default" : "pointer", minHeight: 48 }}>
        {yz.done ? "✓ Squad locked" : yz.roll === 3 ? "🎯 Finalize Squad" : `Roll ${yz.roll + 1} →`}
      </button>
    </div>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────
function ResultView({ result, team, feedbackCtx, narrative, onRetryNarrative, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard }) {
  const narrProps = { narrativeStatus: narrative?.status, onRetryNarrative, persisted: result.persisted };
  if (result.type === "82") {
    const pct = ((result.wins / 82) * 100).toFixed(1);
    return (
      <div>
        <div className="rise" style={{ ...card, padding: 24, marginTop: 14, textAlign: "center" }}>
          <div style={{ fontSize: 12, letterSpacing: 3, color: T.textDim }}>{result.partial ? "PARTIAL " : ""}SEASON RESULT</div>
          <div style={{ fontSize: 52, fontWeight: 900, fontStyle: "italic", color: result.wins === 82 ? T.gold : result.wins > 60 ? T.green : result.wins > 41 ? T.orange : T.red }}>
            {result.wins}–{result.losses}
          </div>
          <div style={{ fontSize: 13, color: T.textDim }}>{result.wins === 82 ? "🏆 PERFECT SEASON" : `${pct}% win rate`}</div>
        </div>
        {result.lastSim && (
          <Postgame sim={result.lastSim} won={String(result.lastSim.winner || "").toLowerCase().includes("gold")}
            mode="single" seriesLabel="Season finale" team={team} opp={result.opp} feedbackCtx={feedbackCtx} {...narrProps}
            onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge} onSwap={onSwap} onShare={onShare} />
        )}
      </div>
    );
  }
  if (result.type === "single") {
    const pgMode = result.tag === "challenge" ? "challenge" : result.tag === "daily" ? "daily" : "single";
    return <Postgame sim={result.sim} won={result.w} mode={pgMode} team={team} opp={result.opp} feedbackCtx={feedbackCtx} {...narrProps}
      onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge} onSwap={onSwap} onShare={onShare} onLeaderboard={onLeaderboard} />;
  }
  if (result.type === "best7") {
    return <Postgame sim={result.sim} won={result.won} mode="best7" seriesLabel="Best of 7" team={team} opp={result.opp} feedbackCtx={feedbackCtx} {...narrProps}
      onRematch={onRematch} onChallenge={onChallenge} onSwap={onSwap} onShare={onShare} />;
  }
  if (result.type === "tournament") {
    return (
      <div className="rise" style={{ ...card, padding: 20, marginTop: 14 }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 30, fontWeight: 900, fontStyle: "italic" }}>{result.won ? "🏆 CHAMPION" : "Run Over"}</div>
          {result.won && result.rounds[3]?.sim?.mvp && (
            <div style={{ fontSize: 13, color: T.gold, fontWeight: 700, marginTop: 4 }}>Finals MVP: {result.rounds[3].sim.mvp}</div>
          )}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {result.rounds.map((r, i) => (
            <div key={i} style={{ padding: 12, borderRadius: 9, background: r.advanced ? "rgba(46,204,113,0.07)" : "rgba(231,76,60,0.07)", border: `1px solid ${r.advanced ? T.green : T.red}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: T.textDim }}>vs {r.opp.map((p) => p.name.split(" ").slice(-1)[0]).join(", ")}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900, fontSize: 17 }}>{r.sim?.seriesResult || "—"}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: r.advanced ? T.green : T.red }}>{r.advanced ? "ADVANCED" : "ELIMINATED"}</div>
                </div>
              </div>
              {r.sim?.summary && <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>{r.sim.summary}</div>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onShare} style={{ flex: 1, padding: 13, fontSize: 13, fontWeight: 800, border: "none", borderRadius: 9, background: T.gold, color: "#fffdf8", cursor: "pointer" }}>📤 Share the Run</button>
        </div>
      </div>
    );
  }
  return null;
}

// ── Shared result landing (/?r=id) ───────────────────────────────────────────
function SharedResultView({ snap, onPlay }) {
  const team = snap.teamIds.map((id) => findCard(id)).filter(Boolean);
  return (
    <div className="rise" style={{ ...card, padding: 22, borderColor: T.goldBorder, boxShadow: T.glowGold }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: T.gold, fontWeight: 800 }}>SHARED RESULT</div>
        <div style={{ fontSize: 44, fontWeight: 900, fontStyle: "italic", margin: "6px 0", color: snap.won ? T.green : T.red }}>
          {snap.won ? "W" : "L"} {snap.scoreline}
        </div>
        {snap.name && <div style={{ fontSize: 13, color: T.textDim }}>by <b style={{ color: T.text }}>{snap.name}</b></div>}
      </div>
      <div style={{ display: "grid", gap: 6, margin: "16px 0" }}>
        {POSITIONS.map((pos, i) => team[i] && (
          <FilledSlot key={pos} p={team[i]} pos={pos} team="gold" />
        ))}
      </div>
      {snap.mvp && (
        <div style={{ padding: 10, borderRadius: 9, background: T.goldSoft, border: `1px solid ${T.goldBorder}`, textAlign: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 10, letterSpacing: 2, color: T.gold, fontWeight: 800 }}>⭐ MVP </span>
          <b>{snap.mvp}</b>{snap.mvpLine && <span style={{ color: T.textDim, fontSize: 12 }}> — {snap.mvpLine}</span>}
        </div>
      )}
      {snap.insight && <p style={{ fontSize: 13, color: T.textDim, textAlign: "center", margin: "0 0 14px" }}>"{snap.insight}"</p>}
      <button onClick={onPlay} style={{ width: "100%", padding: 15, fontSize: 14, fontWeight: 900, border: "none", borderRadius: 10, background: T.gold, color: "#fffdf8", cursor: "pointer", minHeight: 48 }}>
        ⚔️ CAN YOUR TEAM BEAT THIS LINEUP? PLAY THE CHALLENGE
      </button>
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
function Board({ board, streaks, badges, BADGES }) {
  return (
    <div>
      <div style={{ ...card, padding: 20, marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>📊 Best 82-Game Seasons</h2>
        {board.length === 0 ? <p style={{ color: T.textDim, fontSize: 13 }}>No seasons completed yet. Run WIN 82 to get on the board.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {board.map((r, i) => {
              const t = r.team.map((id) => findCard(id)).filter(Boolean);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, background: T.bgCardHover, borderRadius: 8 }}>
                  <div>
                    <span style={{ fontWeight: 900, color: i === 0 ? T.gold : T.text }}>#{i + 1}</span>
                    <span style={{ fontSize: 11, color: T.textDim, marginLeft: 10 }}>{t.map((p) => p.name.split(" ").slice(-1)[0]).join(" · ")}</span>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: r.wins > 60 ? T.green : T.orange }}>{r.wins}–{82 - r.wins}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ ...card, padding: 20 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Your Stats</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, fontSize: 13 }}>
          <Stat label="Current streak" v={streaks.current} hot={streaks.current > 0} />
          <Stat label="Personal best" v={streaks.personalBest} />
          <Stat label="This week" v={streaks.thisWeekBest} />
          <Stat label="Badges" v={`${badges.length}/${Object.keys(BADGES).length}`} />
        </div>
      </div>
    </div>
  );
}
const Stat = ({ label, v, hot }) => (
  <div style={{ padding: 10, background: T.bgCardHover, borderRadius: 8, flex: 1 }}>
    <div style={{ fontSize: 11, color: T.textDim }}>{label}</div>
    <div style={{ fontWeight: 900, fontSize: 20, color: hot ? T.green : T.text }}>{v}</div>
  </div>
);

// ── Share modal ──────────────────────────────────────────────────────────────
function ShareModal({ share, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(12,22,39,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div style={{ ...card, padding: 22, maxWidth: 480, width: "100%" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share challenge">
        <h2 style={{ margin: "0 0 6px", fontSize: 17 }}>📤 Challenge a Friend</h2>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: T.textDim }}>Anyone who opens this link sees your result and plays <b>against your exact five</b>.</p>
        <textarea readOnly value={share.text} aria-label="Share text" style={{ width: "100%", height: 170, padding: 12, fontSize: 12, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, resize: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={() => { navigator.clipboard.writeText(share.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ flex: 1, padding: 12, fontWeight: 800, fontSize: 13, border: "none", borderRadius: 9, background: T.gold, color: "#fffdf8", cursor: "pointer" }}>
            {copied ? "✓ Copied!" : "📋 Copy Challenge"}
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: 12, fontWeight: 800, fontSize: 13, borderRadius: 9, background: "transparent", color: T.text, border: `1px solid ${T.border}`, cursor: "pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}
