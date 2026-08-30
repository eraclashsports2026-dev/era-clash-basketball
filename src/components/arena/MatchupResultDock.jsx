// ── Matchup / Result Dock ────────────────────────────────────────────────────
// One persistent right-hand surface that changes state without ever navigating
// the user away from the matchup they built:
//
//   A pre-draft · B active draft · C outlook · D simulating · E final result
//
// Every value comes from real state — the live chaos run, or the STORED result
// that the full Postgame also reads. Nothing here is sample data.
import { useState } from "react";
import { T } from "../../theme.js";
import EraContextBanner from "../chaos/EraContextBanner.jsx";

const TABS = [
  ["story", "Game Story"],
  ["box", "Box Score"],
  ["coaching", "Coaching"],
  ["analysis", "Analysis"],
];

const Panel = ({ children, style }) => (
  <div className="ec-panel ec-panel-raised" style={{ padding: 14, ...style }}>{children}</div>
);
const Head = ({ children, tone }) => (
  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: tone || "var(--ec-a-text-muted, #93a0b5)" }}>{children}</div>
);
const Row = ({ k, v, tone }) => (
  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, padding: "4px 0", fontSize: 12.5, alignItems: "baseline" }}>
    <span style={{ color: "var(--ec-a-text-muted, #93a0b5)" }}>{k}</span>
    <span style={{ color: tone || "var(--ec-a-text, #f5f7fb)", fontWeight: 700, textAlign: "right" }}>{v}</span>
  </div>
);

/** D — real progress phases, never a fabricated percentage. */
const SIM_PHASES = ["Preparing matchup", "Building game plans", "Simulating possessions", "Finalizing result", "Preparing postgame"];

function CompactBox({ sim }) {
  const box = sim?.v3?.fullBox;
  if (!box) return <div style={muted}>A full box score is not available for this result.</div>;
  const line = (l, accent) => (
    <div key={l.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 34px 52px 34px", gap: 6, fontSize: 12, padding: "3px 0", fontVariantNumeric: "tabular-nums" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ec-a-text, #f5f7fb)" }}>{l.name}</span>
      <span style={{ textAlign: "right", fontWeight: 800, color: accent }}>{l.pts}</span>
      <span style={{ textAlign: "right", color: "var(--ec-a-text-muted, #93a0b5)", whiteSpace: "nowrap" }}>{l.fgm}-{l.fga}</span>
      <span style={{ textAlign: "right", color: "var(--ec-a-text-muted, #93a0b5)" }}>{l.oreb + l.dreb}</span>
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 34px 52px 34px", gap: 6, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, color: "var(--ec-a-text-muted, #93a0b5)", paddingBottom: 4 }}>
        <span>PLAYER</span><span style={{ textAlign: "right" }}>PTS</span><span style={{ textAlign: "right" }}>FG</span><span style={{ textAlign: "right" }}>REB</span>
      </div>
      <Head tone="var(--ec-a-gold, #f2b51d)">TEAM GOLD</Head>
      {box.gold.map((l) => line(l, "var(--ec-a-gold, #f2b51d)"))}
      <div style={{ height: 8 }} />
      <Head tone="var(--ec-a-blue, #3b9bff)">TEAM BLUE</Head>
      {box.blue.map((l) => line(l, "var(--ec-a-blue, #3b9bff)"))}
      <div style={{ ...muted, marginTop: 8 }}>Full shooting, steals, blocks and turnovers are in the complete report.</div>
    </div>
  );
}

