// ── ERAClash POSTGAME ──────────────────────────────────────────────────────────
// The signature end-of-broadcast experience. Every number here comes from the
// structured result (validated model output + deterministic engine data) —
// nothing is invented for aesthetics. Never a dead end: contextual CTAs lead
// back into another game or a share.
import { useState } from "react";
import { T, card } from "../theme.js";
import { Feedback } from "./Feedback.jsx";

const goldWon = (sim) => String(sim?.winner || "").toLowerCase().includes("gold");

const finalScores = (sim) => {
  // single game: "108-101" in winner-first order per prompt; normalize to gold/blue
  const m = String(sim?.seriesResult || "").match(/^(\d{2,3})\s*-\s*(\d{2,3})$/);
  if (!m) return null;
  const [hi, lo] = [Number(m[1]), Number(m[2])];
  return goldWon(sim) ? { gold: Math.max(hi, lo), blue: Math.min(hi, lo) } : { gold: Math.min(hi, lo), blue: Math.max(hi, lo) };
};

const mvpLineFromBox = (sim) => {
  const box = [...(sim.teamAStats || []), ...(sim.teamBStats || [])];
  const row = box.find((r) => sim.mvp && r.name && sim.mvp.toLowerCase().includes(r.name.split(" ").slice(-1)[0].toLowerCase()));
  return row ? `${row.pts} PTS · ${row.reb} REB · ${row.ast} AST` : null;
};

// ── Final score header ─────────────────────────────────────────────────────────
function FinalHeader({ sim, won, mode, seriesLabel }) {
  const scores = finalScores(sim);
  const isSeries = /^\d-\d$/.test(String(sim.seriesResult || ""));
  return (
    <div style={{ textAlign: "center", padding: "22px 12px 16px" }}>
      <div style={{ fontSize: 11, letterSpacing: 4, color: T.textDim, fontWeight: 800 }}>
        {mode === "daily" ? "DAILY CHALLENGE " : mode === "challenge" ? "GRUDGE MATCH " : ""}FINAL{seriesLabel ? ` — ${seriesLabel}` : ""}
      </div>
      {scores && !isSeries ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 22, marginTop: 8 }}>
          <ScoreSide label="YOU" score={scores.gold} win={won} color={T.gold} />
          <span style={{ fontSize: 16, color: T.textDim, fontWeight: 700 }}>–</span>
          <ScoreSide label="THEM" score={scores.blue} win={!won} color={T.blue} />
        </div>
      ) : (
        <div style={{ fontSize: 54, fontWeight: 900, fontStyle: "italic", marginTop: 4, color: won ? T.green : T.red }}>
          {sim.seriesResult || (won ? "W" : "L")}
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: 15, fontWeight: 900, letterSpacing: 2, color: won ? T.green : T.red }}>
        {won ? "✓ YOU WON" : "✗ YOU LOST"}
      </div>
    </div>
  );
}
const ScoreSide = ({ label, score, win, color }) => (
  <div>
    <div style={{ fontSize: 10, letterSpacing: 2, color, fontWeight: 800 }}>{label}</div>
    <div style={{ fontSize: 54, fontWeight: 900, fontStyle: "italic", color: win ? T.text : T.textDim, lineHeight: 1 }}>{score}</div>
  </div>
);

