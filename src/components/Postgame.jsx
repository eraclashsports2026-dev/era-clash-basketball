// ── ERAClash POSTGAME — the broadcast after the buzzer ────────────────────────
// Same arena environment as the builder; the lights stay on and coverage
// shifts to postgame. Every number comes from the structured result (validated
// model output + deterministic engine data) — nothing invented for aesthetics.
// Never a dead end: contextual CTAs lead back into another game or a share.
import { T, card } from "../theme.js";
import { chemistryScore, chemistryLabel } from "../chemistryView.js";
import { Feedback } from "./Feedback.jsx";
import PlayerImage from "./PlayerImage.jsx";

const goldWon = (sim) => String(sim?.winner || "").toLowerCase().includes("gold");

const finalScores = (sim) => {
  const m = String(sim?.seriesResult || "").match(/^(\d{2,3})\s*-\s*(\d{2,3})$/);
  if (!m) return null;
  const [hi, lo] = [Number(m[1]), Number(m[2])];
  return goldWon(sim) ? { gold: Math.max(hi, lo), blue: Math.min(hi, lo) } : { gold: Math.min(hi, lo), blue: Math.max(hi, lo) };
};

const mvpRow = (sim) => {
  const box = [...(sim.teamAStats || []), ...(sim.teamBStats || [])];
  return box.find((r) => sim.mvp && r.name && sim.mvp.toLowerCase().includes(r.name.split(" ").slice(-1)[0].toLowerCase()));
};
const mvpPlayer = (sim, team, opp) =>
  [...(team || []), ...(opp || [])].filter(Boolean).find((p) => sim.mvp && sim.mvp.toLowerCase().includes(p.name.split(" ").slice(-1)[0].toLowerCase()));

// ── Scoreboard hero ────────────────────────────────────────────────────────────
function LineupStrip({ team, side }) {
  if (!team?.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
      {team.filter(Boolean).map((p) => (
        <PlayerImage key={p.id} player={p} variant="scoreboard" team={side} />
      ))}
    </div>
  );
}