export default function MatchupResultDock({
  phase, run, result, simStage, onViewFullReport, onRunItBack, onNewClash, onChallenge, busy,
}) {
  const [tab, setTab] = useState("story");
  const [challengeId, setChallengeId] = useState(null);
  const makeChallenge = async () => {
    if (!onChallenge) return;
    try { setChallengeId(await onChallenge()); } catch { /* a failed share never breaks the result */ }
  };
  const sim = result?.sim;

  // ── E · FINAL RESULT ──────────────────────────────────────────────────────
  if (phase === "complete" && sim) {
    const won = result.w;
    const gold = sim.finalScore?.gold ?? 0, blue = sim.finalScore?.blue ?? 0;
    const winner = gold > blue ? "Gold" : "Blue";
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Panel style={{ textAlign: "center", borderColor: won ? "var(--ec-a-gold-line)" : "var(--ec-a-blue-line)" }}>
          <Head tone={won ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-blue, #3b9bff)"}>FINAL SCORE</Head>
          <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 1, margin: "3px 0 8px", color: "var(--ec-a-text, #f5f7fb)" }}>
            {won ? "YOU WON" : `TEAM ${winner.toUpperCase()} WINS`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: "var(--ec-a-gold, #f2b51d)" }}>GOLD</div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 38, fontWeight: 900, lineHeight: 1, color: "var(--ec-a-text, #f5f7fb)" }}>{gold}</div>
            </div>
            <div style={{ fontSize: 10, letterSpacing: 1.6, color: "var(--ec-a-text-muted, #93a0b5)", fontWeight: 900 }}>FINAL</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: "var(--ec-a-blue, #3b9bff)" }}>BLUE</div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 38, fontWeight: 900, lineHeight: 1, color: "var(--ec-a-text, #f5f7fb)" }}>{blue}</div>
            </div>
          </div>
        </Panel>

        <div role="tablist" aria-label="Result sections" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 4 }}>
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{
              minHeight: 40, borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800,
              border: `1px solid ${tab === id ? "var(--ec-a-gold-line)" : "var(--ec-a-border)"}`,
              background: tab === id ? "var(--ec-a-gold-soft)" : "transparent",
              color: tab === id ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-text-secondary, #c3cddd)",
            }}>{label}</button>
          ))}
        </div>

        <Panel>
          {tab === "story" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <Head>{(sim.story?.headline || `How ${winner} won`).toUpperCase()}</Head>
                <p style={{ ...body, margin: "5px 0 0" }}>{sim.story?.body || sim.summary}</p>
              </div>
              {sim.v3?.periodScores?.length > 0 && (
                <div>
                  <Head>BY QUARTER</Head>
                  <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${sim.v3.periodScores.length}, minmax(0,1fr)) 40px`, gap: 4, marginTop: 5, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: "var(--ec-a-text-muted)" }} />
                    {sim.v3.periodScores.map((p, i) => <span key={i} style={{ textAlign: "center", color: "var(--ec-a-text-muted)", fontSize: 10, fontWeight: 900 }}>Q{i + 1}</span>)}
                    <span style={{ textAlign: "right", color: "var(--ec-a-text-muted)", fontSize: 10, fontWeight: 900 }}>T</span>
                    <span style={{ color: "var(--ec-a-gold, #f2b51d)", fontWeight: 900, fontSize: 11 }}>GOLD</span>
                    {sim.v3.periodScores.map((p, i) => <span key={i} style={{ textAlign: "center" }}>{p.gold}</span>)}
                    <span style={{ textAlign: "right", fontWeight: 900, color: "var(--ec-a-gold, #f2b51d)" }}>{gold}</span>
                    <span style={{ color: "var(--ec-a-blue, #3b9bff)", fontWeight: 900, fontSize: 11 }}>BLUE</span>
                    {sim.v3.periodScores.map((p, i) => <span key={i} style={{ textAlign: "center" }}>{p.blue}</span>)}
                    <span style={{ textAlign: "right", fontWeight: 900, color: "var(--ec-a-blue, #3b9bff)" }}>{blue}</span>
                  </div>
                </div>
              )}
              {sim.v3?.keyMoments?.length > 0 && (
                <div>
                  <Head>KEY MOMENTS</Head>
                  <ul style={{ margin: "5px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
                    {sim.v3.keyMoments.slice(0, 3).map((m, i) => (
                      <li key={i} style={{ ...body, display: "grid", gridTemplateColumns: "42px minmax(0,1fr)", gap: 6 }}>
                        <span style={{ color: "var(--ec-a-gold, #f2b51d)", fontWeight: 900, fontSize: 10.5 }}>{m.period}</span>
                        <span>{m.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sim.mvp && <Row k="Game MVP" v={sim.mvp} />}
              {sim.eraImpact && <div style={{ ...muted, lineHeight: 1.55 }}>{sim.eraImpact}</div>}
            </div>
          )}

          {tab === "box" && <CompactBox sim={sim} />}

          {tab === "coaching" && (
            <div style={{ display: "grid", gap: 10 }}>
              {["gold", "blue"].map((side) => {
                const c = sim.v3?.coaching?.[side];
                if (!c) return null;
                return (
                  <div key={side}>
                    <Head tone={side === "gold" ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-blue, #3b9bff)"}>
                      TEAM {side.toUpperCase()} · {c.coach}
                    </Head>
                    <p style={{ ...body, margin: "4px 0 0" }}>
                      {c.openingPlan?.actions?.[0] ? `Opened in ${c.openingPlan.actions[0].action.toLowerCase()}.` : ""}
                      {c.defense?.shell ? ` ${c.defense.shell}.` : ""}
                    </p>
                    {c.adjustments?.[0] && <p style={{ ...muted, margin: "4px 0 0", lineHeight: 1.5 }}>{c.adjustments[0].text}</p>}
                  </div>
                );
              })}
              {!sim.v3?.coaching && <div style={muted}>Coaching detail is recorded by the preview simulation.</div>}
            </div>
          )}

          {tab === "analysis" && (
            <div style={{ display: "grid", gap: 8 }}>
              {(sim.expandedAnalysis?.sections || []).slice(0, 4).map((s) => (
                <div key={s.heading}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ec-a-text, #f5f7fb)" }}>{s.heading}</div>
                  <div style={{ ...muted, lineHeight: 1.55, marginTop: 2 }}>{s.body}</div>
                </div>
              ))}
              {!sim.expandedAnalysis && <div style={muted}>Analysis is being prepared.</div>}
              {sim.expandedAnalysis && (
                <div style={{ ...muted, fontSize: 10.5, marginTop: 2 }}>
                  Built from this game's own record — not AI-assisted.
                </div>
              )}
            </div>
          )}
        </Panel>

        <button onClick={onViewFullReport} style={primaryCta}>VIEW FULL POSTGAME REPORT →</button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <button onClick={onRunItBack} style={secondaryCta}>Run it back</button>
          <button onClick={onNewClash} style={secondaryCta}>New Chaos Clash</button>
        </div>
        {onChallenge && !challengeId && (
          <button onClick={makeChallenge} style={secondaryCta}>Challenge this Chaos</button>
        )}
        {challengeId && (
          <div style={{ ...muted, textAlign: "center", lineHeight: 1.5, wordBreak: "break-all" }}>
            Same opening rolls, their own decisions:{" "}
            <span style={{ color: "var(--ec-a-gold, #f2b51d)" }}>{`${window.location.origin}/?chaos=${challengeId}`}</span>
          </div>
        )}
      </div>
    );
  }

  // ── D · SIMULATING ────────────────────────────────────────────────────────
  if (phase === "simulating") {
    const idx = Math.max(0, SIM_PHASES.findIndex((p) => p.toLowerCase().startsWith(String(simStage || "").toLowerCase().slice(0, 6))));
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Panel>
          <Head tone="var(--ec-a-gold, #f2b51d)">SIMULATING THE CLASH</Head>
          <div aria-live="polite" style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {SIM_PHASES.map((p, i) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: i <= idx ? "var(--ec-a-text, #f5f7fb)" : "var(--ec-a-text-muted, #93a0b5)" }}>
                <span aria-hidden="true" style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: i < idx ? "var(--ec-a-green, #4ade80)" : i === idx ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-border-strong)",
                }} />
                {p}
              </div>
            ))}
          </div>
        </Panel>
        {run?.eraContext && <EraContextBanner era={run.eraContext} compact />}
        <Panel><div style={muted}>Your five and the Legend CPU's five are locked. The possession engine is playing it out.</div></Panel>
      </div>
    );
  }

  // ── C · ROSTERS AND COACHES LOCKED — MATCHUP OUTLOOK ──────────────────────
  if (run && (run.phase === "READY" || run.coachDraft?.selecting)) {
    const g = run.gold?.analysis, b = run.blue?.analysis;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Panel>
          <Head tone="var(--ec-a-gold, #f2b51d)">MATCHUP OUTLOOK</Head>
          <div style={{ marginTop: 6 }}>
            <Row k="Your best advantage" v={g?.bestStrength?.label ?? "—"} />
            <Row k="Your greatest risk" v={g?.biggestRisk?.label ?? "—"} />
            <Row k="Matchup to watch" v={b?.bestStrength?.label ?? "—"} />
            <Row k="Talent" v={`${g?.talentTier ?? "—"} vs ${b?.talentTier ?? "—"}`} />
            <Row k="Construction" v={`${g?.constructionTier ?? "—"} vs ${b?.constructionTier ?? "—"}`} />
            <Row k="Opponent matchup" v={g?.opponentMatchup ?? "—"} />
          </div>
          <div style={{ ...muted, marginTop: 6, lineHeight: 1.5 }}>
            A read, not a prediction. The game decides it.
          </div>
        </Panel>
        {run.eraContext && <EraContextBanner era={run.eraContext} compact />}
      </div>
    );
  }

  // ── B · ACTIVE DRAFT ──────────────────────────────────────────────────────
  if (run) {
    const g = run.gold?.analysis, b = run.blue?.analysis;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Panel>
          <Head tone="var(--ec-a-gold, #f2b51d)">YOUR CLASH SO FAR</Head>
          <div style={{ marginTop: 6 }}>
            <Row k="Best strength" v={g?.bestStrength?.label ?? "—"} />
            <Row k="Biggest risk" v={g?.biggestRisk?.label ?? "—"} />
            <Row k="Construction" v={g?.constructionTier ?? "—"} />
            <Row k="CPU strength" v={b?.bestStrength?.label ?? "—"} />
            <Row k="Draft pressure" v={run.draftPressure?.level ?? "—"}
              tone={run.draftPressure?.level === "HIGH" ? "var(--ec-a-gold, #f2b51d)" : undefined} />
          </div>
        </Panel>
        <EraContextBanner era={run.eraContext} compact />
      </div>
    );
  }

  // ── A · PRE-DRAFT ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Panel style={{ textAlign: "center" }}>
        <Head tone="var(--ec-a-gold, #f2b51d)">BUILD YOUR CLASH</Head>
        <div style={{ ...body, marginTop: 6 }}>Roll your first five to begin.</div>
        <div style={{ ...muted, marginTop: 8, lineHeight: 1.5 }}>
          Three rolls. Hold the legends you want, release the rest, and adapt when the era is revealed.
        </div>
      </Panel>
      <EraContextBanner era={null} />
    </div>
  );
}

const body = { fontSize: 12.5, color: "var(--ec-a-text-secondary, #c3cddd)", lineHeight: 1.6 };
const muted = { fontSize: 11.5, color: "var(--ec-a-text-muted, #93a0b5)" };
const primaryCta = {
  minHeight: 48, width: "100%", borderRadius: 10, cursor: "pointer",
  fontWeight: 900, fontSize: 13, letterSpacing: 0.8,
  border: "1px solid var(--ec-a-gold-line)", background: "var(--ec-a-gold, #f2b51d)", color: "#0a0f18",
};
const secondaryCta = {
  minHeight: 44, width: "100%", borderRadius: 10, cursor: "pointer",
  fontWeight: 800, fontSize: 12, border: "1px solid var(--ec-a-border)",
  background: "transparent", color: "var(--ec-a-text-secondary, #c3cddd)",
};