// ── Matchup edge bars (real engine numbers) ────────────────────────────────────
function EdgeBars({ edges }) {
  const shown = (edges || []).filter((e) => e.edge !== 0).slice(0, 4);
  if (!shown.length) return null;
  return (
    <div style={{ ...card, padding: 16, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>MATCHUP EDGES</div>
      {shown.map((e) => {
        const yours = e.edge > 0;
        const w = Math.min(100, Math.abs(e.edge) * 5);
        return (
          <div key={e.category} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ fontWeight: 700 }}>{e.category}</span>
              <span style={{ fontWeight: 900, color: yours ? T.green : T.red }}>{yours ? "+" : ""}{e.edge}</span>
            </div>
            <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: "hidden", display: "flex", justifyContent: yours ? "flex-start" : "flex-end" }}>
              <div style={{ width: `${w}%`, background: yours ? T.green : T.red, borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>Computed from player data, ratings & chemistry — positive is your edge.</div>
    </div>
  );
}

function BoxTable({ label, stats, color }) {
  if (!Array.isArray(stats) || !stats.length) return null;
  return (
    <div style={{ marginTop: 10, overflowX: "auto" }}>
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

// ── Contextual CTAs ────────────────────────────────────────────────────────────
// Primary depends on where the game came from: single→Best of 7,
// challenge→Rematch, daily→Share. Everything leads to another game or a share.
function CTAs({ mode, won, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard, onAnalysis }) {
  const P = ({ onClick, children }) => (
    <button onClick={onClick} style={{ width: "100%", padding: 15, fontSize: 14, fontWeight: 900, border: "none", borderRadius: 10, background: T.gold, color: "#111", cursor: "pointer", letterSpacing: 0.5, minHeight: 48 }}>{children}</button>
  );
  const S = ({ onClick, children }) => (
    <button onClick={onClick} style={{ flex: "1 1 30%", padding: 12, fontSize: 12.5, fontWeight: 700, borderRadius: 9, border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer", minHeight: 44 }}>{children}</button>
  );

  let primary, secondaries;
  if (mode === "challenge") {
    primary = <P onClick={onRematch}>🔁 REMATCH — RUN IT BACK</P>;
    secondaries = [
      onBest7 && <S key="b7" onClick={onBest7}>Best of 7</S>,
      <S key="sh" onClick={onShare}>📤 Share Result</S>,
      <S key="ch" onClick={onChallenge}>⚔️ Challenge Someone Else</S>,
    ];
  } else if (mode === "daily") {
    primary = <P onClick={onShare}>📤 SHARE TODAY'S RESULT</P>;
    secondaries = [
      onLeaderboard && <S key="lb" onClick={onLeaderboard}>📊 Daily Leaderboard</S>,
      <S key="ch" onClick={onChallenge}>⚔️ Challenge a Friend</S>,
    ];
  } else {
    primary = onBest7
      ? <P onClick={onBest7}>🏆 RUN BEST OF 7 {won ? "— PROVE IT WASN'T LUCK" : "— GET REVENGE"}</P>
      : <P onClick={onShare}>📤 SHARE RESULT</P>;
    secondaries = [
      onRematch && <S key="rm" onClick={onRematch}>🔁 Rematch</S>,
      onSwap && <S key="sw" onClick={onSwap}>♻️ Swap One Player</S>,
      <S key="ch" onClick={onChallenge}>⚔️ Challenge a Friend</S>,
      onBest7 && <S key="sh" onClick={onShare}>📤 Share</S>,
    ];
  }
  return (
    <div style={{ marginTop: 14 }}>
      {primary}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>{secondaries.filter(Boolean)}</div>
      {onAnalysis && (
        <button onClick={onAnalysis} style={{ width: "100%", marginTop: 8, padding: 9, fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: "transparent", color: T.textDim, cursor: "pointer" }}>
          📋 View full matchup analysis ↓
        </button>
      )}
    </div>
  );
}

// ── The Postgame ───────────────────────────────────────────────────────────────
// sim: validated structured result (LLM sim enriched with engine data by
// simClient, or a pure engine result). mode: single|best7|daily|challenge.
export default function Postgame({ sim, won, mode, seriesLabel, feedbackCtx, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard }) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const mvpLine = mvpLineFromBox(sim);
  const whyChips = won ? sim.teamAStrengths : sim.teamBStrengths;
  const weakness = sim.teamAWeaknesses?.[0]; // always about YOUR team
  const turning = typeof sim.turningPoint === "string"
    ? { text: sim.turningPoint }
    : sim.turningPoint; // engine: {quarter, clock, text, game?}

  return (
    <div style={{ ...card, marginTop: 14, overflow: "hidden", borderColor: won ? "#2a4a35" : "#4a2a30" }}>
      <div style={{ background: `linear-gradient(180deg, ${won ? "#12281c" : "#2d141b"} 0%, ${T.bgCard} 100%)` }}>
        <FinalHeader sim={sim} won={won} mode={mode} seriesLabel={seriesLabel} />
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        {/* MVP */}
        {sim.mvp && (
          <div style={{ padding: 14, borderRadius: 10, background: "#2b230a", border: `1px solid ${T.gold}`, textAlign: "center" }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: T.gold, fontWeight: 800 }}>
              ⭐ {mode === "best7" ? "SERIES MVP" : "MVP"}
            </div>
            <div style={{ fontWeight: 900, fontSize: 22, fontStyle: "italic", margin: "2px 0" }}>{sim.mvp}</div>
            {mvpLine && <div style={{ fontSize: 13, fontWeight: 700, color: T.gold }}>{mvpLine}</div>}
            {sim.mvpReason && <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>{sim.mvpReason}</div>}
          </div>
        )}

        {/* Why you won / lost */}
        {sim.summary && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: won ? T.green : T.red }}>
              WHY YOU {won ? "WON" : "LOST"}
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: "6px 0 0" }}>{sim.summary}</p>
            <Chips items={whyChips} color={won ? T.green : T.red} />
          </div>
        )}

        {/* Turning point */}
        {turning?.text && (
          <div style={{ marginTop: 14, padding: 12, borderLeft: `3px solid ${T.orange}`, background: T.bgCardHover, borderRadius: "0 9px 9px 0" }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: T.orange, fontWeight: 800 }}>
              ⚡ TURNING POINT{turning.game ? ` — ${turning.game}` : ""}{turning.quarter ? ` · ${turning.quarter}` : ""}{turning.clock ? ` · ${turning.clock}` : ""}
            </div>
            <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{turning.text}</div>
          </div>
        )}

        {/* Matchup edges (engine data) */}
        <EdgeBars edges={sim.edges} />

        {/* Biggest weakness */}
        {weakness && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.red }}>BIGGEST WEAKNESS</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{weakness}</div>
          </div>
        )}

        {/* CTAs */}
        <CTAs mode={mode} won={won}
          onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge}
          onSwap={onSwap} onShare={onShare} onLeaderboard={onLeaderboard}
          onAnalysis={() => setShowAnalysis((s) => !s)} />

        {/* Full analysis: box scores + analyst chips */}
        {showAnalysis && (
          <div style={{ marginTop: 8 }}>
            <BoxTable label="YOUR FIVE (TEAM GOLD)" stats={sim.teamAStats} color={T.gold} />
            <Chips items={sim.teamAStrengths} color={T.green} />
            <Chips items={sim.teamAWeaknesses} color={T.red} />
            <BoxTable label="OPPONENT (TEAM BLUE)" stats={sim.teamBStats} color={T.blue} />
            <Chips items={sim.teamBStrengths} color={T.green} />
            <Chips items={sim.teamBWeaknesses} color={T.red} />
          </div>
        )}

        {/* Believability feedback */}
        {feedbackCtx && <Feedback ctx={feedbackCtx} />}
      </div>
    </div>
  );
}
