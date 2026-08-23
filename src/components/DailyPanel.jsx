// ── Daily Challenge 2.0 panel ──────────────────────────────────────────────────
// Streaks, 7-day history, countdown to the next challenge, and the global
// daily leaderboard (server-backed; hidden gracefully when unavailable).
import { useEffect, useState } from "react";
import { T, card } from "../theme.js";
import { computeDailyStreak } from "../career.js";

const utcDayKey = (d = new Date()) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

// Submit today's official result to the daily leaderboard. Called ONLY after a
// simulation successfully completed — a failed API call never consumes the
// attempt (the server also enforces one entry per uid via SET NX).
export const submitDailyResult = async ({ uid, name, won, margin }) => {
  try {
    const res = await fetch("/api/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", uid, name, date: utcDayKey(), won, margin }),
    });
    if (!res.ok) return null;
    return await res.json(); // {score, rank}
  } catch { return null; }
};

const msToNextLocalMidnight = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
};

function Countdown() {
  const [ms, setMs] = useState(msToNextLocalMidnight());
  useEffect(() => {
    const t = setInterval(() => setMs(msToNextLocalMidnight()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return <span style={{ fontWeight: 800, color: T.gold }}>{h}h {m}m</span>;
}

function History({ daily }) {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = String(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      entry: daily[key],
    });
  }
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "space-between", marginTop: 10 }}>
      {days.map((d, i) => (
        <div key={i} style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 10, color: T.textDim }}>{d.label}</div>
          <div style={{ fontSize: 15, marginTop: 2 }}>
            {d.entry ? (d.entry.won ? "✅" : "❌") : <span style={{ color: T.border }}>—</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DailyPanel({ daily, career }) {
  const [board, setBoard] = useState(null);
  const streak = computeDailyStreak(daily);
  const longest = Math.max(career?.stats?.longestDailyStreak || 0, streak);

  useEffect(() => {
    let alive = true;
    fetch(`/api/daily?date=${utcDayKey()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setBoard(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ ...card, padding: 16, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>📅 DAILY CHALLENGE</div>
        <div style={{ fontSize: 11.5, color: T.textDim }}>Next challenge in <Countdown /></div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1, padding: 10, background: T.bgCardHover, borderRadius: 8, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: T.textDim }}>CURRENT STREAK</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: streak > 0 ? T.gold : T.text }}>{streak > 0 ? `🔥 ${streak}` : "0"}</div>
        </div>
        <div style={{ flex: 1, padding: 10, background: T.bgCardHover, borderRadius: 8, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: T.textDim }}>LONGEST</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{longest}</div>
        </div>
      </div>

      <History daily={daily} />

      {board?.board?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 6 }}>
            🌍 TODAY'S LEADERBOARD {board.count ? `(${board.count} played)` : ""}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {board.board.slice(0, 10).map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", background: i === 0 ? "#2b230a" : T.bgCardHover, borderRadius: 6, fontSize: 12 }}>
                <span><b style={{ color: i === 0 ? T.gold : T.text }}>#{i + 1}</b> <span style={{ marginLeft: 6 }}>{row.name}</span></span>
                <b>{row.score}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
