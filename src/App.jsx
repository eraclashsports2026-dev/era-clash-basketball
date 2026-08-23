import { useState, useEffect, useMemo, useRef } from "react";
import { PLAYERS, DECADE_COLORS, POSITIONS } from "./players.js";
import { displayOVR, analyzeBalance, teamRating } from "./rating.js";
import { attributeInsights, playerArchetypes } from "./attributes.js";
import { T, card } from "./theme.js";
import { mulberry32, simulateGame } from "./engine.js";
import { genPlayer, genRoster, genOpponent, todaySeed, todayKey } from "./draft.js";
import { runSimulation } from "./simClient.js";
import { track, trackSessionStart } from "./analytics.js";
import { installErrorMonitoring } from "./errors.js";
import { getUid, getDisplayName } from "./identity.js";
import {
  loadCareer, recordGame, recordWin82, recordTournamentWin, recordDraft,
  updateDailyStreak, syncCareer,
} from "./career.js";
import { createChallenge, loadChallengeFromUrl, completeChallenge } from "./challengeClient.js";
import { publishResult, shareText } from "./share.js";
import { USE_ENGINE_SEASON } from "./versions.js";
import Postgame from "./components/Postgame.jsx";
import DailyPanel, { submitDailyResult } from "./components/DailyPanel.jsx";
import Profile from "./components/Profile.jsx";

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

// Games started this tab-session (drives second_game_started / games-per-session)
let gamesThisSession = 0;
const noteGameStarted = () => {
  gamesThisSession += 1;
  if (gamesThisSession === 2) track("second_game_started", {});
};

