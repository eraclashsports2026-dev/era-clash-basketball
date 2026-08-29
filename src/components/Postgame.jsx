// ── ERAClash POSTGAME — the broadcast after the buzzer ────────────────────────
// Same arena environment as the builder; the lights stay on and coverage
// shifts to postgame. Every number comes from the structured result (validated
// model output + deterministic engine data) — nothing invented for aesthetics.
// Never a dead end: contextual CTAs lead back into another game or a share.
import { useState } from "react";
import { KeyMoments, MatchupPatterns, PeriodScores } from "./PostgamePanels.jsx";
import CoachingStrategy from "./CoachingStrategy.jsx";
import { FONT, T, card } from "../theme.js";
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
    // The score reveal is the cinematic moment: a navy arena inset inside the
    // warm page, so the final number carries weight.
    <div className="ec-arena-inset" style={{ padding: "26px 14px 22px", textAlign: "center", borderRadius: 0 }}>
      <div style={{ fontSize: 10.5, letterSpacing: 4, color: T.onArenaDim, fontWeight: 800 }}>
        {mode === "daily" ? "DAILY CLASH · " : mode === "challenge" ? "GRUDGE MATCH · " : ""}FINAL{seriesLabel ? ` — ${seriesLabel}` : ""}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <div className="rise" style={{ flex: "1 1 150px", maxWidth: 300 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 900, color: T.goldOnDark, marginBottom: 6 }}>TEAM GOLD</div>
          <LineupStrip team={team} side="gold" />
          {scores && !isSeries && (
            <div style={{ fontSize: 54, fontWeight: 900, fontStyle: "italic", lineHeight: 1.1, fontFamily: FONT.display, color: won ? T.onArena : T.onArenaDim }}>{scores.gold}</div>
          )}
        </div>

        <div className="rise-2" style={{ flexShrink: 0 }}>
          <div aria-hidden="true" style={{
            fontSize: 34, fontWeight: 900, fontStyle: "italic", letterSpacing: -1,
            background: `linear-gradient(120deg, ${T.goldOnDark} 30%, #ffffff 50%, ${T.blueOnDark} 70%)`,
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>VS</div>
          {isSeries && <div style={{ fontSize: 40, fontWeight: 900, fontStyle: "italic", color: won ? T.goldOnDark : T.blueOnDark }}>{sim.seriesResult}</div>}
        </div>

        <div className="rise" style={{ flex: "1 1 150px", maxWidth: 300 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 900, color: T.blueOnDark, marginBottom: 6 }}>TEAM BLUE</div>
          <LineupStrip team={opp} side="blue" />
          {scores && !isSeries && (
            <div style={{ fontSize: 54, fontWeight: 900, fontStyle: "italic", lineHeight: 1.1, fontFamily: FONT.display, color: won ? T.onArenaDim : T.onArena }}>{scores.blue}</div>
          )}
        </div>
      </div>

      <div className="rise-3" style={{ marginTop: 10 }}>
        <span style={{
          display: "inline-block", padding: "7px 20px", borderRadius: 20, fontSize: 14, fontWeight: 900, letterSpacing: 2,
          color: "#0c1627", background: won ? T.goldOnDark : T.blueOnDark,
        }}>{winnerLabel}</span>
        {isSeries && <div style={{ fontSize: 12.5, color: T.onArenaDim, marginTop: 6 }}>Best of 7 — {won ? "Gold" : "Blue"} wins series {sim.seriesResult}</div>}
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
// ── The stored pregame read ─────────────────────────────────────────────────
// Phase 7B: this used to render the model's RAW numeric edges ("Gold +4"),
// which both leaked hidden internals and contradicted the qualitative read the
// Ready screen had shown minutes earlier. It now renders the snapshot stored
// with the result — the same object, the same words.
function StoredPregameRead({ pregame }) {
  if (!pregame?.qualitativeEdges?.length) {
    return (
      <div style={{ ...card, padding: 16, marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>BEFORE TIPOFF</div>
        <div style={{ fontSize: 13.5, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
          This result was recorded before pregame reads were stored, so the original read is unavailable.
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...card, padding: 16, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>BEFORE TIPOFF</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: T.textDim }}>stored before the sim</span>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {pregame.qualitativeEdges.map((e) => (
          <div key={e.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ color: T.textDim }}>{e.category}</span>
            <span style={{ fontWeight: 800, color: e.lead === "gold" ? T.gold : e.lead === "blue" ? T.blue : T.textMuted }}>{e.label}</span>
          </div>
        ))}
      </div>
      {pregame.keyClash && <p style={{ fontSize: 13.5, color: T.text, marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>{pregame.keyClash}</p>}
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
              <tr key={i} style={{ borderTop: `1px solid ${T.border}`, textAlign: "right", background: isMvp ? T.goldSoft : "transparent" }}>
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
function AnalysisQuad({ sim, center }) {
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
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "stretch" }}>
      <Q title="TEAM GOLD STRENGTHS" items={sim.teamAStrengths} color={T.green} sign="+" />
      <Q title="TEAM GOLD WEAKNESSES" items={sim.teamAWeaknesses} color={T.red} sign="−" />
      {center}
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
function CTAs({ mode, won, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard, previewCandidate }) {
  // CANDIDATE CONTINUITY: a preview result was simulated by Candidate 3, whose
  // preview scope is a single game. Offering "Best of 7" here would silently
  // run the series on the production engine — a different simulation than the
  // one just played. The action is withdrawn and explained instead of faked.
  const seriesBlocked = Boolean(previewCandidate);
  if (seriesBlocked) onBest7 = null;
  const P = ({ onClick, children }) => (
    <button onClick={onClick} style={{ width: "100%", padding: 15, fontSize: 14, fontWeight: 900, border: "none", borderRadius: 10, background: T.gold, color: "#fffdf8", cursor: "pointer", letterSpacing: 0.5, minHeight: 48 }}>{children}</button>
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
      ? <P onClick={onBest7}>🏆 Run Best of 7</P>
      : <P onClick={onRematch}>🔁 Rematch</P>;
    secondaries = [
      onBest7 && onRematch && <S key="rm" onClick={onRematch}>🔁 Rematch</S>,
      onSwap && <S key="sw" onClick={onSwap}>♻️ Swap One Player</S>,
      <S key="ch" onClick={onChallenge}>⚔️ Challenge a Friend</S>,
      <S key="sh" onClick={onShare}>📤 Share</S>,
    ];
  }
  return (
    <div style={{ marginTop: 14 }}>
      {primary}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>{secondaries.filter(Boolean)}</div>
      {seriesBlocked && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: T.textDim, lineHeight: 1.5 }}>
          Best of 7 is unavailable in this preview: series play would run on the production engine, and a
          series is not mixed across two different simulations. Rematch replays this matchup on the same engine.
        </div>
      )}
    </div>
  );
}

// ── ONE authoritative box score ──────────────────────────────────────────────
// Phase 7B: the product previously rendered two tables of the same game (a
// five-column summary and the possession box). One is authoritative. Personal
// fouls are omitted: the simulation records them, but with no foul-out,
// substitution or rotation consequence surfaced, a PF column reads as a
// feature the game does not have.
const BOX_COLUMNS = [
  ["PTS", (l) => l.pts], ["FG", (l) => `${l.fgm}-${l.fga}`], ["3PT", (l) => `${l.tpm}-${l.tpa}`],
  ["FT", (l) => `${l.ftm}-${l.fta}`], ["OREB", (l) => l.oreb], ["DREB", (l) => l.dreb],
  ["REB", (l) => l.oreb + l.dreb], ["AST", (l) => l.ast], ["STL", (l) => l.stl],
  ["BLK", (l) => l.blk], ["TO", (l) => l.to],
];

/**
 * ONE table for both teams.
 *
 * The previous version rendered a separate <table> per team, each inside its own
 * scroll container. Two tables size their columns independently, so a long name
 * in one widened that team's PLAYER column and every number below it drifted
 * out of line with the other team's. A shared <colgroup> on a single table is
 * what actually guarantees the columns agree.
 */
const sumPair = (lines, fn) => {
  let a = 0, b = 0;
  for (const l of lines) { const [x, y] = String(fn(l)).split("-").map(Number); a += x || 0; b += y || 0; }
  return `${a}-${b}`;
};
const PAIR_COLS = new Set(["FG", "3PT", "FT"]);

function TeamRows({ label, lines, color, mvpName }) {
  const total = (fn) => lines.reduce((s, l) => s + (Number(fn(l)) || 0), 0);
  return (
    <tbody>
      <tr>
        <th colSpan={BOX_COLUMNS.length + 1} scope="colgroup" style={{
          textAlign: "left", padding: "12px 6px 4px", fontSize: 11, fontWeight: 800,
          letterSpacing: 1.5, color, background: T.bgCard,
        }}>{label}</th>
      </tr>
      {lines.map((l) => {
        const isMvp = l.name === mvpName;
        return (
          <tr key={l.id ?? l.name} style={{
            borderTop: `1px solid ${T.border}`, textAlign: "right",
            background: isMvp ? T.bgCardHover : "transparent",
          }}>
            <td className="box-player" style={{
              textAlign: "left", padding: "6px", fontWeight: isMvp ? 800 : 600,
              background: isMvp ? T.bgCardHover : T.bgCard,
            }}>
              {isMvp ? "★ " : ""}{l.name}
            </td>
            {BOX_COLUMNS.map(([h, fn]) => (
              <td key={h} style={{ padding: "6px", fontWeight: h === "PTS" ? 800 : 400, color: h === "PTS" ? color : T.text }}>{fn(l)}</td>
            ))}
          </tr>
        );
      })}
      <tr style={{ borderTop: `2px solid ${T.borderStrong}`, textAlign: "right", fontWeight: 800 }}>
        <td className="box-player" style={{ textAlign: "left", padding: "6px", fontSize: 11, letterSpacing: 1, color: T.textDim, background: T.bgCard }}>TOTAL</td>
        {BOX_COLUMNS.map(([h, fn]) => (
          <td key={h} style={{ padding: "6px", color: h === "PTS" ? color : T.text }}>
            {PAIR_COLS.has(h) ? sumPair(lines, fn) : total(fn)}
          </td>
        ))}
      </tr>
    </tbody>
  );
}

function AuthoritativeBox({ sim }) {
  const box = sim.v3?.fullBox;
  if (!box) {
    return (
      <div style={{ ...card, padding: 16, marginTop: 12, fontSize: 13, color: T.textDim }}>
        A full box score is not available for this result.
      </div>
    );
  }
  return (
    <div style={{ ...card, padding: 16, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>BOX SCORE</div>
      {/* ONE table for both teams, sharing one colgroup. Two separate tables
          size their columns independently, which is what let a long name in one
          team push its numbers out of line with the other. The scroll container
          wraps the table so horizontal scrolling never reaches the page. */}
      <div className="box-scroll">
        <table className="box-table">
          <colgroup>
            <col className="box-col-player" />
            {BOX_COLUMNS.map(([h]) => (
              <col key={h} className={PAIR_COLS.has(h) ? "box-col-pair" : "box-col-stat"} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ color: T.textDim, textAlign: "right" }}>
              <th className="box-player" scope="col" style={{ textAlign: "left", padding: "4px 6px", fontSize: 11, background: T.bgCard }}>PLAYER</th>
              {BOX_COLUMNS.map(([h]) => <th key={h} scope="col" style={{ padding: "4px 6px", fontSize: 11 }}>{h}</th>)}
            </tr>
          </thead>
          <TeamRows label="TEAM GOLD" lines={box.gold} color={T.gold} mvpName={sim.mvp} />
          <TeamRows label="TEAM BLUE" lines={box.blue} color={T.blue} mvpName={sim.mvp} />
        </table>
      </div>
    </div>
  );
}

// ── Postgame section tabs ───────────────────────────────────────────────────
const SECTIONS = [
  ["final", "Final"],
  ["box", "Box Score"],
  ["story", "Game Story"],
  ["coaching", "Coaching & Strategy"],
];

function SectionTabs({ section, onSection }) {
  return (
    <div role="tablist" aria-label="Postgame sections" style={{
      display: "flex", gap: 6, padding: "12px 16px 0", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      {SECTIONS.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={section === id} onClick={() => onSection(id)} style={{
          padding: "10px 16px", fontSize: 12.5, fontWeight: 800, letterSpacing: 0.5, borderRadius: "10px 10px 0 0",
          cursor: "pointer", minHeight: 44, whiteSpace: "nowrap",
          border: `1px solid ${section === id ? T.goldBorder : T.border}`, borderBottom: "none",
          background: section === id ? T.goldSoft : T.bgCardHover,
          color: section === id ? T.gold : T.textDim,
        }}>{label}</button>
      ))}
    </div>
  );
}

// ── The Postgame ───────────────────────────────────────────────────────────────
export default function Postgame({ sim, won, mode, seriesLabel, team, opp, feedbackCtx, narrativeStatus, onRetryNarrative, persisted, onRematch, onBest7, onChallenge, onSwap, onShare, onLeaderboard }) {
  const [section, setSection] = useState("final");
  const row = mvpRow(sim);
  const mvpP = mvpPlayer(sim, team, opp);
  const mvpOnGold = (team || []).some((p) => p && p === mvpP);
  const turning = typeof sim.turningPoint === "string" ? { text: sim.turningPoint } : sim.turningPoint;

  return (
    <div className="rise" style={{ ...card, marginTop: 14, overflow: "hidden", borderColor: won ? T.goldBorder : T.blueBorder, boxShadow: won ? T.glowGold : T.glowBlue }}>
      <ScoreboardHero sim={sim} won={won} mode={mode} seriesLabel={seriesLabel} team={team} opp={opp} />

      <SectionTabs section={section} onSection={setSection} />
      <div role="tabpanel" style={{ padding: "12px 16px 16px", borderTop: `1px solid ${T.border}` }}>
        {section === "final" && <>
        <div className="pg-final-grid">
          <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
        {/* B. MVP feature card with a real explanation (narrative or deterministic fallback) */}
        {sim.mvp && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: 12, background: `linear-gradient(120deg, ${T.goldSoft} 0%, ${T.bgCard} 100%)`, border: `1px solid ${T.goldBorder}`, flexWrap: "wrap" }}>
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

        {/* V3 context chips stay on Final */}
            {sim.eraImpact && (
              <div style={{ ...card, padding: 14, marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>ERA IMPACT</div>
                <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, marginTop: 5 }}>{sim.eraImpact}</div>
              </div>
            )}
            <KeyMoments moments={sim.v3?.keyMoments} />
            <MatchupPatterns patterns={sim.v3?.matchupPatterns} />
          </div>
          <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
        {/* V3: possession context + expectation honesty */}
        {sim.v3 && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: T.bgCardHover, border: `1px solid ${T.border}`, fontSize: 12, color: T.textDim, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>🏀 <b style={{ color: T.text }}>{sim.v3.possessions}</b> possessions{sim.v3.overtimes > 0 ? ` · ${sim.v3.overtimes} OT` : ""}</span>
            <span>📈 before tipoff: <b style={{ color: sim.v3.expectedGoldWinPct >= 50 ? T.gold : T.blue }}>{sim.v3.expectedGoldWinPct >= 55 ? "Gold" : sim.v3.expectedGoldWinPct <= 45 ? "Blue" : "even"}{sim.v3.expectedBand ? ` · ${sim.v3.expectedBand}` : ""}</b></span>
            {sim.v3.outcomeClass && sim.v3.outcomeClass.includes("UPSET") && (
              <span>⚡ <b style={{ color: T.gold }}>{sim.v3.outcomeClass.replace(/_/g, " ")}</b></span>
            )}
            {sim.v3.expectedPoints && (
              <span>🎯 shot quality (expected pts): <b style={{ color: T.gold }}>{Math.round(sim.v3.expectedPoints.gold)}</b> · <b style={{ color: T.blue }}>{Math.round(sim.v3.expectedPoints.blue)}</b></span>
            )}
            {sim.eraId && <span>🕰️ Era Style: <b style={{ color: T.text }}>{sim.eraLabel || sim.eraId}</b></span>}
            {/* Which coach actually ran the game. In the Daily this is the
                one decision the player owned, so it belongs in the result. */}
            {sim.coachNames?.gold && <span>🧠 Coach: <b style={{ color: T.gold }}>{sim.coachNames.gold}</b>{sim.coachNames.blue ? <> vs <b style={{ color: T.blue }}>{sim.coachNames.blue}</b></> : null}</span>}
          </div>
        )}

        {/* E. Team-level matchup breakdown */}
        <BreakdownBars sim={sim} />
            <PeriodScores periods={sim.v3?.periodScores} />
          </div>
        </div>
        {/* H/I. Strengths & weaknesses, with the chemistry dial between them */}
        <AnalysisQuad sim={sim} />

        {/* K. Feedback (preview: the structured Wave 1 form) */}
        {feedbackCtx && <Feedback ctx={feedbackCtx} />}
        </>}

        {section === "box" && <>
        <AuthoritativeBox sim={sim} />
        </>}

        {section === "story" && <>
        {/* C. Game summary (deterministic recap instantly; enhanced recap replaces it) */}
        {/* The opening account is DETERMINISTIC and player-centered. It never
            leads with the pregame prediction, a generic "comfortable win", or
            any internal rating, and it does not wait on a provider. */}
        {(sim.story?.body || sim.summary) && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: won ? T.green : T.red }}>
              {(sim.story?.headline || `How ${won ? "You" : "They"} Won`).toUpperCase()}
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: "6px 0 0" }}>{sim.story?.body || sim.summary}</p>
          </div>
        )}

        {/* Quarter by quarter, from real period scores and possession position.
            Each period carries the meaningful events the ledger supports; no
            game clock is fabricated because the engine records none. */}
        {sim.v3?.quarterFlow?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>QUARTER BY QUARTER</div>
            <div style={{ display: "grid", gap: 8, marginTop: 7 }}>
              {sim.v3.quarterFlow.map((q) => (
                <div key={q.period} style={{ padding: "10px 12px", borderRadius: 9, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900, fontSize: 12.5 }}>{q.period}</span>
                    <span style={{ fontSize: 12.5, color: T.textDim, fontVariantNumeric: "tabular-nums" }}>
                      {q.gold}-{q.blue} · {q.state}
                    </span>
                  </div>
                  {q.events?.length ? (
                    <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                      {q.events.map((e, i) => {
                        const head = [e.when, e.state].filter(Boolean).join(" — ").toUpperCase();
                        // Only label the moment when it differs from the line
                        // above; repeating one header verbatim reads as noise.
                        const prev = i > 0 ? [q.events[i - 1].when, q.events[i - 1].state].filter(Boolean).join(" — ").toUpperCase() : null;
                        return (
                          <li key={i} style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55 }}>
                            {head !== prev && (
                              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.8, color: T.textDim, display: "block" }}>{head}</span>
                            )}
                            {e.text}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 4 }}>
                      {q.leadingScorer ? `${q.leadingScorer.name} led the period with ${q.leadingScorer.pts}.` : "An even period with no decisive stretch."}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enhanced analysis. When the external provider cannot deliver a
            validated recap this shows the deterministic expanded analysis
            instead of an empty panel, and says which one it is. */}
        {sim.expandedAnalysis && narrativeStatus !== "complete" && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>EXPANDED GAME ANALYSIS</div>
            <div style={{ display: "grid", gap: 10, marginTop: 7 }}>
              {sim.expandedAnalysis.sections.map((sec) => (
                <div key={sec.heading}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>{sec.heading}</div>
                  <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, marginTop: 2 }}>{sec.body}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>
              Built from this game's own record — not AI-assisted.
            </div>
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
            <span>Enhanced analysis couldn't be completed. {persisted ? "Your result is saved." : "Your result is shown from the game engine."} The full story above comes from the game itself.</span>
            {onRetryNarrative && (
              <button onClick={onRetryNarrative} style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 800, borderRadius: 7, border: `1px solid ${T.goldBorder}`, background: "transparent", color: T.gold, cursor: "pointer" }}>
                Try Enhanced Recap Again
              </button>
            )}
          </div>
        )}
        {/* A terminal state that retrying cannot fix. Offering a retry button
            here would be a lie, so it is not offered. */}
        {narrativeStatus === "unavailable" && (
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: T.bgCardHover, border: `1px solid ${T.border}`, fontSize: 12, color: T.textDim }}>
            Enhanced analysis is switched off right now. Everything above is the game's own record of what happened.
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
        </>}

        {section === "coaching" && <>
        <CoachingStrategy coaching={sim.v3?.coaching} eraLabel={sim.eraLabel || sim.eraId} eraImpact={sim.eraImpact} />
        {/* The stored pregame read, near the bottom and never leading. */}
        <StoredPregameRead pregame={sim.pregame} />
        {/* The draft-shaped postgame section was removed in Phase 8B at the
            owner's direction. The underlying draft history is still stored on
            the result for replay, same-seed challenges and analytics. */}
        </>}

        {/* L. Actions — never a dead end, visible from every section */}
        <CTAs mode={mode} won={won} previewCandidate={sim.previewCandidate}
          onRematch={onRematch} onBest7={onBest7} onChallenge={onChallenge}
          onSwap={onSwap} onShare={onShare} onLeaderboard={onLeaderboard} />
      </div>
    </div>
  );
}
