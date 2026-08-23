import { useState, useEffect, useMemo } from "react";
import { PLAYERS, DECADE_COLORS, POSITIONS, ERAS } from "./players.js";
import { slotRating, displayOVR, analyzeBalance, teamRating } from "./rating.js";

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: "#0b0e17",
  bgCard: "#141a2a",
  bgCardHover: "#1a2136",
  border: "#232c45",
  gold: "#fdb927",
  text: "#e8eaf2",
  textDim: "#8a93ad",
  green: "#2ecc71",
  red: "#e74c3c",
  orange: "#f39c12",
};

const card = { backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px" };

// ── Seeded RNG (daily challenge) ─────────────────────────────────────────────
const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const todaySeed = () => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};
const todayKey = () => String(todaySeed());

// ── Player generation (variety-guarded) ──────────────────────────────────────
const recentIds = new Set();
const rememberPick = (p) => {
  recentIds.add(p.id);
  if (recentIds.size > 40) recentIds.delete(recentIds.values().next().value);
};

const genPlayer = (slotPos = null, rng = Math.random, opts = {}) => {
  let pool = PLAYERS;
  if (slotPos) pool = pool.filter((p) => p.positions.includes(slotPos));
  if (opts.era) pool = pool.filter((p) => p.decade === opts.era);
  if (pool.length === 0) pool = PLAYERS;
  const sorted = [...pool].sort((a, b) => slotRating(b, slotPos || b.pos) - slotRating(a, slotPos || a.pos));
  const eliteN = Math.min(opts.eliteN || 10, sorted.length);
  // variety guard: prefer players not recently seen
  const fresh = sorted.slice(0, eliteN).filter((p) => !recentIds.has(p.id));
  const pickFrom = fresh.length >= 3 ? fresh : sorted.slice(0, eliteN);
  const pick = pickFrom[Math.floor(rng() * pickFrom.length)];
  rememberPick(pick);
  return pick;
};

const genRoster = (rng = Math.random) => POSITIONS.map((pos) => genPlayer(pos, rng, { eliteN: 12 }));
const genOpponent = (rng = Math.random) => POSITIONS.map((pos) => genPlayer(pos, rng, { eliteN: 8 }));

// ── Challenge links ──────────────────────────────────────────────────────────
const encodeChallenge = (team, record) => {
  const ids = team.map((p) => p.id).join(",");
  return btoa(`${ids}|${record || ""}`).replace(/=+$/, "");
};
const decodeChallenge = (code) => {
  try {
    const [ids, record] = atob(code).split("|");
    const team = ids.split(",").map((id) => PLAYERS.find((p) => p.id === id));
    if (team.some((p) => !p) || team.length !== 5) return null;
    return { team, record };
  } catch { return null; }
};

// ── Badges ───────────────────────────────────────────────────────────────────
const BADGES = {
  perfect_82: { name: "Perfect Season", icon: "🏆", desc: "82-0" },
  tournament_champion: { name: "Champion", icon: "👑", desc: "Won the Tournament" },
  all_eras: { name: "Time Traveler", icon: "⏰", desc: "5 different eras in one lineup" },
  giant_slayer: { name: "Giant Slayer", icon: "⚡", desc: "Beat a higher-rated opponent" },
  win_streak_5: { name: "On Fire", icon: "🔥", desc: "5-game win streak" },
  win_streak_10: { name: "Unstoppable", icon: "🌟", desc: "10-game win streak" },
  daily_done: { name: "Daily Grinder", icon: "📅", desc: "Completed a Daily Challenge" },
  challenge_win: { name: "Called Shot", icon: "🎯", desc: "Won a friend challenge" },
  balanced_60: { name: "Architect", icon: "🏗️", desc: "60+ wins with zero balance gaps" },
};