const MODE_TO_ANALYTICS = { Win82: "82", Single: "single", Best7: "best7", Tournament: "tournament", Daily: "daily", Challenge: "challenge" };

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState("Win82");
  const [yz, setYz] = useState(null);              // yahtzee state
  const [ballIQ, setBallIQ] = useState(false);      // hidden stats draft
  const [team, setTeam] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);   // {done, total, wins, label?}
  const [err, setErr] = useState("");
  const [share, setShare] = useState(null);
  const [challenge, setChallenge] = useState(null); // loaded incoming challenge
  const [sharedResult, setSharedResult] = useState(null); // /?r= snapshot view
  const [swap, setSwap] = useState(null);            // {options:[{slot, players}]} flow
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

  // Cloud sync (only once a career is claimed; the claim itself migrates local data)
  useEffect(() => {
    syncCareer(career, { badges, savedTeams: saved.map((t) => ({ name: t.name, ids: t.ids, rating: t.rating })), daily });
  }, [career, badges, saved, daily]);

  // Boot: session analytics, error monitoring, PWA install tracking
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

  // Weekly streak reset
  useEffect(() => {
    const wk = `${new Date().getFullYear()}-W${Math.ceil(((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 864e5 + 1) / 7)}`;
    if (streaks.weekOf !== wk) setStreaks((s) => ({ ...s, thisWeekBest: 0, weekOf: wk }));
  }, []); // eslint-disable-line

  // Incoming links: challenge (?ch= persistent, ?c= legacy) and shared result (?r=)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("c") || params.get("ch")) {
      loadChallengeFromUrl().then((ch) => {
        if (ch) { setChallenge(ch); setMode("Challenge"); }
      });
    } else if (params.get("r")) {
      const id = params.get("r");
      if (/^[a-z0-9]{6,16}$/.test(id)) {
        fetch(`/api/result?id=${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((snap) => { if (snap) setSharedResult(snap); })
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

  // ── Yahtzee builder ────────────────────────────────────────────────────────
  const startBuild = (seeded) => {
    const rng = seeded ? mulberry32(todaySeed()) : Math.random;
    const roster = genRoster(rng);
    setYz({ roll: 1, roster, keep: [false, false, false, false, false], respin: [null, null, null, null, null], done: false, seeded: !!seeded });
    setTeam(null); setResult(null); setProgress(null); setSwap(null);
    track("draft_started", { mode: MODE_TO_ANALYTICS[mode] || mode, ball_iq: ballIQ, seeded: !!seeded });
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

  const doRoll = () => setYz((z) => {
    const rng = z.seeded ? mulberry32(todaySeed() + z.roll * 7919) : Math.random;
    const respins = z.respin.filter(Boolean).length;
    if (respins) track("reroll_used", { roll: z.roll, respins });
    const roster = z.roster.map((p, i) => {
      if (z.keep[i]) return p;
      if (z.respin[i] === "position") return genPlayer(null, rng, { era: p.decade, eliteN: 10 });     // keep era, new position/player
      if (z.respin[i] === "era") return genPlayer(POSITIONS[i], rng, { eliteN: 10 });                 // keep slot position, new era
      return genPlayer(POSITIONS[i], rng, { eliteN: 12 });
    });
    if (z.roll === 3) {
      setTeam(roster);
      if (new Set(roster.map((p) => p.decade)).size === 5) addBadge("all_eras");
      setCareer((c) => recordDraft(c, roster));
      track("draft_completed", { mode: MODE_TO_ANALYTICS[mode] || mode, team_rating: teamRating(roster), chemistry_multiplier: analyzeBalance(roster).multiplier, ball_iq: ballIQ });
      return { ...z, roster, done: true };
    }
    roster.forEach((p, i) => { if (!z.keep[i]) track("player_option_shown", { slot: POSITIONS[i], player_id: p.id, player_era: p.decade, roll: z.roll + 1 }); });
    return { ...z, roll: z.roll + 1, roster, keep: [false, false, false, false, false], respin: [null, null, null, null, null] };
  });

  const abandonDraftIfNeeded = () => {
    if (yz && !yz.done) track("draft_abandoned", { roll: yz.roll });
  };

  // ── Game bookkeeping ───────────────────────────────────────────────────────
  const bookkeepGame = (won, gameMode, score, mvp, vs, opp) => {
    if (won) {
      recordWinStreak();
      if (opp && teamRating(opp) > teamRating(team)) addBadge("giant_slayer");
    } else recordLossStreak();
    setCareer((c) => recordGame(c, { won, mode: gameMode, score, mvp, vs }));
  };

  // ── Simulations ────────────────────────────────────────────────────────────
  const runSingle = async (oppOverride, tag) => {
    if (loading) return;
    setLoading(true); setErr("");
    noteGameStarted();
    const gameMode = tag || "single";
    try {
      const opp = oppOverride || genOpponent();
      lastOppRef.current = opp;
      const sim = await runSimulation(team, opp, "single", { mode: gameMode });
      const w = String(sim.winner || "").toLowerCase().includes("gold");
      bookkeepGame(w, gameMode, sim.seriesResult, sim.mvp, tag === "challenge" ? (challenge?.challengerName || "a friend") : "", opp);

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
        // Official attempt is consumed ONLY here — after a successful, validated sim.
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
    setLoading(true); setErr("");
    noteGameStarted();
    track("best_of_7_started", { from: tag || "menu" });
    try {
      const opp = oppOverride || genOpponent();
      lastOppRef.current = opp;
      const sim = await runSimulation(team, opp, "series7", { mode: "best7" });
      const won = String(sim.winner || "").toLowerCase().includes("gold");
      bookkeepGame(won, "best7", sim.seriesResult, sim.mvp, "", opp);
      setResult({ type: "best7", sim, won, tag, opp });
    } catch (e) { setErr(e.message || "Simulation failed. Please try again."); }
    setLoading(false);
  };

  const runWin82 = async () => {
    if (loading) return;
    setLoading(true); setErr(""); setProgress({ done: 0, total: 82, wins: 0 });
    noteGameStarted();
    let wins = 0, losses = 0;
    try {
      if (USE_ENGINE_SEASON) {
        // Games 1–81: deterministic engine (0 model calls). Game 82: the LLM
        // simulates and narrates the season finale, and its result counts.
        for (let i = 0; i < 81; i++) {
          const opp = genOpponent();
          const g = simulateGame(team, opp);
          const w = g.winner === "Gold";
          if (w) { wins++; recordWinStreak(); } else { losses++; recordLossStreak(); }
          if (i % 3 === 0) {
            setProgress({ done: i + 1, total: 82, wins });
            await new Promise((r) => setTimeout(r, 24)); // let the arena ticker breathe
          }
        }
        setProgress({ done: 81, total: 82, wins, label: "Season finale" });
        const opp = genOpponent();
        lastOppRef.current = opp;
        const sim = await runSimulation(team, opp, "single", { mode: "82" });
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
        // Legacy: every game is a model call (expensive — kept behind the flag).
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
    setLoading(true); setErr("");
    noteGameStarted();
    const roundNames = ["Round 1", "Round 2", "Conference Finals", "Finals"];
    const rounds = [];
    try {
      for (let r = 0; r < 4; r++) {
        const opp = genOpponent();
        setProgress({ done: r + 1, total: 4, wins: rounds.filter((x) => x.advanced).length, label: roundNames[r], unit: "series" });
        const sim = await runSimulation(team, opp, "series7", { mode: "tournament" });
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

  // ── Replay loop actions ────────────────────────────────────────────────────
  const doRematch = (tag) => {
    track(tag === "challenge" ? "challenge_rematch_started" : "rematch_started", {});
    setResult(null);
    runSingle(tag === "challenge" ? challenge?.team : lastOppRef.current, tag);
  };
  const doBest7FromResult = () => { setResult(null); runBest7(lastOppRef.current, "from_result"); };
  const startSwap = () => {
    track("swap_one_started", {});
    setSwap({ slot: null, options: null });
    setResult(null);
  };
  const pickSwapSlot = (i) => {
    const exclude = team.map((p) => p.id);
    const options = [0, 1, 2].map(() => genPlayer(POSITIONS[i], Math.random, { eliteN: 14, excludeIds: exclude }));
    setSwap({ slot: i, options });
  };
  const applySwap = (p) => {
    const next = team.map((x, j) => (j === swap.slot ? p : x));
    setTeam(next);
    setCareer((c) => recordDraft(c, [p]));
    setSwap(null);
  };

  const changeMode = (m) => {
    abandonDraftIfNeeded();
    setMode(m); setYz(null); setTeam(null); setResult(null); setErr(""); setProgress(null); setSwap(null); setSharedResult(null);
  };

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

    // Publish the result page + create a persistent challenge, in parallel.
    const [resultUrl, ch] = await Promise.all([
      result && result.type !== "tournament" ? publishResult(buildSnapshot()) : Promise.resolve(null),
      createChallenge(team, rec),
    ]);
    const url = resultUrl || ch.url;
    const roster = POSITIONS.map((pos, i) => `${pos}: ${team[i].name} (${team[i].decade})`).join("\n");
    const text = `🏀 My EraClash squad went ${rec}\n\n${roster}\n\nTeam Rating: ${teamRating(team)}\n\nThink you can beat my five? Play them here:\n${resultUrl ? `${resultUrl}\n(or take the direct challenge: ${ch.url})` : url}`;
    if (result?.tag === "daily") track("daily_result_shared", {});
    const outcome = await shareText(text, result?.tag === "daily" ? "daily_result" : result?.type || "result");
    if (outcome !== "shared") setShare({ text, url });
  };

  const dailyDone = !!daily[todayKey()];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(1200px 500px at 50% -10%, #1a2650 0%, ${T.bg} 55%)`, color: T.text, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ textAlign: "center", padding: "28px 12px 18px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 3 }}>ERACLASHSPORTS.COM</div>
        <h1 style={{ margin: "6px 0 2px", fontSize: 46, fontWeight: 900, fontStyle: "italic", letterSpacing: -1 }}>
          ERA<span style={{ color: T.gold }}>CLASH</span>
        </h1>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 6, color: T.textDim }}>BASKETBALL</div>
        <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginTop: 6 }}>BUILD YOUR SQUAD • CLASH ACROSS ERAS • WATCH THE SEASON</div>
      </div>

      {err && <div role="alert" style={{ background: "#3a1520", color: "#ff8a9a", padding: 12, textAlign: "center", fontSize: 13 }}>{err}</div>}

      {/* Mode nav */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: 16, flexWrap: "wrap" }}>
        {[
          ["Win82", "🏀 WIN 82"], ["Single", "Single Game"], ["Best7", "Best of 7"],
          ["Tournament", "🏆 Tournament"], ["Daily", `📅 Daily${dailyDone ? " ✓" : ""}`],
          ["Board", "📊 Leaderboard"], ["Profile", "👤 My EraClash"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => changeMode(id)} style={{
            padding: "9px 16px", fontSize: 13, fontWeight: 700, border: `1px solid ${mode === id ? T.gold : T.border}`,
            borderRadius: 8, cursor: "pointer", background: mode === id ? T.gold : "transparent", color: mode === id ? "#111" : T.text,
            minHeight: 40,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 16px 60px", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 620px", minWidth: 0 }}>
          {sharedResult ? (
            <SharedResultView snap={sharedResult}
              onPlay={() => {
                const t = sharedResult.teamIds.map((id) => PLAYERS.find((p) => p.id === id));
                if (!t.some((x) => !x)) {
                  setChallenge({ id: sharedResult.challengeId || null, team: t, record: sharedResult.scoreline, challengerName: sharedResult.name, games: [], rivalry: null });
                  setSharedResult(null); setMode("Challenge");
                  track("challenge_started", { from: "shared_result" });
                }
              }} />
          ) : mode === "Profile" ? (
            <Profile career={career} badges={badges} BADGES={BADGES} saved={saved} daily={daily}
              onLoadTeam={(ids) => { const t = ids.map((id) => PLAYERS.find((p) => p.id === id)); if (!t.some((x) => !x)) { setTeam(t); setResult(null); setMode("Single"); } }} />
          ) : mode === "Board" ? (
            <Board board={board} streaks={streaks} badges={badges} />
          ) : mode === "Challenge" && challenge ? (
            <ChallengeScreen challenge={challenge} team={team} yz={yz} ballIQ={ballIQ} setBallIQ={setBallIQ}
              onStart={() => { track("challenge_started", {}); startBuild(false); }}
              onKeep={toggleKeep} onRespin={setRespin} onRoll={doRoll}
              onRun={() => runSingle(challenge.team, "challenge")}
              onRematch={() => doRematch("challenge")}
              onChallengeOther={doShare}
              result={result} loading={loading} onShare={doShare} />
          ) : swap ? (
            <SwapScreen team={team} swap={swap} onPickSlot={pickSwapSlot} onApply={applySwap} onCancel={() => setSwap(null)} />
          ) : !team ? (
            <Builder yz={yz} ballIQ={ballIQ} setBallIQ={setBallIQ} mode={mode} dailyDone={dailyDone}
              onStart={() => startBuild(mode === "Daily")}
              onKeep={toggleKeep} onRespin={setRespin} onRoll={doRoll} />
          ) : (
            <GameArea mode={mode} team={team} result={result} loading={loading} progress={progress}
              onWin82={runWin82} onSingle={() => runSingle(null, mode === "Daily" ? "daily" : null)}
              onBest7={() => runBest7()} onTournament={runTournament} dailyDone={dailyDone}
              daily={daily} career={career}
              onRematch={() => doRematch(result?.tag)} onBest7FromResult={doBest7FromResult}
              onSwap={startSwap} onLeaderboard={() => changeMode("Daily")}
              onSave={() => setSaved((s) => [...s, { id: Date.now(), name: `Squad ${s.length + 1}`, ids: team.map((p) => p.id), rating: teamRating(team) }])}
              onShare={doShare} onRebuild={() => { abandonDraftIfNeeded(); setTeam(null); setYz(null); setResult(null); }} />
          )}
        </div>

        <Sidebar streaks={streaks} badges={badges} saved={saved}
          onLoad={(ids) => { const t = ids.map((id) => PLAYERS.find((p) => p.id === id)); if (!t.some((x) => !x)) { setTeam(t); setResult(null); } }}
          onDelete={(id) => setSaved((s) => s.filter((x) => x.id !== id))} />
      </div>

      {share && <ShareModal share={share} onClose={() => setShare(null)} />}

      <div style={{ textAlign: "center", padding: 20, fontSize: 10, color: T.textDim, borderTop: `1px solid ${T.border}` }}>
        EraClash is an independent fan-made game. Not affiliated with or endorsed by the NBA.
      </div>
    </div>
  );
}

