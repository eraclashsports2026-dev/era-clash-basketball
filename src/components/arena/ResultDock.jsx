// ── The Result Dock ──────────────────────────────────────────────────────────
// One persistent right-hand surface that changes state without ever navigating
// the user away from the matchup they built:
//
//   A no result yet · B the PREVIOUS clash · C simulating · D this clash
//
// Every value comes from real state — the live chaos run, or the STORED result
// that the full Postgame reads. Nothing here is sample data, and a previous
// result is always labelled as one: it must never read as the draft on screen.
import { useState, useEffect, useRef } from "react";

const TABS = [
  ["story", "Game Story"],
  ["box", "Box Score"],
  ["coaching", "Coaching"],
  ["analysis", "Analysis"],
];

const Panel = ({ children, style, ...rest }) => (
  <div className="ec-panel ec-panel-raised" style={{ padding: 14, ...style }} {...rest}>{children}</div>
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

// Every counting stat the result records. Only the made-attempted splits (3PT,
// FT) and the offensive/defensive rebound breakdown are left to the full
// report, which has the width to show them without a scroll.
const BOX_COLS = "minmax(62px, 1fr) 26px 44px 26px 26px 26px 26px 26px";
const BOX_HEADS = ["PTS", "FG", "REB", "AST", "STL", "BLK", "TO"];
const boxValues = (l) => [l.pts, `${l.fgm}-${l.fga}`, l.oreb + l.dreb, l.ast, l.stl, l.blk, l.to];

function CompactBox({ sim }) {
  const box = sim?.v3?.fullBox;
  if (!box) return <div style={muted}>A full box score is not available for this result.</div>;
  const line = (l, accent) => (
    <div key={l.name} style={{ display: "grid", gridTemplateColumns: BOX_COLS, gap: 5, fontSize: 11.5, padding: "3px 0", fontVariantNumeric: "tabular-nums" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ec-a-text, #f5f7fb)" }}>{l.name}</span>
      {boxValues(l).map((v, i) => (
        <span key={BOX_HEADS[i]} style={{
          textAlign: "right", whiteSpace: "nowrap", fontWeight: i === 0 ? 800 : 400,
          color: i === 0 ? accent : "var(--ec-a-text-muted, #93a0b5)",
        }}>{v}</span>
      ))}
    </div>
  );
  return (
    <div className="ec-dock-box">
      {/* The numbers scroll inside the dock rather than compressing a stat
          column until "12-30" breaks across two lines. */}
      <div style={{ minWidth: 292 }}>
        <div style={{ display: "grid", gridTemplateColumns: BOX_COLS, gap: 5, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.4, color: "var(--ec-a-text-muted, #93a0b5)", paddingBottom: 4 }}>
          <span>PLAYER</span>
          {BOX_HEADS.map((h) => <span key={h} style={{ textAlign: "right" }}>{h}</span>)}
        </div>
        <Head tone="var(--ec-a-gold, #f2b51d)">TEAM GOLD</Head>
        {box.gold.map((l) => line(l, "var(--ec-a-gold, #f2b51d)"))}
        <div style={{ height: 8 }} />
        <Head tone="var(--ec-a-blue, #3b9bff)">TEAM BLUE</Head>
        {box.blue.map((l) => line(l, "var(--ec-a-blue, #3b9bff)"))}
        <div style={{ ...muted, marginTop: 8 }}>Three-point, free-throw and rebound splits are in the complete report.</div>
      </div>
    </div>
  );
}

/**
 * The MVP's line, from the stat object the engine records. Counters that were
 * zero are left out rather than printed as "0 BLK".
 */
export const statLine = (line) => {
  if (!line || typeof line !== "object") return null;
  const parts = [["PTS", line.pts], ["REB", line.reb], ["AST", line.ast], ["STL", line.stl], ["BLK", line.blk]]
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${v} ${k}`);
  return parts.length ? parts.join(" · ") : null;
};

/** "3 minutes ago" — coarse on purpose, and never a fabricated precision. */
export const agoLabel = (at, now = Date.now()) => {
  if (!at) return null;
  const secs = Math.max(0, Math.floor((now - at) / 1000));
  if (secs < 45) return "JUST NOW";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} MINUTE${mins === 1 ? "" : "S"} AGO`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} HOUR${hours === 1 ? "" : "S"} AGO`;
  return "EARLIER TODAY";
};

const DockShell = ({ children, label }) => (
  <div style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span aria-hidden="true" style={{ fontSize: 12 }}>🏆</span>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-text)" }}>RESULT DOCK</div>
      {label && (
        <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "var(--ec-a-text-muted)" }}>
          {label}
        </span>
      )}
    </div>
    {children}
  </div>
);

export default function ResultDock({
  phase, run, result, priorResult, priorAt, simStage,
  onViewFullReport, onRunItBack, onNewClash, onChallenge, busy,
}) {
  // No section is open in the canonical reference state — the summary and four
  // tab controls fit the first viewport, and the frozen 8C.1 geometry contract
  // measures exactly that. The Story leads a game that has JUST finished
  // (Phase 9A): when the dock moves from simulating to complete, the Story opens
  // and the other three sections stay one tap away. A stored or reloaded result
  // keeps the reference's closed tabs.
  const [tab, setTab] = useState(null);
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current === "simulating" && phase === "complete") setTab("story");
    prevPhase.current = phase;
  }, [phase]);
  const [, tick] = useState(0);
  // The "minutes ago" label would otherwise freeze at whatever it said when the
  // dock last re-rendered.
  useEffect(() => {
    if (!priorAt || phase === "complete") return undefined;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [priorAt, phase]);
  const [challengeId, setChallengeId] = useState(null);
  // A share link belongs to ONE clash. Nothing remounts this dock between
  // clashes, so without this the next clash printed the previous clash's link
  // under "Same opening rolls" and suppressed its own Challenge button for the
  // rest of the session.
  useEffect(() => { setChallengeId(null); }, [run?.chaosRunId, result?.resultId]);
  const makeChallenge = async () => {
    if (!onChallenge) return;
    try { setChallengeId(await onChallenge()); } catch { /* a failed share never breaks the result */ }
  };
  const sim = result?.sim;

  // ── One clash, rendered the same way whether it is THIS one or the last one.
  const renderClash = (res, { previous = false } = {}) => {
    const sim = res.sim;
    const won = res.w;
    const gold = sim.finalScore?.gold ?? 0, blue = sim.finalScore?.blue ?? 0;
    const winner = gold > blue ? "Gold" : "Blue";
    return (
      <DockShell label={previous ? agoLabel(priorAt) : "THIS CLASH"}>
        <Panel style={{ textAlign: "center", padding: "11px 12px", borderColor: won ? "var(--ec-a-gold-line)" : "var(--ec-a-blue-line)" }}>
          <Head tone={won ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-blue, #3b9bff)"}>
            {previous ? "LAST CLASH · NOT THE DRAFT ON SCREEN" : "FINAL SCORE"}
          </Head>
          <div style={{ fontWeight: 900, fontSize: 14.5, letterSpacing: 1, margin: "2px 0 6px", color: "var(--ec-a-text, #f5f7fb)" }}>
            {won ? "YOU WON" : `TEAM ${winner.toUpperCase()} WINS`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: "var(--ec-a-gold, #f2b51d)" }}>GOLD</div>
              <div className="ec-dock-score">{gold}</div>
            </div>
            <div style={{ fontSize: 10, letterSpacing: 1.6, color: "var(--ec-a-text-muted, #93a0b5)", fontWeight: 900 }}>FINAL</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: "var(--ec-a-blue, #3b9bff)" }}>BLUE</div>
              <div className="ec-dock-score">{blue}</div>
            </div>
          </div>
          {(sim.mvp || sim.v3?.eraStyleId || res.record?.eraId) && (
            <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid var(--ec-a-border)", display: "grid", gap: 2 }}>
              {sim.mvp && (
                <>
                  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: "var(--ec-a-text-muted)" }}>MVP</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ec-a-text)" }}>{sim.mvp}</div>
                  {statLine(sim.mvpLine) && <div style={muted}>{statLine(sim.mvpLine)}</div>}
                </>
              )}
              {(res.record?.eraId || sim.v3?.eraStyleId) && (
                <div style={{ ...muted, marginTop: sim.mvp ? 4 : 0 }}>
                  {res.record?.eraId || sim.v3?.eraStyleId} era{res.record?.eraCustom ? " · custom" : ""}
                </div>
              )}
            </div>
          )}
        </Panel>

        <div role="tablist" aria-label="Result sections" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 4 }}>
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} aria-controls="ec-dock-panel"
              onClick={() => setTab((t) => (t === id ? null : id))} style={{
              minHeight: 40, borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800,
              border: `1px solid ${tab === id ? "var(--ec-a-gold-line)" : "var(--ec-a-border)"}`,
              background: tab === id ? "var(--ec-a-gold-soft)" : "transparent",
              color: tab === id ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-text-secondary, #c3cddd)",
            }}>{label}</button>
          ))}
        </div>

        {/* No maxHeight and no overflow: an open section grows the page and the
            page scrolls, rather than hiding the back half of the story behind a
            scrollbar inside a scrollbar. */}
        {tab && (
        <Panel id="ec-dock-panel" role="tabpanel">
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
        )}

        <button onClick={() => onViewFullReport?.(previous ? res : null)} style={primaryCta}>
          VIEW FULL REPORT →
        </button>
        {previous ? null : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button onClick={onRunItBack} style={secondaryCta}>Run it back</button>
              <button onClick={onNewClash} style={secondaryCta}>New Chaos Clash</button>
            </div>
            {/* Two very different buttons. Without this line, a rematch's
                repeated era reads as an era that never changes. */}
            <div style={{ ...muted, textAlign: "center", lineHeight: 1.5 }}>
              Run it back replays this same five, staff and era. A new Clash rolls fresh players and reveals a new era.
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
          </>
        )}
      </DockShell>
    );
  };

  // ── D · THIS clash, just finished ─────────────────────────────────────────
  if (phase === "complete" && sim) return renderClash(result);

  // ── C · SIMULATING ────────────────────────────────────────────────────────
  if (phase === "simulating") {
    const idx = Math.max(0, SIM_PHASES.findIndex((p) => p.toLowerCase().startsWith(String(simStage || "").toLowerCase().slice(0, 6))));
    return (
      <DockShell label="IN PROGRESS">
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
        <Panel><div style={muted}>Your five and the Legend Rival's five are locked. The possession engine is playing it out.</div></Panel>
      </DockShell>
    );
  }

  // ── B · THE PREVIOUS clash, while a new draft is on the board ─────────────
  // Labelled twice over, because the one thing this must never do is read as
  // the result of the draft the user is currently looking at.
  if (priorResult?.sim) return renderClash(priorResult, { previous: true });

  // ── A · NOTHING YET ───────────────────────────────────────────────────────
  return (
    <DockShell>
      <Panel style={{ textAlign: "center" }}>
        <Head tone="var(--ec-a-gold, #f2b51d)">YOUR RESULT WILL APPEAR HERE</Head>
        <div style={{ ...body, marginTop: 6 }}>
          {run ? "Finish the draft and run the sim." : "Roll your first five to begin."}
        </div>
        <div style={{ ...muted, marginTop: 8, lineHeight: 1.5 }}>
          The final score, the story, the box score, the coaching and the analysis all land right here —
          without leaving the arena you built.
        </div>
      </Panel>
    </DockShell>
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