const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

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
  const [challenge, setChallenge] = useState(null); // decoded incoming challenge

  const [saved, setSaved] = useState(() => ls("ec_saved", []));
  const [streaks, setStreaks] = useState(() => ls("ec_streaks", { current: 0, personalBest: 0, thisWeekBest: 0, weekOf: "" }));
  const [badges, setBadges] = useState(() => ls("ec_badges", []));
  const [board, setBoard] = useState(() => ls("ec_board", []));
  const [daily, setDaily] = useState(() => ls("ec_daily", {}));

  useEffect(() => localStorage.setItem("ec_saved", JSON.stringify(saved)), [saved]);
  useEffect(() => localStorage.setItem("ec_streaks", JSON.stringify(streaks)), [streaks]);
  useEffect(() => localStorage.setItem("ec_badges", JSON.stringify(badges)), [badges]);
  useEffect(() => localStorage.setItem("ec_board", JSON.stringify(board)), [board]);
  useEffect(() => localStorage.setItem("ec_daily", JSON.stringify(daily)), [daily]);

  // Weekly streak reset
  useEffect(() => {
    const wk = `${new Date().getFullYear()}-W${Math.ceil(((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 864e5 + 1) / 7)}`;
    if (streaks.weekOf !== wk) setStreaks((s) => ({ ...s, thisWeekBest: 0, weekOf: wk }));
  }, []); // eslint-disable-line

  // Incoming challenge link
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) {
      const dec = decodeChallenge(c);
      if (dec) { setChallenge(dec); setMode("Challenge"); }
    }
  }, []);

  const addBadge = (k) => setBadges((b) => (b.includes(k) ? b : [...b, k]));

  const recordWin = () => setStreaks((s) => {
    const cur = s.current + 1;
    if (cur >= 5) addBadge("win_streak_5");
    if (cur >= 10) addBadge("win_streak_10");
    return { ...s, current: cur, personalBest: Math.max(s.personalBest, cur), thisWeekBest: Math.max(s.thisWeekBest, cur) };
  });
  const recordLoss = () => setStreaks((s) => ({ ...s, current: 0 }));

  // ── Yahtzee builder ────────────────────────────────────────────────────────
  const startBuild = (seeded) => {
    const rng = seeded ? mulberry32(todaySeed()) : Math.random;
    setYz({ roll: 1, roster: genRoster(rng), keep: [false, false, false, false, false], respin: [null, null, null, null, null], done: false, seeded: !!seeded });
    setTeam(null); setResult(null); setProgress(null);
  };

  const toggleKeep = (i) => setYz((z) => ({ ...z, keep: z.keep.map((v, j) => (j === i ? !v : v)), respin: z.keep[i] ? z.respin : z.respin.map((r, j) => (j === i ? null : r)) }));
  const setRespin = (i, type) => setYz((z) => ({ ...z, respin: z.respin.map((r, j) => (j === i ? type : r)) }));

  const doRoll = () => setYz((z) => {
    const rng = z.seeded ? mulberry32(todaySeed() + z.roll * 7919) : Math.random;
    const roster = z.roster.map((p, i) => {
      if (z.keep[i]) return p;
      if (z.respin[i] === "position") return genPlayer(null, rng, { era: p.decade, eliteN: 10 });     // keep era, new position/player
      if (z.respin[i] === "era") return genPlayer(POSITIONS[i], rng, { eliteN: 10 });                 // keep slot position, new era
      return genPlayer(POSITIONS[i], rng, { eliteN: 12 });
    });
    if (z.roll === 3) {
      setTeam(roster);
      if (new Set(roster.map((p) => p.decade)).size === 5) addBadge("all_eras");
      return { ...z, roster, done: true };
    }
    return { ...z, roll: z.roll + 1, roster, keep: [false, false, false, false, false], respin: [null, null, null, null, null] };
  });

  // ── Simulation ─────────────────────────────────────────────────────────────
  // API returns model text containing a JSON object: {winner:"Gold"|"Blue",
  // seriesResult, teamAStats, teamBStats, summary, strengths/weaknesses, mvp, mvpReason}
  const simulate = async (myTeam, oppTeam, seriesType) => {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myTeam: myTeam.filter(Boolean), oppTeam: oppTeam.filter(Boolean), seriesType }),
    });
    if (!res.ok) throw new Error("sim failed");
    const raw = (await res.json()).text || "";
    const cleaned = raw.replace(/```json|```/g, "");
    const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("bad sim output");
    return JSON.parse(cleaned.slice(start, end + 1));
  };

  const isWin = (sim) => String(sim.winner || "").toLowerCase().includes("gold");

  const runWin82 = async () => {
    setLoading(true); setErr(""); setProgress({ done: 0, total: 82, wins: 0 });
    let wins = 0, losses = 0; const games = [];
    try {
      let lastSim = null;
      for (let i = 0; i < 82; i++) {
        const opp = genOpponent();
        const sim = await simulate(team, opp, "single");
        const w = isWin(sim);
        if (w) { wins++; recordWin(); } else { losses++; recordLoss(); }
        games.push({ w });
        lastSim = sim;
        setProgress({ done: i + 1, total: 82, wins });
      }
      if (wins === 82) addBadge("perfect_82");
      const bal = analyzeBalance(team);
      if (wins >= 60 && bal.gaps.length === 0) addBadge("balanced_60");
      setBoard((b) => [...b, { wins, team: team.map((p) => p.id), ts: Date.now() }].sort((a, c) => c.wins - a.wins).slice(0, 10));
      setResult({ type: "82", wins, losses, lastSim });
    } catch {
      setErr("Simulation interrupted — partial season shown.");
      if (games.length) setResult({ type: "82", wins, losses, partial: true });
    }
    setLoading(false); setProgress(null);
  };

  const runSingle = async (oppOverride, tag) => {
    setLoading(true); setErr("");
    try {
      const opp = oppOverride || genOpponent();
      const sim = await simulate(team, opp, "single");
      const w = isWin(sim);
      if (w) {
        recordWin();
        if (teamRating(opp) > teamRating(team)) addBadge("giant_slayer");
        if (tag === "challenge") addBadge("challenge_win");
      } else recordLoss();
      if (tag === "daily") { setDaily((d) => ({ ...d, [todayKey()]: { won: w } })); addBadge("daily_done"); }
      setResult({ type: "single", sim, w, tag });
    } catch { setErr("Simulation failed. Please try again."); }
    setLoading(false);
  };

  const runBest7 = async () => {
    setLoading(true); setErr("");
    try {
      const opp = genOpponent();
      const sim = await simulate(team, opp, "series7");
      const won = isWin(sim);
      if (won) recordWin(); else recordLoss();
      if (won && teamRating(opp) > teamRating(team)) addBadge("giant_slayer");
      setResult({ type: "best7", sim, won });
    } catch { setErr("Simulation failed. Please try again."); }
    setLoading(false);
  };

  const runTournament = async () => {
    setLoading(true); setErr("");
    const roundNames = ["Round 1", "Round 2", "Conference Finals", "Finals"];
    const rounds = [];
    try {
      for (let r = 0; r < 4; r++) {
        const opp = genOpponent();
        setProgress({ done: r + 1, total: 4, wins: rounds.filter((x) => x.advanced).length, label: roundNames[r], unit: "series" });
        const sim = await simulate(team, opp, "series7");
        const advanced = isWin(sim);
        if (advanced) recordWin(); else recordLoss();
        rounds.push({ name: roundNames[r], opp, sim, advanced });
        if (!advanced) break;
      }
      const won = rounds.length === 4 && rounds[3].advanced;
      if (won) addBadge("tournament_champion");
      setResult({ type: "tournament", rounds, won });
    } catch {
      setErr("Simulation failed mid-tournament.");
      if (rounds.length) setResult({ type: "tournament", rounds, won: false, partial: true });
    }
    setLoading(false); setProgress(null);
  };

  const changeMode = (m) => { setMode(m); setYz(null); setTeam(null); setResult(null); setErr(""); setProgress(null); };

  // ── Share ──────────────────────────────────────────────────────────────────
  const doShare = async () => {
    const rec = result?.type === "82" ? `${result.wins}-${result.losses}`
      : result?.type === "best7" ? `${result.uw}-${result.ow}`
      : result?.type === "tournament" ? (result.won ? "CHAMPION" : "eliminated")
      : result?.w ? "W" : "L";
    const url = `${window.location.origin}/?c=${encodeChallenge(team, rec)}`;
    const roster = POSITIONS.map((pos, i) => `${pos}: ${team[i].name} (${team[i].decade})`).join("\n");
    const text = `🏀 My EraClash squad went ${rec}\n\n${roster}\n\nTeam Rating: ${teamRating(team)}\n\nThink you can beat my five? Play them here:\n${url}`;
    if (navigator.share) { try { await navigator.share({ title: "EraClash Basketball", text }); return; } catch { /* fall through */ } }
    setShare({ text, url });
  };

  const dailyDone = !!daily[todayKey()];

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

      {err && <div style={{ background: "#3a1520", color: "#ff8a9a", padding: 12, textAlign: "center", fontSize: 13 }}>{err}</div>}

      {/* Mode nav */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: 16, flexWrap: "wrap" }}>
        {[
          ["Win82", "🏀 WIN 82"], ["Single", "Single Game"], ["Best7", "Best of 7"],
          ["Tournament", "🏆 Tournament"], ["Daily", `📅 Daily${dailyDone ? " ✓" : ""}`], ["Board", "📊 Leaderboard"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => changeMode(id)} style={{
            padding: "9px 16px", fontSize: 13, fontWeight: 700, border: `1px solid ${mode === id ? T.gold : T.border}`,
            borderRadius: 8, cursor: "pointer", background: mode === id ? T.gold : "transparent", color: mode === id ? "#111" : T.text,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 16px 60px", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 620px", minWidth: 0 }}>
          {mode === "Board" ? (
            <Board board={board} streaks={streaks} badges={badges} />
          ) : mode === "Challenge" && challenge ? (
            <ChallengeScreen challenge={challenge} team={team} yz={yz} ballIQ={ballIQ} setBallIQ={setBallIQ}
              onStart={() => startBuild(false)} onKeep={toggleKeep} onRespin={setRespin} onRoll={doRoll}
              onRun={() => runSingle(challenge.team, "challenge")} result={result} loading={loading} onShare={doShare} />
          ) : !team ? (
            <Builder yz={yz} ballIQ={ballIQ} setBallIQ={setBallIQ} mode={mode} dailyDone={dailyDone}
              onStart={() => startBuild(mode === "Daily")}
              onKeep={toggleKeep} onRespin={setRespin} onRoll={doRoll} />
          ) : (
            <GameArea mode={mode} team={team} result={result} loading={loading} progress={progress}
              onWin82={runWin82} onSingle={() => runSingle(null, mode === "Daily" ? "daily" : null)}
              onBest7={runBest7} onTournament={runTournament} dailyDone={dailyDone}
              onSave={() => setSaved((s) => [...s, { id: Date.now(), name: `Squad ${s.length + 1}`, ids: team.map((p) => p.id), rating: teamRating(team) }])}
              onShare={doShare} onRebuild={() => { setTeam(null); setYz(null); setResult(null); }} />
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
      </div>
    </div>
  );
}

// ── Balance meter ────────────────────────────────────────────────────────────
function BalanceMeter({ team }) {
  const bal = useMemo(() => analyzeBalance(team), [team]);
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
      {bal.bonuses.length === 0 && bal.gaps.length === 0 && <div style={{ fontSize: 12, color: T.textDim }}>Solid squad — no standout strengths or weaknesses.</div>}
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
        <button onClick={onStart} style={{ padding: "13px 36px", fontSize: 14, fontWeight: 800, border: "none", borderRadius: 10, background: T.gold, color: "#111", cursor: "pointer" }}>
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
              <input type="checkbox" checked={yz.keep[i]} onChange={() => onKeep(i)} style={{ width: 17, height: 17, cursor: "pointer" }} />
              <div style={{ flex: 1, minWidth: 0 }}><PCard p={p} slotPos={POSITIONS[i]} hideStats={ballIQ} /></div>
            </div>
            {!yz.keep[i] && !yz.done && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, marginLeft: 34 }}>
                {[["era", "🔁 Re-spin Era"], ["position", "🔁 Re-spin Player"]].map(([t, label]) => (
                  <button key={t} onClick={() => onRespin(i, t)} style={{
                    flex: 1, padding: 7, fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: "pointer",
                    border: `1px solid ${yz.respin[i] === t ? T.gold : T.border}`,
                    background: yz.respin[i] === t ? "#2b230a" : "transparent", color: yz.respin[i] === t ? T.gold : T.textDim,
                  }}>{label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onRoll} disabled={yz.done} style={{ width: "100%", padding: 14, fontSize: 14, fontWeight: 800, border: "none", borderRadius: 10, background: yz.done ? T.border : T.gold, color: yz.done ? T.textDim : "#111", cursor: yz.done ? "default" : "pointer" }}>
        {yz.done ? "✓ Squad locked" : yz.roll === 3 ? "🎯 Finalize Squad" : `Roll ${yz.roll + 1} →`}
      </button>
    </div>
  );
}

// ── Game area ────────────────────────────────────────────────────────────────
function GameArea({ mode, team, result, loading, progress, onWin82, onSingle, onBest7, onTournament, onSave, onShare, onRebuild, dailyDone }) {
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
        <div style={{ ...card, padding: 20, marginTop: 14, textAlign: "center" }}>
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

      {result && <ResultView result={result} />}

      {result && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onSave} style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 800, borderRadius: 9, background: T.bgCardHover, color: T.text, cursor: "pointer", border: `1px solid ${T.border}` }}>💾 Save Squad</button>
          <button onClick={onShare} style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 800, border: "none", borderRadius: 9, background: T.gold, color: "#111", cursor: "pointer" }}>📤 Challenge a Friend</button>
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
  <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: 15, fontSize: 14, fontWeight: 800, border: "none", borderRadius: 10, background: disabled ? T.border : T.gold, color: disabled ? T.textDim : "#111", cursor: disabled ? "default" : "pointer" }}>{children}</button>
);