// ── Player card ──────────────────────────────────────────────────────────────
function PCard({ p, slotPos, hideStats }) {
  const ovr = displayOVR(p, slotPos);
  const arch = playerArchetypes(p.id);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8, background: DECADE_COLORS[p.decade], flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: hideStats ? 18 : 15, color: "#fff",
      }}>{hideStats ? "?" : ovr}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>
          <span style={{ color: DECADE_COLORS[p.decade], fontWeight: 700 }}>{p.decade}</span>
          {" · "}{p.positions.join("/")}{" · "}{p.team}
          {!hideStats && <span> · {p.pts} PTS {p.reb} REB {p.ast} AST</span>}
        </div>
        {!hideStats && arch.length > 0 && (
          <div style={{ fontSize: 10, color: T.gold, marginTop: 1 }}>{arch.slice(0, 2).join(" · ")}</div>
        )}
      </div>
    </div>
  );
}

// ── Balance meter (chemistry v2 + v2.5 style insights) ───────────────────────
function BalanceMeter({ team }) {
  const bal = useMemo(() => analyzeBalance(team), [team]);
  const style = useMemo(() => attributeInsights(team), [team]);
  if (!team || team.filter(Boolean).length < 5) return null;
  return (
    <div style={{ ...card, padding: 14, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 8 }}>
        TEAM CHEMISTRY {bal.multiplier > 1 ? <span style={{ color: T.green }}>+{Math.round((bal.multiplier - 1) * 100)}%</span> : bal.multiplier < 1 ? <span style={{ color: T.red }}>{Math.round((bal.multiplier - 1) * 100)}%</span> : null}
      </div>
      {bal.bonuses.map((b, i) => (
        <div key={i} style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: T.green }}>▲ {b.label}</span> <span style={{ color: T.textDim }}>— {b.detail}</span></div>
      ))}
      {bal.gaps.map((g, i) => (
        <div key={i} style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: T.red }}>▼ {g.label}</span> <span style={{ color: T.textDim }}>— {g.detail}</span></div>
      ))}
      {style.bonuses.map((b, i) => (
        <div key={`s${i}`} style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: T.green }}>▲ {b.label}</span> <span style={{ color: T.textDim }}>— {b.detail}</span></div>
      ))}
      {style.gaps.map((g, i) => (
        <div key={`sg${i}`} style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: T.orange }}>▼ {g.label}</span> <span style={{ color: T.textDim }}>— {g.detail}</span></div>
      ))}
      {bal.bonuses.length === 0 && bal.gaps.length === 0 && style.bonuses.length === 0 && style.gaps.length === 0 &&
        <div style={{ fontSize: 12, color: T.textDim }}>Solid squad — no standout strengths or weaknesses.</div>}
    </div>
  );
}

