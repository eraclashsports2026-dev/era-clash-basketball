import { useState, useEffect, useRef } from "react";
import { PLAYERS, POSITIONS } from "./players.js";
import { displayOVR, analyzeBalance, teamRating } from "./rating.js";
import { T, card } from "./theme.js";
import { mulberry32, simulateGame } from "./engine.js";
import { genPlayer, genRoster, genOpponent, todaySeed, todayKey } from "./draft.js";
import { runSimulation } from "./simClient.js";
import { track, trackSessionStart } from "./analytics.js";
import { installErrorMonitoring } from "./errors.js";
import { getUid, getDisplayName } from "./identity.js";
import {
  loadCareer, recordGame, recordWin82, recordTournamentWin, recordDraft,
  updateDailyStreak, syncCareer, computeDailyStreak,
} from "./career.js";
import { createChallenge, loadChallengeFromUrl, completeChallenge } from "./challengeClient.js";
import { publishResult, shareText } from "./share.js";
import { USE_ENGINE_SEASON } from "./versions.js";
import GameHeader from "./components/GameHeader.jsx";
import Postgame from "./components/Postgame.jsx";
import DailyPanel, { submitDailyResult } from "./components/DailyPanel.jsx";
import Profile from "./components/Profile.jsx";
import Credits from "./components/Credits.jsx";
import ChemistryMeter from "./components/ChemistryMeter.jsx";
import MatchupPreview, { VsDivider } from "./components/MatchupPreview.jsx";
import SimulationLoading from "./components/SimulationLoading.jsx";
import ManualPicker from "./components/ManualPicker.jsx";
import { TeamShell, EmptySlot, FilledSlot, LineupList } from "./components/TeamSlots.jsx";
import { teamFit } from "./chemistryView.js";

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
  ["Single", "SINGLE GAME", "One game. One winner."],
  ["Best7", "BEST OF 7", "Settle the debate."],
  ["Win82", "WIN 82", "Survive the season."],
  ["Tournament", "TOURNAMENT", "Four rounds to a title."],
];
const MODE_TO_ANALYTICS = { Win82: "82", Single: "single", Best7: "best7", Tournament: "tournament", Daily: "daily", Challenge: "challenge" };

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [nav, setNav] = useState("Play");             // Play | Daily | Challenges | Board | Profile | Credits
  const [gameMode, setGameMode] = useState("Single"); // Single | Best7 | Win82 | Tournament
  const [buildMethod, setBuildMethod] = useState("rolls"); // rolls (Chaos Draft) | manual
  const [yz, setYz] = useState(null);
  const [ballIQ, setBallIQ] = useState(false);
  const [team, setTeam] = useState(null);              // completed gold five
  const [manual, setManual] = useState([null, null, null, null, null]);
  const [picker, setPicker] = useState(null);          // {slot, forSwap}
  const [opponent, setOpponent] = useState(null);      // revealed blue five
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simStage, setSimStage] = useState("");
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const [share, setShare] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [sharedResult, setSharedResult] = useState(null);
  const [flashSlot, setFlashSlot] = useState(null);
  const lastOppRef = useRef(null);

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

  const addBadge = (k) => setBadges((b) => (b.includes(k) ? b : [...b, k]));
  const recordWinStreak = () => setStreaks((s) => {
    const cur = s.current + 1;
    if (cur >= 5) addBadge("win_streak_5");
    if (cur >= 10) addBadge("win_streak_10");
    return { ...s, current: cur, personalBest: Math.max(s.personalBest, cur), thisWeekBest: Math.max(s.thisWeekBest, cur) };
  });
  const recordLossStreak = () => setStreaks((s) => ({ ...s, current: 0 }));

  const isDaily = nav === "Daily";
  const isChallenge = nav === "Challenges" && !!challenge;
  const activeMode = isDaily ? "Daily" : isChallenge ? "Challenge" : gameMode;

  // Reveal the Blue five once Gold is complete (single/best7/daily). Same
  // generator the sim always used — just shown before tipoff now.
  useEffect(() => {
    if (isChallenge) { setOpponent(challenge.team); return; } // rival five is visible immediately
    if (!team) { setOpponent(null); return; }
    if ((activeMode === "Single" || activeMode === "Best7" || activeMode === "Daily") && !opponent) {
      setOpponent(genOpponent());
    }
  }, [team, activeMode, isChallenge]); // eslint-disable-line

  // ── Draft: Chaos (yahtzee rolls) ───────────────────────────────────────────
  const startBuild = (seeded) => {
    const rng = seeded ? mulberry32(todaySeed()) : Math.random;
    const roster = genRoster(rng);
    setYz({ roll: 1, roster, keep: [false, false, false, false, false], respin: [null, null, null, null, null], done: false, seeded: !!seeded });
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
    const rng = z.seeded ? mulberry32(todaySeed() + z.roll * 7919) : Math.random;
    const respins = z.respin.filter(Boolean).length;
    if (respins) track("reroll_used", { roll: z.roll, respins });
    const roster = z.roster.map((p, i) => {
      if (z.keep[i]) return p;
      if (z.respin[i] === "position") return genPlayer(null, rng, { era: p.decade, eliteN: 10 });
      if (z.respin[i] === "era") return genPlayer(POSITIONS[i], rng, { eliteN: 10 });
      return genPlayer(POSITIONS[i], rng, { eliteN: 12 });
    });
    if (z.roll === 3) { finalizeTeam(roster); return { ...z, roster, done: true }; }
    roster.forEach((p, i) => { if (!z.keep[i]) track("player_option_shown", { slot: POSITIONS[i], player_id: p.id, player_era: p.decade, roll: z.roll + 1 }); });
    return { ...z, roll: z.roll + 1, roster, keep: [false, false, false, false, false], respin: [null, null, null, null, null] };
  });

  // ── Draft: Manual ──────────────────────────────────────────────────────────
  const pickManual = (p) => {
    const slot = picker.slot;
    if (picker.forSwap && team) {
      const next = team.map((x, i) => (i === slot ? p : x));
      setTeam(next); setResult(null); setOpponent(isChallenge ? challenge.team : null);
      setCareer((c) => recordDraft(c, [p]));
      track("player_selected", { slot: POSITIONS[slot], player_id: p.id, player_era: p.decade, method: "swap" });
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

  const abandonDraftIfNeeded = () => {
    if ((yz && !yz.done) || (manual.some(Boolean) && !manual.every(Boolean))) track("draft_abandoned", { roll: yz?.roll });
  };

  const resetPlay = () => {
    abandonDraftIfNeeded();
    setYz(null); setTeam(null); setResult(null); setErr(""); setProgress(null);
    setManual([null, null, null, null, null]); setOpponent(null); setPicker(null);
  };
  const handleNav = (id) => { resetPlay(); setSharedResult(null); setNav(id); };

  // ── Game bookkeeping ───────────────────────────────────────────────────────
  const bookkeepGame = (won, mode, score, mvp, vs, opp) => {
    if (won) {
      recordWinStreak();
      if (opp && teamRating(opp) > teamRating(team)) addBadge("giant_slayer");
    } else recordLossStreak();
    setCareer((c) => recordGame(c, { won, mode, score, mvp, vs }));
  };

  // ── Simulations ────────────────────────────────────────────────────────────
  const runSingle = async (oppOverride, tag) => {
    if (loading) return;
    setLoading(true); setErr(""); setSimStage("");
    noteGameStarted();
    const mode = tag || "single";
    try {
      const opp = oppOverride || opponent || genOpponent();
      lastOppRef.current = opp;
      const sim = await runSimulation(team, opp, "single", { mode, onStage: setSimStage });
      const w = String(sim.winner || "").toLowerCase().includes("gold");
      bookkeepGame(w, mode, sim.seriesResult, sim.mvp, tag === "challenge" ? (challenge?.challengerName || "a friend") : "", opp);

      if (tag === "challenge") {
        if (w) addBadge("challenge_win");
        track(w ? "challenge_won" : "challenge_lost", { challenge_id: challenge?.id || null });
        track("challenge_completed", { challenge_id: challenge?.id || null });
        if (challenge?.id) {
          completeChallenge(challenge.id, team, { iWon: w, score: sim.seriesResult, mvp: sim.mvp }).then((updated) => {
            if (updated) setChallenge((c) => (c ? { ...c, games: updated.games, rivalry: updated.record } : c));
          });
        }
      }
      if (tag === "daily") {
        setDaily((d) => {
          const next = { ...d, [todayKey()]: { won: w } };
          setCareer((c) => {
            const c2 = updateDailyStreak(c, next);
            if (c2.stats.dailyStreak >= 7) addBadge("daily_streak_7");
            return c2;
          });
          return next;
        });
        addBadge("daily_done");
        track(w ? "daily_challenge_completed" : "daily_challenge_failed", { result: w ? "win" : "loss" });
        const m = String(sim.seriesResult || "").match(/^(\d{2,3})-(\d{2,3})$/);
        const margin = m ? Math.abs(Number(m[1]) - Number(m[2])) * (w ? 1 : -1) : 0;
        submitDailyResult({ uid: getUid(), name: getDisplayName(), won: w, margin });
      }
      setResult({ type: "single", sim, w, tag, opp });
    } catch (e) { setErr(e.message || "Simulation failed. Please try again."); }
    setLoading(false);
  };

  const runBest7 = async (oppOverride, tag) => {
    if (loading) return;
    setLoading(true); setErr(""); setSimStage("");
    noteGameStarted();
    track("best_of_7_started", { from: tag || "menu" });
    try {
      const opp = oppOverride || opponent || genOpponent();
      lastOppRef.current = opp;
      const sim = await runSimulation(team, opp, "series7", { mode: "best7", onStage: setSimStage });
      const won = String(sim.winner || "").toLowerCase().includes("gold");
      bookkeepGame(won, "best7", sim.seriesResult, sim.mvp, "", opp);
      setResult({ type: "best7", sim, won, tag, opp });
    } catch (e) { setErr(e.message || "Simulation failed. Please try again."); }
    setLoading(false);
  };

  const runWin82 = async () => {
    if (loading) return;
    setLoading(true); setErr(""); setSimStage(""); setProgress({ done: 0, total: 82, wins: 0 });
    noteGameStarted();
    let wins = 0, losses = 0;
    try {
      if (USE_ENGINE_SEASON) {
        for (let i = 0; i < 81; i++) {
          const opp = genOpponent();
          const g = simulateGame(team, opp);
          const w = g.winner === "Gold";
          if (w) { wins++; recordWinStreak(); } else { losses++; recordLossStreak(); }
          if (i % 3 === 0) {
            setProgress({ done: i + 1, total: 82, wins });
            await new Promise((r) => setTimeout(r, 24));
          }
        }
        setProgress({ done: 81, total: 82, wins, label: "Season finale" });
        const opp = genOpponent();
        lastOppRef.current = opp;
        const sim = await runSimulation(team, opp, "single", { mode: "82", onStage: setSimStage });
        const w = String(sim.winner || "").toLowerCase().includes("gold");
        if (w) { wins++; recordWinStreak(); } else { losses++; recordLossStreak(); }
        setProgress({ done: 82, total: 82, wins });
        setCareer((c) => recordWin82(recordGame(c, { won: wins > losses, mode: "82", score: `${wins}-${losses}`, mvp: sim.mvp }), wins));
        if (wins === 82) addBadge("perfect_82");
        const bal = analyzeBalance(team);
        if (wins >= 60 && bal.gaps.length === 0) addBadge("balanced_60");
        setBoard((b) => [...b, { wins, team: team.map((p) => p.id), ts: Date.now() }].sort((a, c) => c.wins - a.wins).slice(0, 10));
        setResult({ type: "82", wins, losses, lastSim: sim, opp });
      } else {
        let lastSim = null, lastOpp = null;
        for (let i = 0; i < 82; i++) {
          const opp = genOpponent();
          lastOpp = opp;
          const sim = await runSimulation(team, opp, "single", { mode: "82" });
          const w = String(sim.winner || "").toLowerCase().includes("gold");
          if (w) { wins++; recordWinStreak(); } else { losses++; recordLossStreak(); }
          lastSim = sim;
          setProgress({ done: i + 1, total: 82, wins });
        }
        if (wins === 82) addBadge("perfect_82");
        const bal = analyzeBalance(team);
        if (wins >= 60 && bal.gaps.length === 0) addBadge("balanced_60");
        setCareer((c) => recordWin82(recordGame(c, { won: wins > losses, mode: "82", score: `${wins}-${losses}`, mvp: lastSim?.mvp }), wins));
        setBoard((b) => [...b, { wins, team: team.map((p) => p.id), ts: Date.now() }].sort((a, c) => c.wins - a.wins).slice(0, 10));
        setResult({ type: "82", wins, losses, lastSim, opp: lastOpp });
      }
    } catch (e) {
      setErr("Simulation interrupted — partial season shown.");
      if (wins + losses > 0) setResult({ type: "82", wins, losses, partial: true });
    }
    setLoading(false); setProgress(null);
  };

  const runTournament = async () => {
    if (loading) return;
    setLoading(true); setErr(""); setSimStage("");
    noteGameStarted();
    const roundNames = ["Round 1", "Round 2", "Conference Finals", "Finals"];
    const rounds = [];
    try {
      for (let r = 0; r < 4; r++) {
        const opp = genOpponent();
        setProgress({ done: r + 1, total: 4, wins: rounds.filter((x) => x.advanced).length, label: roundNames[r], unit: "series" });
        const sim = await runSimulation(team, opp, "series7", { mode: "tournament", onStage: setSimStage });
        const advanced = String(sim.winner || "").toLowerCase().includes("gold");
        if (advanced) recordWinStreak(); else recordLossStreak();
        setCareer((c) => recordGame(c, { won: advanced, mode: "tournament", score: sim.seriesResult, mvp: sim.mvp }));
        rounds.push({ name: roundNames[r], opp, sim, advanced });
        if (!advanced) break;
      }
      const won = rounds.length === 4 && rounds[3].advanced;
      if (won) { addBadge("tournament_champion"); setCareer((c) => recordTournamentWin(c)); }
      setResult({ type: "tournament", rounds, won });
    } catch {
      setErr("Simulation failed mid-tournament.");
      if (rounds.length) setResult({ type: "tournament", rounds, won: false, partial: true });
    }
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
  const startSwap = () => { track("swap_one_started", {}); setResult(null); };

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

  const dailyDone = !!daily[todayKey()];
  const dailyStreak = computeDailyStreak(daily);
  const winnerClass = result ? ((result.w ?? result.won ?? (result.type === "82" && result.wins > result.losses)) ? "win-gold" : "win-blue") : "";
  const goldCount = team ? 5 : buildMethod === "manual" ? manual.filter(Boolean).length : (yz ? yz.roster.filter((_, i) => yz.keep[i]).length : 0);
  const feedbackCtx = result?.sim ? {
    simulation_id: result.sim.simulation_id,
    mode: result.tag || result.type,
    my_team: (team || []).map((p) => p.id),
    opp_team: result.opp ? result.opp.map((p) => p.id) : undefined,
  } : null;

  // ── Views ──────────────────────────────────────────────────────────────────
  const playView = (
    <div>
      {/* Compact hero */}
      {!team && !result && (
        <div style={{ textAlign: "center", padding: "18px 12px 6px" }}>
          <div style={{ fontSize: 11, letterSpacing: 5, color: T.gold, fontWeight: 800 }}>BUILD YOUR FIVE</div>
          <h1 style={{ margin: "4px 0 2px", fontSize: 30, fontWeight: 900, letterSpacing: 1, fontFamily: "Georgia, 'Times New Roman', serif" }}>
            CLASH ACROSS ERAS
          </h1>
          <div style={{ fontSize: 13, color: T.textDim }}>Draft legends. Build chemistry. Run the sim.</div>
        </div>
      )}

      {/* Mode selector + side controls */}
      {!isChallenge && !result && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "stretch", flexWrap: "wrap", padding: "14px 0" }}>
          {!isDaily && (
            <div role="tablist" aria-label="Game mode" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
              {GAME_MODES.map(([id, label, sub]) => (
                <button key={id} role="tab" aria-selected={gameMode === id} onClick={() => { resetPlay(); setGameMode(id); }} style={{
                  padding: "9px 16px", borderRadius: 10, cursor: "pointer", textAlign: "center", minHeight: 48,
                  border: `1px solid ${gameMode === id ? T.gold : T.border}`,
                  background: gameMode === id ? "rgba(253,185,39,0.12)" : "rgba(0,0,0,0.25)",
                  color: gameMode === id ? T.gold : T.textDim,
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: 1 }}>{label}</div>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>{sub}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Daily banner in Daily view */}
      {isDaily && !result && (
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <span style={{ display: "inline-block", padding: "8px 18px", borderRadius: 20, background: "rgba(253,185,39,0.1)", border: `1px solid ${T.goldBorder}`, fontSize: 12.5, color: T.gold, fontWeight: 800 }}>
            🏆 DAILY CLASH — seeded rolls, same for everyone today. One official attempt.
          </span>
        </div>
      )}

      {isDaily && dailyDone && !team && !result ? (
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
          {/* THE MATCHUP */}
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
                    <div role="tablist" aria-label="Build method" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                      {[["rolls", "🎲 Chaos Draft"], ["manual", "✍️ Manual Draft"]].map(([id, label]) => (
                        <button key={id} role="tab" aria-selected={buildMethod === id} onClick={() => { setBuildMethod(id); setYz(null); setManual([null, null, null, null, null]); }} style={{
                          flex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 40,
                          border: `1px solid ${buildMethod === id ? T.goldBorder : T.border}`,
                          background: buildMethod === id ? "rgba(253,185,39,0.1)" : "transparent",
                          color: buildMethod === id ? T.gold : T.textDim,
                        }}>{label}</button>
                      ))}
                    </div>
                  )}
                  {buildMethod === "manual" && !isDaily ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {POSITIONS.map((pos, i) => manual[i]
                        ? <FilledSlot key={pos} p={manual[i]} pos={pos} team="gold" hideStats={ballIQ} flash={flashSlot === i}
                            onSwap={() => setPicker({ slot: i, forSwap: false })} />
                        : <EmptySlot key={pos} pos={pos} team="gold" onAdd={() => setPicker({ slot: i, forSwap: false })} />)}
                    </div>
                  ) : (
                    <RollBuilder yz={yz} ballIQ={ballIQ} isDaily={isDaily}
                      onStart={() => startBuild(isDaily)} onKeep={toggleKeep} onRespin={setRespin} onRoll={doRoll} />
                  )}
                  <ChemistryMeter team={buildMethod === "manual" ? manual : (yz ? yz.roster.map((p, i) => (yz.keep[i] ? p : null)) : [])} side="gold" compact={!!yz} />
                </>
              )}
              {team && (
                <>
                  <div style={{ display: "grid", gap: 8 }}>
                    {POSITIONS.map((pos, i) => (
                      <FilledSlot key={pos} p={team[i]} pos={pos} team="gold" hideStats={false}
                        fit={teamFit(team, i)} flash={flashSlot === i}
                        onSwap={!loading && !isDaily ? () => setPicker({ slot: i, forSwap: true }) : null} />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: T.textDim }}>
                    <button onClick={resetPlay} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0 }}>↺ Rebuild squad</button>
                    <span>RATING <b style={{ color: T.gold }}>{teamRating(team)}</b></span>
                  </div>
                  <ChemistryMeter team={team} side="gold" />
                </>
              )}
            </TeamShell>

            {/* CENTER: VS + preview + CTA */}
            <div style={{ flex: "0 1 340px", minWidth: 260, display: "flex", flexDirection: "column", gap: 12, alignSelf: "stretch", justifyContent: "center", margin: "0 auto" }}>
              <VsDivider active={!!team && !!opponent} />
              <MatchupPreview gold={team} blue={opponent} />
              {team && (activeMode !== "Single" && activeMode !== "Best7" && activeMode !== "Daily" && activeMode !== "Challenge" ? true : !!opponent) && !result && !loading && (
                <div className="sticky-sim">
                  <button onClick={runTheSim} disabled={isDaily && dailyDone} style={{
                    width: "100%", padding: "16px 20px", fontSize: 15, fontWeight: 900, letterSpacing: 1,
                    border: "none", borderRadius: 12, cursor: "pointer", minHeight: 54,
                    background: `linear-gradient(120deg, ${T.gold} 0%, #ffd76a 60%, ${T.gold} 100%)`,
                    color: "#111", boxShadow: "0 6px 30px rgba(253,185,39,0.25)",
                  }}>
                    ⚡ RUN THE SIM
                  </button>
                  <div style={{ textAlign: "center", fontSize: 11, color: T.textDim, marginTop: 6 }}>
                    {GAME_MODES.find(([id]) => id === activeMode)?.[2] || (isChallenge ? "Beat their five." : isDaily ? "One official attempt." : "")}
                  </div>
                </div>
              )}
              {(activeMode === "Single" || activeMode === "Best7" || activeMode === "Daily") && team && opponent && !result && !loading && !isChallenge && (
                <button onClick={() => setOpponent(genOpponent())} style={{ background: "none", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>
                  🔀 New opponent
                </button>
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
              {opponent ? (
                <>
                  <LineupList team={opponent} side="blue" />
                  <div style={{ textAlign: "right", marginTop: 10, fontSize: 12, color: T.textDim }}>
                    RATING <b style={{ color: T.blue }}>{teamRating(opponent)}</b>
                  </div>
                  <ChemistryMeter team={opponent} side="blue" compact />
                </>
              ) : (
                <div>
                  <LineupList team={[]} side="blue" />
                  <div style={{ marginTop: 10, fontSize: 11.5, color: T.textDim, lineHeight: 1.6, textAlign: "center" }}>
                    {activeMode === "Win82" ? "82 rival squads from every era await — finish your five to start the season."
                      : activeMode === "Tournament" ? "Four playoff rivals stand between you and the title."
                      : "Your opponent is revealed when your five is locked."}
                  </div>
                </div>
              )}
            </TeamShell>
          </div>

          {/* Ball IQ + Daily side controls */}
          {!team && !result && (
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.textDim, cursor: "pointer", padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(0,0,0,0.25)" }}>
                <input type="checkbox" checked={ballIQ} onChange={(e) => setBallIQ(e.target.checked)} />
                <span>🧠 <b style={{ color: T.text }}>BALL IQ MODE</b> — stats hidden during draft. Test your basketball IQ.</span>
              </label>
              {!isDaily && (
                <button onClick={() => handleNav("Daily")} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.goldBorder}`, background: "rgba(253,185,39,0.07)", color: T.gold, cursor: "pointer", fontSize: 12.5, fontWeight: 800 }}>
                  🏆 DAILY CLASH — {dailyDone ? "done ✓" : "today's challenge is live →"}
                </button>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <SimulationLoading stage={simStage} progress={progress}
              goldLabel="TEAM GOLD" blueLabel={isChallenge ? (challenge.challengerName || "TEAM BLUE").toUpperCase() : "TEAM BLUE"} />
          )}

          {/* Postgame */}
          {result && (
            <ResultView result={result} team={team} feedbackCtx={feedbackCtx}
              onRematch={() => doRematch(result?.tag)}
              onBest7={result.type !== "best7" ? doBest7FromResult : null}
              onChallenge={doShare} onSwap={startSwap} onShare={doShare}
              onLeaderboard={() => handleNav("Daily")} />
          )}
          {result && result.tag === "daily" && <DailyPanel daily={daily} career={career} />}
          {result && (
            <div style={{ display: "flex", gap: 10, marginTop: 12, maxWidth: 700, margin: "12px auto 0" }}>
              <button onClick={() => setSaved((s) => [...s, { id: Date.now(), name: `Squad ${s.length + 1}`, ids: team.map((p) => p.id), rating: teamRating(team) }])}
                style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 800, borderRadius: 9, background: T.bgCardHover, color: T.text, cursor: "pointer", border: `1px solid ${T.border}` }}>💾 Save Squad</button>
              <button onClick={resetPlay} style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 800, borderRadius: 9, background: T.bgCardHover, color: T.text, cursor: "pointer", border: `1px solid ${T.border}` }}>🎲 New Game</button>
            </div>
          )}
        </>
      )}
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
        <button onClick={() => handleNav("Play")} style={{ padding: "13px 30px", fontSize: 14, fontWeight: 900, border: "none", borderRadius: 10, background: T.gold, color: "#111", cursor: "pointer", minHeight: 48 }}>
          BUILD A TEAM →
        </button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`arena ${winnerClass}`} style={{ color: T.text }}>
      <GameHeader nav={nav} onNav={handleNav} dailyStreak={dailyStreak} />

      {err && <div role="alert" style={{ background: "#3a1520", color: "#ff8a9a", padding: 12, textAlign: "center", fontSize: 13 }}>{err}</div>}

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "8px 16px 60px" }}>
        {sharedResult ? (
          <div style={{ maxWidth: 620, margin: "16px auto 0" }}>
            <SharedResultView snap={sharedResult} onPlay={() => {
              const t = sharedResult.teamIds.map((id) => PLAYERS.find((p) => p.id === id));
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
              onLoadTeam={(ids) => { const t = ids.map((id) => PLAYERS.find((p) => p.id === id)); if (!t.some((x) => !x)) { resetPlay(); setNav("Play"); setTeam(t); } }} />
          </div>
        ) : nav === "Board" ? (
          <div style={{ maxWidth: 720, margin: "16px auto 0" }}>
            <Board board={board} streaks={streaks} badges={badges} BADGES={BADGES} />
          </div>
        ) : nav === "Credits" ? (
          <div style={{ maxWidth: 860, margin: "16px auto 0" }}><Credits /></div>
        ) : nav === "Challenges" && !challenge ? (
          <div style={{ marginTop: 16 }}>{challengesHub}</div>
        ) : (
          playView
        )}
      </main>

      {picker && (
        <ManualPicker slotPos={POSITIONS[picker.slot]}
          excludeIds={(picker.forSwap && team ? team : manual).filter(Boolean).map((p) => p.id)}
          onPick={pickManual} onClose={() => setPicker(null)} />
      )}
      {share && <ShareModal share={share} onClose={() => setShare(null)} />}

      <footer style={{ textAlign: "center", padding: 20, fontSize: 10.5, color: T.textDim, borderTop: `1px solid ${T.border}` }}>
        EraClash is an independent fan-made game. Not affiliated with or endorsed by the NBA.
        {" · "}
        <button onClick={() => handleNav("Credits")} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10.5, textDecoration: "underline", padding: 0 }}>
          Image credits
        </button>
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
        <button onClick={onStart} style={{ padding: "13px 30px", fontSize: 14, fontWeight: 900, border: "none", borderRadius: 10, background: T.gold, color: "#111", cursor: "pointer", minHeight: 48 }}>
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
                    background: yz.respin[i] === t ? "rgba(253,185,39,0.1)" : "transparent", color: yz.respin[i] === t ? T.gold : T.textDim,
                  }}>{label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onRoll} disabled={yz.done} style={{ width: "100%", padding: 13, fontSize: 13.5, fontWeight: 900, border: "none", borderRadius: 10, background: yz.done ? T.border : T.gold, color: yz.done ? T.textDim : "#111", cursor: yz.done ? "default" : "pointer", minHeight: 48 }}>
        {yz.done ? "✓ Squad locked" : yz.roll === 3 ? "🎯 Finalize Squad" : `Roll ${yz.roll + 1} →`}
      </button>
    </div>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────
function ResultView({ result, team, feedbackCtx, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard }) {
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
            mode="single" seriesLabel="Season finale" team={team} opp={result.opp} feedbackCtx={feedbackCtx}
            onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge} onSwap={onSwap} onShare={onShare} />
        )}
      </div>
    );
  }
  if (result.type === "single") {
    const pgMode = result.tag === "challenge" ? "challenge" : result.tag === "daily" ? "daily" : "single";
    return <Postgame sim={result.sim} won={result.w} mode={pgMode} team={team} opp={result.opp} feedbackCtx={feedbackCtx}
      onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge} onSwap={onSwap} onShare={onShare} onLeaderboard={onLeaderboard} />;
  }
  if (result.type === "best7") {
    return <Postgame sim={result.sim} won={result.won} mode="best7" seriesLabel="Best of 7" team={team} opp={result.opp} feedbackCtx={feedbackCtx}
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
          <button onClick={onShare} style={{ flex: 1, padding: 13, fontSize: 13, fontWeight: 800, border: "none", borderRadius: 9, background: T.gold, color: "#111", cursor: "pointer" }}>📤 Share the Run</button>
        </div>
      </div>
    );
  }
  return null;
}

// ── Shared result landing (/?r=id) ───────────────────────────────────────────
function SharedResultView({ snap, onPlay }) {
  const team = snap.teamIds.map((id) => PLAYERS.find((p) => p.id === id)).filter(Boolean);
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
        <div style={{ padding: 10, borderRadius: 9, background: "#2b230a", border: `1px solid ${T.gold}`, textAlign: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 10, letterSpacing: 2, color: T.gold, fontWeight: 800 }}>⭐ MVP </span>
          <b>{snap.mvp}</b>{snap.mvpLine && <span style={{ color: T.textDim, fontSize: 12 }}> — {snap.mvpLine}</span>}
        </div>
      )}
      {snap.insight && <p style={{ fontSize: 13, color: T.textDim, textAlign: "center", margin: "0 0 14px" }}>"{snap.insight}"</p>}
      <button onClick={onPlay} style={{ width: "100%", padding: 15, fontSize: 14, fontWeight: 900, border: "none", borderRadius: 10, background: T.gold, color: "#111", cursor: "pointer", minHeight: 48 }}>
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
              const t = r.team.map((id) => PLAYERS.find((p) => p.id === id)).filter(Boolean);
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div style={{ ...card, padding: 22, maxWidth: 480, width: "100%" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share challenge">
        <h2 style={{ margin: "0 0 6px", fontSize: 17 }}>📤 Challenge a Friend</h2>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: T.textDim }}>Anyone who opens this link sees your result and plays <b>against your exact five</b>.</p>
        <textarea readOnly value={share.text} aria-label="Share text" style={{ width: "100%", height: 170, padding: 12, fontSize: 12, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, resize: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={() => { navigator.clipboard.writeText(share.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ flex: 1, padding: 12, fontWeight: 800, fontSize: 13, border: "none", borderRadius: 9, background: T.gold, color: "#111", cursor: "pointer" }}>
            {copied ? "✓ Copied!" : "📋 Copy Challenge"}
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: 12, fontWeight: 800, fontSize: 13, borderRadius: 9, background: "transparent", color: T.text, border: `1px solid ${T.border}`, cursor: "pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}