function ScoreboardHero({ sim, won, mode, seriesLabel, team, opp }) {
  const scores = finalScores(sim);
  const isSeries = /^\d-\d$/.test(String(sim.seriesResult || ""));
  const winnerLabel = won ? "TEAM GOLD WINS" : "TEAM BLUE WINS";
  return (
    <div style={{
      padding: "22px 14px 18px", textAlign: "center",
      background: `linear-gradient(180deg, ${won ? "rgba(253,185,39,0.10)" : "rgba(110,168,254,0.10)"} 0%, rgba(20,26,42,0) 85%)`,
    }}>
      <div style={{ fontSize: 10.5, letterSpacing: 4, color: T.textDim, fontWeight: 800 }}>
        {mode === "daily" ? "DAILY CLASH · " : mode === "challenge" ? "GRUDGE MATCH · " : ""}FINAL{seriesLabel ? ` — ${seriesLabel}` : ""}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <div className="rise" style={{ flex: "1 1 150px", maxWidth: 300 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 900, color: T.gold, marginBottom: 6 }}>TEAM GOLD</div>
          <LineupStrip team={team} side="gold" />
          {scores && !isSeries && (
            <div style={{ fontSize: 52, fontWeight: 900, fontStyle: "italic", lineHeight: 1.1, color: won ? T.text : T.textDim }}>{scores.gold}</div>
          )}
        </div>

        <div className="rise-2" style={{ flexShrink: 0 }}>
          <div aria-hidden="true" style={{
            fontSize: 34, fontWeight: 900, fontStyle: "italic", letterSpacing: -1,
            background: `linear-gradient(120deg, ${T.gold} 30%, #e8eaf2 50%, ${T.blue} 70%)`,
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>VS</div>
          {isSeries && <div style={{ fontSize: 40, fontWeight: 900, fontStyle: "italic", color: won ? T.gold : T.blue }}>{sim.seriesResult}</div>}
        </div>

        <div className="rise" style={{ flex: "1 1 150px", maxWidth: 300 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 900, color: T.blue, marginBottom: 6 }}>TEAM BLUE</div>
          <LineupStrip team={opp} side="blue" />
          {scores && !isSeries && (
            <div style={{ fontSize: 52, fontWeight: 900, fontStyle: "italic", lineHeight: 1.1, color: won ? T.textDim : T.text }}>{scores.blue}</div>
          )}
        </div>
      </div>

      <div className="rise-3" style={{ marginTop: 10 }}>
        <span style={{
          display: "inline-block", padding: "7px 20px", borderRadius: 20, fontSize: 14, fontWeight: 900, letterSpacing: 2,
          color: won ? "#111" : "#0a1428", background: won ? T.gold : T.blue,
        }}>{winnerLabel}</span>
        {isSeries && <div style={{ fontSize: 12, color: T.textDim, marginTop: 6 }}>Best of 7 — {won ? "Gold" : "Blue"} wins series {sim.seriesResult}</div>}
      </div>
    </div>
  );
}

// ── Matchup breakdown (box-score totals + engine edges) ───────────────────────
const boxTotals = (stats, k) => (stats || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);

function BreakdownBars({ sim }) {
  const rows = [];
  const add = (label, g, b, round1) => {
    if (!Number.isFinite(g) || !Number.isFinite(b) || (g === 0 && b === 0)) return;
    rows.push({ label, g: round1 ? Math.round(g * 10) / 10 : Math.round(g), b: round1 ? Math.round(b * 10) / 10 : Math.round(b) });
  };
  add("Points", boxTotals(sim.teamAStats, "pts"), boxTotals(sim.teamBStats, "pts"));
  add("Rebounds", boxTotals(sim.teamAStats, "reb"), boxTotals(sim.teamBStats, "reb"), true);
  add("Assists", boxTotals(sim.teamAStats, "ast"), boxTotals(sim.teamBStats, "ast"), true);
  add("Steals", boxTotals(sim.teamAStats, "stl"), boxTotals(sim.teamBStats, "stl"), true);
  add("Blocks", boxTotals(sim.teamAStats, "blk"), boxTotals(sim.teamBStats, "blk"), true);
  if (!rows.length) return null;
  return (
    <div style={{ ...card, padding: 16, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>MATCHUP BREAKDOWN</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 900, letterSpacing: 1.5, marginBottom: 6 }}>
        <span style={{ color: T.gold }}>GOLD</span><span style={{ color: T.blue }}>BLUE</span>
      </div>
      {rows.map((r) => {
        const total = r.g + r.b || 1;
        return (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, fontSize: 11.5 }}>
            <span style={{ width: 30, textAlign: "right", fontWeight: 800, color: T.gold }}>{r.g}</span>
            <div style={{ flex: 1, height: 7, borderRadius: 4, background: T.border, display: "flex", overflow: "hidden" }}>
              <div style={{ width: `${(r.g / total) * 100}%`, background: T.gold, opacity: 0.85 }} />
              <div style={{ width: `${(r.b / total) * 100}%`, background: T.blue, opacity: 0.85 }} />
            </div>
            <span style={{ width: 30, fontWeight: 800, color: T.blue }}>{r.b}</span>
            <span style={{ width: 68, color: T.textDim, fontSize: 10.5 }}>{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Engine matchup edges ───────────────────────────────────────────────────────
function EdgeBars({ edges }) {
  const shown = (edges || []).filter((e) => e.edge !== 0).slice(0, 4);
  if (!shown.length) return null;
  return (
    <div style={{ ...card, padding: 16, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>PRE-GAME EDGES</div>
      {shown.map((e) => {
        const yours = e.edge > 0;
        const half = Math.min(45, Math.abs(e.edge) * 2.25); // % from center, capped
        return (
          <div key={e.category} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ fontWeight: 700 }}>{e.category}</span>
              <span style={{ fontWeight: 900, color: yours ? T.gold : T.blue }}>{yours ? "Gold" : "Blue"} +{Math.abs(e.edge)}</span>
            </div>
            <div style={{ height: 6, background: T.border, borderRadius: 3, position: "relative", overflow: "hidden" }}>
              {/* bar grows from the center toward the leading team's side */}
              <div style={{ position: "absolute", top: 0, bottom: 0, left: yours ? `${50 - half}%` : "50%", width: `${half}%`, background: yours ? T.gold : T.blue, borderRadius: 3 }} />
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(232,234,242,0.25)" }} />
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>Computed from player data, ratings & chemistry before tipoff.</div>
    </div>
  );
}

function BoxTable({ label, stats, color, mvpName }) {
  if (!Array.isArray(stats) || !stats.length) return null;
  return (
    <div style={{ marginTop: 12, overflowX: "auto" }}>
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
          {stats.map((s, i) => {
            const isMvp = mvpName && s.name && mvpName.toLowerCase().includes(s.name.split(" ").slice(-1)[0].toLowerCase());
            return (
              <tr key={i} style={{ borderTop: `1px solid ${T.border}`, textAlign: "right", background: isMvp ? "rgba(253,185,39,0.07)" : "transparent" }}>
                <td style={{ textAlign: "left", padding: "5px 4px", fontWeight: 600 }}>{isMvp ? "⭐ " : ""}{s.name}</td>
                <td style={{ padding: "5px 4px", fontWeight: 800, color }}>{s.pts}</td><td style={{ padding: "5px 4px" }}>{s.reb}</td>
                <td style={{ padding: "5px 4px" }}>{s.ast}</td><td style={{ padding: "5px 4px" }}>{s.stl}</td><td style={{ padding: "5px 4px" }}>{s.blk}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Strengths / weaknesses quadrants ───────────────────────────────────────────
function AnalysisQuad({ sim }) {
  const Q = ({ title, items, color, sign }) => !items?.length ? null : (
    <div style={{ flex: "1 1 220px", padding: 12, borderRadius: 10, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color, marginBottom: 6 }}>{title}</div>
      {items.map((s, i) => (
        <div key={i} style={{ fontSize: 12, marginBottom: 4, lineHeight: 1.45 }}>
          <span style={{ color, fontWeight: 800 }}>{sign} </span>{s}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
      <Q title="TEAM GOLD STRENGTHS" items={sim.teamAStrengths} color={T.green} sign="+" />
      <Q title="TEAM GOLD WEAKNESSES" items={sim.teamAWeaknesses} color={T.red} sign="−" />
      <Q title="TEAM BLUE STRENGTHS" items={sim.teamBStrengths} color={T.green} sign="+" />
      <Q title="TEAM BLUE WEAKNESSES" items={sim.teamBWeaknesses} color={T.red} sign="−" />
    </div>
  );
}

// ── Chemistry dials ────────────────────────────────────────────────────────────
function ChemDial({ label, team, color }) {
  const score = chemistryScore(team);
  if (score == null) return null;
  const deg = (score / 100) * 360;
  return (
    <div style={{ textAlign: "center", flex: "1 1 130px" }}>
      <div aria-label={`${label} chemistry ${score}`} style={{
        width: 84, height: 84, borderRadius: "50%", margin: "0 auto",
        background: `conic-gradient(${color} ${deg}deg, ${T.border} ${deg}deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: 66, height: 66, borderRadius: "50%", background: T.bgCard, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 22, fontWeight: 900, fontStyle: "italic", color }}>{score}</span>
        </div>
      </div>
      <div style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 800, color: T.textDim, marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color }}>{chemistryLabel(score)}</div>
    </div>
  );
}

// ── Contextual CTAs ────────────────────────────────────────────────────────────
function CTAs({ mode, won, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard }) {
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
  } else if (mode === "best7") {
    primary = <P onClick={onChallenge}>⚔️ CHALLENGE A FRIEND WITH THIS TEAM</P>;
    secondaries = [
      onRematch && <S key="rm" onClick={onRematch}>🔁 New Series</S>,
      onSwap && <S key="sw" onClick={onSwap}>♻️ Swap One Player</S>,
      <S key="sh" onClick={onShare}>📤 Share</S>,
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
    </div>
  );
}

// ── The Postgame ───────────────────────────────────────────────────────────────
export default function Postgame({ sim, won, mode, seriesLabel, team, opp, feedbackCtx, narrativeStatus, onRetryNarrative, persisted, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard }) {
  const row = mvpRow(sim);
  const mvpP = mvpPlayer(sim, team, opp);
  const mvpOnGold = (team || []).some((p) => p && p === mvpP);
  const turning = typeof sim.turningPoint === "string" ? { text: sim.turningPoint } : sim.turningPoint;

  return (
    <div className="rise" style={{ ...card, marginTop: 14, overflow: "hidden", borderColor: won ? T.goldBorder : T.blueBorder, boxShadow: won ? T.glowGold : T.glowBlue }}>
      <ScoreboardHero sim={sim} won={won} mode={mode} seriesLabel={seriesLabel} team={team} opp={opp} />

      <div style={{ padding: "0 16px 16px" }}>
        {/* B. MVP feature card with a real explanation (narrative or deterministic fallback) */}
        {sim.mvp && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: 12, background: "linear-gradient(120deg, #2b230a 0%, #1a1610 100%)", border: `1px solid ${T.gold}`, flexWrap: "wrap" }}>
            {mvpP && <PlayerImage player={mvpP} variant="mvp" team={mvpOnGold ? "gold" : "blue"} />}
            <div style={{ minWidth: 200, flex: 1 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: T.gold, fontWeight: 800 }}>
                ⭐ {mode === "best7" ? "SERIES MVP" : "GAME MVP"}
              </div>
              <div style={{ fontWeight: 900, fontSize: 23, fontStyle: "italic", margin: "2px 0" }}>{sim.mvp}</div>
              {mvpP && <div style={{ fontSize: 11.5, color: T.textDim }}>{mvpP.decade} · {mvpP.team}</div>}
              {row && (
                <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                  {[["PTS", row.pts], ["REB", row.reb], ["AST", row.ast], ["STL", row.stl]].map(([k, v]) => (
                    <div key={k} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 19, fontWeight: 900, color: T.gold }}>{v}</div>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: T.textDim }}>{k}</div>
                    </div>
                  ))}
                </div>
              )}
              {sim.mvpReason && <p style={{ fontSize: 12.5, color: T.text, marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>{sim.mvpReason}</p>}
            </div>
          </div>
        )}

        {/* C. Game summary (deterministic recap instantly; enhanced recap replaces it) */}
        {sim.summary && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: won ? T.green : T.red }}>
              WHY YOU {won ? "WON" : "LOST"}
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: "6px 0 0" }}>{sim.summary}</p>
          </div>
        )}
        {narrativeStatus === "pending" && (
          <div aria-live="polite" style={{ marginTop: 10, fontSize: 12, color: T.textDim, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="sim-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden="true" />
            Preparing enhanced game analysis…
          </div>
        )}
        {narrativeStatus === "failed" && (
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: T.bgCardHover, border: `1px solid ${T.border}`, fontSize: 12, color: T.textDim, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>Enhanced game analysis is temporarily unavailable. {persisted ? "Your result is saved." : "Your result is shown from the game engine."}</span>
            {onRetryNarrative && (
              <button onClick={onRetryNarrative} style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 800, borderRadius: 7, border: `1px solid ${T.goldBorder}`, background: "transparent", color: T.gold, cursor: "pointer" }}>
                Try Enhanced Recap Again
              </button>
            )}
          </div>
        )}

        {/* D. Turning point — 2-3 sentences from the computed result */}
        {turning?.text && (
          <div style={{ marginTop: 14, padding: 12, borderLeft: `3px solid ${T.orange}`, background: T.bgCardHover, borderRadius: "0 9px 9px 0" }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: T.orange, fontWeight: 800 }}>
              ⚡ TURNING POINT{turning.game ? ` — ${turning.game}` : ""}{turning.quarter ? ` · ${turning.quarter}` : ""}
            </div>
            <p style={{ fontSize: 13, margin: "6px 0 0", lineHeight: 1.6 }}>{turning.text}</p>
          </div>
        )}

        {/* V3: possession context + expectation honesty */}
        {sim.v3 && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: T.bgCardHover, border: `1px solid ${T.border}`, fontSize: 12, color: T.textDim, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>🏀 <b style={{ color: T.text }}>{sim.v3.possessions}</b> possessions{sim.v3.overtimes > 0 ? ` · ${sim.v3.overtimes} OT` : ""}</span>
            <span>📈 pre-game read: <b style={{ color: sim.v3.expectedGoldWinPct >= 50 ? T.gold : T.blue }}>{sim.v3.expectedGoldWinPct >= 55 ? "Gold" : sim.v3.expectedGoldWinPct <= 45 ? "Blue" : "even"}{sim.v3.expectedBand ? ` · ${sim.v3.expectedBand}` : ""}</b></span>
            {sim.v3.outcomeClass && sim.v3.outcomeClass.includes("UPSET") && (
              <span>⚡ <b style={{ color: T.gold }}>{sim.v3.outcomeClass.replace(/_/g, " ")}</b></span>
            )}
            {sim.v3.expectedPoints && (
              <span>🎯 shot quality (expected pts): <b style={{ color: T.gold }}>{Math.round(sim.v3.expectedPoints.gold)}</b> · <b style={{ color: T.blue }}>{Math.round(sim.v3.expectedPoints.blue)}</b></span>
            )}
            {sim.eraId && <span>🕰️ Era Style: <b style={{ color: T.text }}>{sim.eraId}</b></span>}
          </div>
        )}

        {/* E. Team-level matchup breakdown (default visible) */}
        <BreakdownBars sim={sim} />

        {/* F. FULL BOX SCORE — both teams, visible by default, no accordion */}
        <div style={{ ...card, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>FULL BOX SCORE</div>
          <BoxTable label="TEAM GOLD" stats={sim.teamAStats} color={T.gold} mvpName={sim.mvp} />
          <BoxTable label="TEAM BLUE" stats={sim.teamBStats} color={T.blue} mvpName={sim.mvp} />
        </div>

        {/* V3: extended possession box score */}
        {sim.v3?.fullBox && (
          <div style={{ ...card, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>POSSESSION BOX SCORE</div>
            {[["TEAM GOLD", sim.v3.fullBox.gold, T.gold], ["TEAM BLUE", sim.v3.fullBox.blue, T.blue]].map(([label, lines, color]) => (
              <div key={label} style={{ marginTop: 10, overflowX: "auto" }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color, marginBottom: 4 }}>{label}</div>
                <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", minWidth: 560 }}>
                  <thead><tr style={{ color: T.textDim, textAlign: "right" }}>
                    <th style={{ textAlign: "left", padding: "3px 4px" }}>PLAYER</th>
                    {["PTS", "FG", "3PT", "FT", "OREB", "DREB", "AST", "STL", "BLK", "TO", "PF"].map((h) => <th key={h} style={{ padding: "3px 4px" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} style={{ borderTop: `1px solid ${T.border}`, textAlign: "right" }}>
                        <td style={{ textAlign: "left", padding: "4px", fontWeight: 600, whiteSpace: "nowrap" }}>{l.name}</td>
                        <td style={{ padding: "4px", fontWeight: 800, color }}>{l.pts}</td>
                        <td style={{ padding: "4px" }}>{l.fgm}-{l.fga}</td>
                        <td style={{ padding: "4px" }}>{l.tpm}-{l.tpa}</td>
                        <td style={{ padding: "4px" }}>{l.ftm}-{l.fta}</td>
                        <td style={{ padding: "4px" }}>{l.oreb}</td><td style={{ padding: "4px" }}>{l.dreb}</td>
                        <td style={{ padding: "4px" }}>{l.ast}</td><td style={{ padding: "4px" }}>{l.stl}</td>
                        <td style={{ padding: "4px" }}>{l.blk}</td><td style={{ padding: "4px" }}>{l.to}</td>
                        <td style={{ padding: "4px" }}>{l.pf ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* V3: usage roles + defensive assignments — the basketball under the hood */}
        {sim.v3?.usage && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ flex: "1 1 260px", padding: 12, borderRadius: 10, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color: T.textDim, marginBottom: 6 }}>OFFENSIVE ROLES (USAGE)</div>
              {[["gold", T.gold], ["blue", T.blue]].map(([side, color]) => (
                <div key={side} style={{ marginBottom: 6 }}>
                  {sim.v3.usage[side].map((u) => (
                    <div key={u.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                      <span style={{ color: T.text }}>{u.id.split("-")[0]}</span>
                      <span style={{ color: T.textDim }}>{u.role}</span>
                      <span style={{ fontWeight: 800, color }}>{Math.round(u.share * 100)}%</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ flex: "1 1 260px", padding: 12, borderRadius: 10, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color: T.textDim, marginBottom: 6 }}>DEFENSIVE ASSIGNMENTS</div>
              {sim.v3.assignments.onGold.map((a, i) => (
                <div key={i} style={{ fontSize: 11, padding: "2px 0", color: T.textDim }}>
                  <b style={{ color: T.blue }}>{a.defender.split(" ").slice(-1)[0]}</b> guarded <b style={{ color: T.gold }}>{a.scorer.split(" ").slice(-1)[0]}</b>
                </div>
              ))}
              <div style={{ height: 6 }} />
              {sim.v3.assignments.onBlue.map((a, i) => (
                <div key={i} style={{ fontSize: 11, padding: "2px 0", color: T.textDim }}>
                  <b style={{ color: T.gold }}>{a.defender.split(" ").slice(-1)[0]}</b> guarded <b style={{ color: T.blue }}>{a.scorer.split(" ").slice(-1)[0]}</b>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* V3: in-game coaching adjustments actually made by the engine */}
        {sim.v3 && ((sim.v3.adjustments?.gold?.length || 0) + (sim.v3.adjustments?.blue?.length || 0) > 0) && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color: T.textDim, marginBottom: 6 }}>IN-GAME ADJUSTMENTS</div>
            {(sim.v3.adjustments.gold || []).map((a, i) => (
              <div key={`g${i}`} style={{ fontSize: 11.5, padding: "2px 0", color: T.textDim }}><b style={{ color: T.gold }}>Gold:</b> {a}</div>
            ))}
            {(sim.v3.adjustments.blue || []).map((a, i) => (
              <div key={`b${i}`} style={{ fontSize: 11.5, padding: "2px 0", color: T.textDim }}><b style={{ color: T.blue }}>Blue:</b> {a}</div>
            ))}
          </div>
        )}

        {/* Pre-game engine edges */}
        <EdgeBars edges={sim.edges} />

        {/* H/I. Strengths & weaknesses quadrants */}
        <AnalysisQuad sim={sim} />

        {/* J. Chemistry dials */}
        {(team || opp) && (
          <div style={{ ...card, padding: 16, marginTop: 12, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <ChemDial label="GOLD CHEMISTRY" team={team} color={T.gold} />
            <ChemDial label="BLUE CHEMISTRY" team={opp} color={T.blue} />
          </div>
        )}

        {/* K. Believability feedback */}
        {feedbackCtx && <Feedback ctx={feedbackCtx} />}

        {/* L. Actions — never a dead end */}
        <CTAs mode={mode} won={won}
          onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge}
          onSwap={onSwap} onShare={onShare} onLeaderboard={onLeaderboard} />
      </div>
    </div>
  );
}