// ── Builder ──────────────────────────────────────────────────────────────────
function Builder({ yz, ballIQ, setBallIQ, mode, dailyDone, onStart, onKeep, onRespin, onRoll }) {
  if (mode === "Daily" && dailyDone && !yz) {
    return <div style={{ ...card, padding: 36, textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>✅</div>
      <h2 style={{ margin: "10px 0" }}>Today's challenge is done</h2>
      <p style={{ color: T.textDim, fontSize: 14 }}>Come back tomorrow for a new seeded lineup — everyone in the world gets the same rolls.</p>
    </div>;
  }
  if (!yz) {
    return (
      <div style={{ ...card, padding: 36, textAlign: "center" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>🎲 Build Your Squad</h2>
        <p style={{ color: T.textDim, fontSize: 14, margin: "0 0 6px" }}>
          Three rolls, Yahtzee rules. Keep who you love, re-spin the rest by <b>era</b> or <b>player</b>.
        </p>
        {mode === "Daily" && <p style={{ color: T.gold, fontSize: 13 }}>📅 Daily Challenge: seeded rolls — same for every player today. One attempt.</p>}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "14px 0 20px", fontSize: 13, color: T.textDim, cursor: "pointer" }}>
          <input type="checkbox" checked={ballIQ} onChange={(e) => setBallIQ(e.target.checked)} />
          <span>🧠 <b>Ball IQ mode</b> — draft with stats hidden. Trust your knowledge.</span>
        </label>
        <br />
        <button onClick={onStart} style={{ padding: "13px 36px", fontSize: 14, fontWeight: 800, border: "none", borderRadius: 10, background: T.gold, color: "#111", cursor: "pointer", minHeight: 48 }}>
          {mode === "Daily" ? "Start Today's Challenge" : "Start Building"}
        </button>
      </div>
    );
  }
  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Roll {yz.roll} of 3</h2>
        <span style={{ fontSize: 12, color: T.textDim }}>{ballIQ ? "🧠 Ball IQ — stats hidden" : "Stats visible"}</span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: T.textDim }}>
        ✓ Keep a player, or choose a re-spin: <b>Era</b> (same slot, new decade) or <b>Player</b> (same decade, new player).
      </p>
      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        {yz.roster.map((p, i) => (
          <div key={i} style={{ padding: 12, borderRadius: 10, background: yz.keep[i] ? "#12281c" : T.bgCardHover, border: `1px solid ${yz.keep[i] ? T.green : T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.gold, width: 24 }}>{POSITIONS[i]}</span>
              <input type="checkbox" checked={yz.keep[i]} onChange={() => onKeep(i)} aria-label={`Keep ${p.name}`} style={{ width: 17, height: 17, cursor: "pointer" }} />
              <div style={{ flex: 1, minWidth: 0 }}><PCard p={p} slotPos={POSITIONS[i]} hideStats={ballIQ} /></div>
            </div>
            {!yz.keep[i] && !yz.done && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, marginLeft: 34 }}>
                {[["era", "🔁 Re-spin Era"], ["position", "🔁 Re-spin Player"]].map(([t, label]) => (
                  <button key={t} onClick={() => onRespin(i, t)} style={{
                    flex: 1, padding: 7, fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: "pointer", minHeight: 38,
                    border: `1px solid ${yz.respin[i] === t ? T.gold : T.border}`,
                    background: yz.respin[i] === t ? "#2b230a" : "transparent", color: yz.respin[i] === t ? T.gold : T.textDim,
                  }}>{label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onRoll} disabled={yz.done} style={{ width: "100%", padding: 14, fontSize: 14, fontWeight: 800, border: "none", borderRadius: 10, background: yz.done ? T.border : T.gold, color: yz.done ? T.textDim : "#111", cursor: yz.done ? "default" : "pointer", minHeight: 48 }}>
        {yz.done ? "✓ Squad locked" : yz.roll === 3 ? "🎯 Finalize Squad" : `Roll ${yz.roll + 1} →`}
      </button>
    </div>
  );
}

// ── Swap One Player ──────────────────────────────────────────────────────────
function SwapScreen({ team, swap, onPickSlot, onApply, onCancel }) {
  return (
    <div style={{ ...card, padding: 20 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>♻️ Swap One Player</h2>
      {swap.slot === null ? (
        <>
          <p style={{ fontSize: 12.5, color: T.textDim, margin: "0 0 12px" }}>Pick the slot to upgrade — the rest of your five stays.</p>
          <div style={{ display: "grid", gap: 8 }}>
            {POSITIONS.map((pos, i) => (
              <button key={i} onClick={() => onPickSlot(i)} style={{ textAlign: "left", padding: 10, borderRadius: 9, background: T.bgCardHover, border: `1px solid ${T.border}`, cursor: "pointer", color: T.text }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.gold, width: 24 }}>{pos}</span>
                  <div style={{ flex: 1 }}><PCard p={team[i]} slotPos={pos} /></div>
                  <span style={{ color: T.textDim, fontSize: 12 }}>swap →</span>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: T.textDim, margin: "0 0 12px" }}>
            Replacing <b>{team[swap.slot].name}</b> at {POSITIONS[swap.slot]} — pick a new player:
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {swap.options.map((p, i) => (
              <button key={i} onClick={() => onApply(p)} style={{ textAlign: "left", padding: 10, borderRadius: 9, background: T.bgCardHover, border: `1px solid ${T.border}`, cursor: "pointer", color: T.text }}>
                <PCard p={p} slotPos={POSITIONS[swap.slot]} />
              </button>
            ))}
          </div>
        </>
      )}
      <button onClick={onCancel} style={{ width: "100%", marginTop: 12, padding: 10, fontSize: 12, fontWeight: 700, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, cursor: "pointer" }}>Cancel</button>
    </div>
  );
}

// ── Game area ────────────────────────────────────────────────────────────────
function GameArea({ mode, team, result, loading, progress, onWin82, onSingle, onBest7, onTournament, onSave, onShare, onRebuild, dailyDone, daily, career, onRematch, onBest7FromResult, onSwap, onLeaderboard }) {
  const feedbackCtx = result?.sim ? {
    simulation_id: result.sim.simulation_id,
    mode: result.tag || result.type,
    my_team: team.map((p) => p.id),
    opp_team: result.opp ? result.opp.map((p) => p.id) : undefined,
  } : null;

  return (
    <div>
      <TeamPanel team={team} />
      <BalanceMeter team={team} />

      {!result && !loading && (
        <div style={{ marginTop: 14 }}>
          {mode === "Win82" && <Btn onClick={onWin82}>▶ Run the 82-Game Season</Btn>}
          {(mode === "Single" || mode === "Daily") && <Btn onClick={onSingle} disabled={mode === "Daily" && dailyDone}>▶ {mode === "Daily" ? "Play Today's Game" : "Run Game"}</Btn>}
          {mode === "Best7" && <Btn onClick={onBest7}>▶ Run 7-Game Series</Btn>}
          {mode === "Tournament" && <Btn onClick={onTournament}>▶ Start Tournament Run</Btn>}
          <button onClick={onRebuild} style={{ width: "100%", marginTop: 8, padding: 10, fontSize: 12, fontWeight: 700, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, cursor: "pointer" }}>↺ Rebuild squad</button>
        </div>
      )}

      {loading && (
        <div style={{ ...card, padding: 20, marginTop: 14, textAlign: "center" }} aria-live="polite">
          <div style={{ fontSize: 13, color: T.textDim, marginBottom: 8 }}>
            {progress?.label ? `${progress.label} — ` : ""}Simulating{progress ? ` ${progress.unit || "game"} ${progress.done}/${progress.total}` : "…"}
          </div>
          {progress && (
            <>
              <div style={{ height: 8, background: T.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(progress.done / progress.total) * 100}%`, background: T.gold, transition: "width .3s" }} />
              </div>
              <div style={{ fontSize: 12, color: T.gold, marginTop: 8, fontWeight: 700 }}>{progress.wins} wins so far</div>
            </>
          )}
        </div>
      )}

      {result && (
        <ResultView result={result} mode={mode} feedbackCtx={feedbackCtx}
          onRematch={onRematch} onBest7={mode !== "Best7" ? onBest7FromResult : null}
          onChallenge={onShare} onSwap={onSwap} onShare={onShare} onLeaderboard={onLeaderboard} />
      )}

      {mode === "Daily" && (result || dailyDone) && <DailyPanel daily={daily} career={career} />}

      {result && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onSave} style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 800, borderRadius: 9, background: T.bgCardHover, color: T.text, cursor: "pointer", border: `1px solid ${T.border}` }}>💾 Save Squad</button>
          <button onClick={onRebuild} style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 800, borderRadius: 9, background: T.bgCardHover, color: T.text, cursor: "pointer", border: `1px solid ${T.border}` }}>🎲 Run Another Draft</button>
        </div>
      )}
    </div>
  );
}