// ── Results ──────────────────────────────────────────────────────────────────
function BoxTable({ label, stats, color }) {
  if (!Array.isArray(stats) || !stats.length) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color, marginBottom: 4 }}>{label}</div>
      <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: T.textDim, textAlign: "right" }}>
            <th style={{ textAlign: "left", padding: "3px 4px" }}>PLAYER</th>
            <th style={{ padding: "3px 4px" }}>PTS</th><th style={{ padding: "3px 4px" }}>REB</th>
            <th style={{ padding: "3px 4px" }}>AST</th><th style={{ padding: "3px 4px" }}>STL</th><th style={{ padding: "3px 4px" }}>BLK</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${T.border}`, textAlign: "right" }}>
              <td style={{ textAlign: "left", padding: "4px", fontWeight: 600 }}>{s.name}</td>
              <td style={{ padding: "4px", fontWeight: 800 }}>{s.pts}</td><td style={{ padding: "4px" }}>{s.reb}</td>
              <td style={{ padding: "4px" }}>{s.ast}</td><td style={{ padding: "4px" }}>{s.stl}</td><td style={{ padding: "4px" }}>{s.blk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chips({ items, color }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      {items.map((s, i) => (
        <span key={i} style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 20, border: `1px solid ${color}`, color }}>{s}</span>
      ))}
    </div>
  );
}

function SimRecap({ sim, won, headline }) {
  return (
    <div style={{ ...card, padding: 18, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: won ? T.green : T.red }}>{headline}</div>
        <div style={{ fontWeight: 900, fontSize: 20, fontStyle: "italic" }}>{sim.seriesResult}</div>
      </div>
      {sim.summary && <p style={{ fontSize: 13, lineHeight: 1.6, color: T.text, margin: "10px 0" }}>{sim.summary}</p>}
      {sim.mvp && (
        <div style={{ padding: 12, borderRadius: 9, background: "#2b230a", border: `1px solid ${T.gold}`, margin: "10px 0" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: T.gold, fontWeight: 800 }}>⭐ MVP</div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{sim.mvp}</div>
          {sim.mvpReason && <div style={{ fontSize: 12, color: T.textDim }}>{sim.mvpReason}</div>}
        </div>
      )}
      <details>
        <summary style={{ cursor: "pointer", fontSize: 12, color: T.textDim, fontWeight: 700 }}>📋 Box score & analyst breakdown</summary>
        <BoxTable label="TEAM GOLD (YOU)" stats={sim.teamAStats} color={T.gold} />
        <Chips items={sim.teamAStrengths} color={T.green} />
        <Chips items={sim.teamAWeaknesses} color={T.red} />
        <BoxTable label="TEAM BLUE (OPPONENT)" stats={sim.teamBStats} color="#6ea8fe" />
        <Chips items={sim.teamBStrengths} color={T.green} />
        <Chips items={sim.teamBWeaknesses} color={T.red} />
      </details>
    </div>
  );
}

function ResultView({ result }) {
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
        {result.lastSim && <SimRecap sim={result.lastSim} won={String(result.lastSim.winner || "").toLowerCase().includes("gold")} headline="Season finale recap" />}
      </div>
    );
  }
  if (result.type === "single") {
    const headline = (result.w ? "✓ VICTORY" : "✗ DEFEAT") + (result.tag === "challenge" ? " — Friend Challenge" : result.tag === "daily" ? " — Daily Challenge" : "");
    return <SimRecap sim={result.sim} won={result.w} headline={headline} />;
  }
  if (result.type === "best7") {
    return <SimRecap sim={result.sim} won={result.won} headline={result.won ? "✓ SERIES WIN" : "✗ SERIES LOSS"} />;
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
      </div>
    );
  }
  return null;
}

// ── Challenge screen ─────────────────────────────────────────────────────────
function ChallengeScreen({ challenge, team, yz, ballIQ, setBallIQ, onStart, onKeep, onRespin, onRoll, onRun, result, loading, onShare }) {
  return (
    <div>
      <div style={{ ...card, padding: 18, marginBottom: 14, borderColor: T.gold }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: T.gold, fontWeight: 800, marginBottom: 8 }}>🎯 YOU'VE BEEN CHALLENGED</div>
        <div style={{ fontSize: 13, color: T.textDim, marginBottom: 10 }}>
          A friend sent you their squad{challenge.record ? ` (they went ${challenge.record})` : ""}. Build your five and beat them head-to-head.
        </div>
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
        <Builder yz={yz} ballIQ={ballIQ} setBallIQ={setBallIQ} mode="Challenge" dailyDone={false} onStart={onStart} onKeep={onKeep} onRespin={onRespin} onRoll={onRoll} />
      ) : (
        <div>
          <TeamPanel team={team} />
          <BalanceMeter team={team} />
          {!result && !loading && <div style={{ marginTop: 14 }}><Btn onClick={onRun}>⚔️ Play Their Five</Btn></div>}
          {loading && <div style={{ ...card, padding: 20, marginTop: 14, textAlign: "center", color: T.textDim, fontSize: 13 }}>Simulating the grudge match…</div>}
          {result && <ResultView result={result} />}
          {result && <div style={{ marginTop: 12 }}><Btn onClick={onShare}>📤 Send Your Result Back</Btn></div>}
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
            <button onClick={() => onDelete(s.id)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer" }}>✕</button>
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
      <div style={{ ...card, padding: 22, maxWidth: 480, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 6px", fontSize: 17 }}>📤 Challenge a Friend</h2>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: T.textDim }}>Anyone who opens this link plays <b>against your exact five</b>.</p>
        <textarea readOnly value={share.text} style={{ width: "100%", height: 170, padding: 12, fontSize: 12, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, resize: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
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