function TeamPanel({ team }) {
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>YOUR SQUAD</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.gold }}>RATING {teamRating(team)}</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {POSITIONS.map((pos, i) => team[i] && (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.gold, width: 24 }}>{pos}</span>
            <div style={{ flex: 1 }}><PCard p={team[i]} slotPos={pos} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

const Btn = ({ children, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: 15, fontSize: 14, fontWeight: 800, border: "none", borderRadius: 10, background: disabled ? T.border : T.gold, color: disabled ? T.textDim : "#111", cursor: disabled ? "default" : "pointer", minHeight: 48 }}>{children}</button>
);

// ── Results ──────────────────────────────────────────────────────────────────
function ResultView({ result, mode, feedbackCtx, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard }) {
  if (result.type === "82") {
    const pct = ((result.wins / 82) * 100).toFixed(1);
    return (
      <div>
        <div style={{ ...card, padding: 24, marginTop: 14, textAlign: "center" }}>
          <div style={{ fontSize: 12, letterSpacing: 3, color: T.textDim }}>{result.partial ? "PARTIAL " : ""}SEASON RESULT</div>
          <div style={{ fontSize: 52, fontWeight: 900, fontStyle: "italic", color: result.wins === 82 ? T.gold : result.wins > 60 ? T.green : result.wins > 41 ? T.orange : T.red }}>
            {result.wins}–{result.losses}
          </div>
          <div style={{ fontSize: 13, color: T.textDim }}>{result.wins === 82 ? "🏆 PERFECT SEASON" : `${pct}% win rate`}</div>
        </div>
        {result.lastSim && (
          <Postgame sim={result.lastSim} won={String(result.lastSim.winner || "").toLowerCase().includes("gold")}
            mode="single" seriesLabel="Season finale" feedbackCtx={feedbackCtx}
            onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge} onSwap={onSwap} onShare={onShare} />
        )}
      </div>
    );
  }
  if (result.type === "single") {
    const pgMode = result.tag === "challenge" ? "challenge" : result.tag === "daily" ? "daily" : "single";
    return <Postgame sim={result.sim} won={result.w} mode={pgMode} feedbackCtx={feedbackCtx}
      onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge} onSwap={onSwap} onShare={onShare} onLeaderboard={onLeaderboard} />;
  }
  if (result.type === "best7") {
    return <Postgame sim={result.sim} won={result.won} mode="best7" seriesLabel={`Series ${result.sim?.seriesResult || ""}`} feedbackCtx={feedbackCtx}
      onRematch={onRematch} onChallenge={onChallenge} onSwap={onSwap} onShare={onShare} />;
  }
  if (result.type === "tournament") {
    return (
      <div style={{ ...card, padding: 20, marginTop: 14 }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 30, fontWeight: 900, fontStyle: "italic" }}>{result.won ? "🏆 CHAMPION" : "Run Over"}</div>
          {result.won && result.rounds[3]?.sim?.mvp && (
            <div style={{ fontSize: 13, color: T.gold, fontWeight: 700, marginTop: 4 }}>Finals MVP: {result.rounds[3].sim.mvp}</div>
          )}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {result.rounds.map((r, i) => (
            <div key={i} style={{ padding: 12, borderRadius: 9, background: r.advanced ? "#12281c" : "#2d141b", border: `1px solid ${r.advanced ? T.green : T.red}` }}>
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
    <div style={{ ...card, padding: 22, borderColor: T.gold }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: T.gold, fontWeight: 800 }}>SHARED RESULT</div>
        <div style={{ fontSize: 44, fontWeight: 900, fontStyle: "italic", margin: "6px 0", color: snap.won ? T.green : T.red }}>
          {snap.won ? "W" : "L"} {snap.scoreline}
        </div>
        {snap.name && <div style={{ fontSize: 13, color: T.textDim }}>by <b style={{ color: T.text }}>{snap.name}</b></div>}
      </div>
      <div style={{ display: "grid", gap: 6, margin: "16px 0" }}>
        {POSITIONS.map((pos, i) => team[i] && (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.gold, width: 24 }}>{pos}</span>
            <div style={{ flex: 1 }}><PCard p={team[i]} slotPos={pos} /></div>
          </div>
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

// ── Challenge screen ─────────────────────────────────────────────────────────
function ChallengeScreen({ challenge, team, yz, ballIQ, setBallIQ, onStart, onKeep, onRespin, onRoll, onRun, onRematch, onChallengeOther, result, loading, onShare }) {
  const who = challenge.challengerName || "A rival";
  const rivalry = challenge.rivalry && (challenge.rivalry.challenger + challenge.rivalry.opponent > 0) ? challenge.rivalry : null;
  const feedbackCtx = result?.sim ? {
    simulation_id: result.sim.simulation_id, mode: "challenge",
    my_team: (team || []).map((p) => p.id), opp_team: challenge.team.map((p) => p.id),
  } : null;
  return (
    <div>
      <div style={{ ...card, padding: 18, marginBottom: 14, borderColor: T.gold }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: T.gold, fontWeight: 900 }}>🎯 YOU'VE BEEN CHALLENGED</div>
        <div style={{ fontSize: 13.5, color: T.text, margin: "8px 0 10px", fontWeight: 600 }}>
          {who} thinks this team can beat anything you build{challenge.record ? ` — they went ${challenge.record} with it` : ""}.
        </div>
        {rivalry && (
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10, padding: "6px 10px", background: T.bgCardHover, borderRadius: 8, display: "inline-block" }}>
            🥊 Rivalry so far: <b style={{ color: T.text }}>{who} {rivalry.challenger} — {rivalry.opponent} You</b>
          </div>
        )}
        <div style={{ display: "grid", gap: 6 }}>
          {POSITIONS.map((pos, i) => challenge.team[i] && (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.gold, width: 24 }}>{pos}</span>
              <div style={{ flex: 1 }}><PCard p={challenge.team[i]} slotPos={pos} /></div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 10, textAlign: "right" }}>Their rating: <b style={{ color: T.gold }}>{teamRating(challenge.team)}</b></div>
      </div>

      {!team ? (
        <div>
          {!yz && <div style={{ textAlign: "center", margin: "0 0 12px", fontSize: 15, fontWeight: 900, letterSpacing: 2, color: T.text }}>BUILD YOUR TEAM ↓</div>}
          <Builder yz={yz} ballIQ={ballIQ} setBallIQ={setBallIQ} mode="Challenge" dailyDone={false} onStart={onStart} onKeep={onKeep} onRespin={onRespin} onRoll={onRoll} />
        </div>
      ) : (
        <div>
          <TeamPanel team={team} />
          <BalanceMeter team={team} />
          {!result && !loading && <div style={{ marginTop: 14 }}><Btn onClick={onRun}>⚔️ Play Their Five</Btn></div>}
          {loading && <div style={{ ...card, padding: 20, marginTop: 14, textAlign: "center", color: T.textDim, fontSize: 13 }}>Simulating the grudge match…</div>}
          {result?.sim && (
            <Postgame sim={result.sim} won={result.w} mode="challenge" feedbackCtx={feedbackCtx}
              onRematch={onRematch} onChallenge={onChallengeOther} onShare={onShare} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
function Board({ board, streaks, badges }) {
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
          <Stat label="Current streak" v={streaks.current} hot={streaks.current > 0} />
          <Stat label="Personal best" v={streaks.personalBest} />
          <Stat label="This week" v={streaks.thisWeekBest} />
          <Stat label="Badges" v={badges.length} />
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

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ streaks, badges, saved, onLoad, onDelete }) {
  return (
    <div style={{ flex: "0 1 290px", display: "flex", flexDirection: "column", gap: 14, minWidth: 250 }}>
      <div style={{ ...card, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 8 }}>🔥 STREAKS</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Stat label="Now" v={streaks.current} hot={streaks.current > 0} />
          <Stat label="Best" v={streaks.personalBest} />
          <Stat label="Week" v={streaks.thisWeekBest} />
        </div>
      </div>
      <div style={{ ...card, padding: 14, maxHeight: 260, overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 8 }}>🏅 BADGES ({badges.length}/{Object.keys(BADGES).length})</div>
        {Object.entries(BADGES).map(([k, b]) => (
          <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", opacity: badges.includes(k) ? 1 : 0.3, fontSize: 12 }}>
            <span>{b.icon}</span><b>{b.name}</b><span style={{ color: T.textDim, fontSize: 11 }}>· {b.desc}</span>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: 14, maxHeight: 220, overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 8 }}>💾 SAVED SQUADS ({saved.length})</div>
        {saved.length === 0 && <div style={{ fontSize: 12, color: T.textDim }}>Save a squad after a run to reuse it.</div>}
        {saved.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 12 }}>
            <button onClick={() => onLoad(s.ids)} style={{ background: "none", border: "none", color: T.text, cursor: "pointer", fontWeight: 700, textAlign: "left", padding: 0 }}>
              {s.name} <span style={{ color: T.gold }}>({s.rating})</span>
            </button>
            <button onClick={() => onDelete(s.id)} aria-label={`Delete ${s.name}`} style={{ background: "none", border: "none", color: T.red, cursor: "pointer" }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Share modal ──────────────────────────────────────────────────────────────
function ShareModal({ share, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
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
