// ── Simulation loading — the arena holds its breath ───────────────────────────
// Cinematic composition from the loading concepts: the matchup header (teams,
// coaches, era), the EC mark, a REAL phase checklist driven by simClient's
// onStage lifecycle (never fake timed percentages), and one basketball tip.
// Reduced-motion users get a static presentation.
import { useMemo } from "react";
import { T, S, R, FONT } from "../theme.js";

// The real lifecycle phases the client reports (gameClient onStage strings map
// into these buckets); Win 82 / Tournament add genuine game-count progress.
const PHASES = [
  ["prepare", "Preparing matchup"],
  ["plans", "Building game plans"],
  ["simulate", "Simulating possessions"],
  ["finalize", "Finalizing result"],
];
const phaseIndex = (stage) => {
  const s = String(stage || "").toLowerCase();
  if (!s || /valid|prepar|match/.test(s)) return 0;
  if (/plan|coach|read/.test(s)) return 1;
  if (/simulat|possess|running|game/.test(s)) return 2;
  return 3;
};

const TIPS = [
  "Spacing is gravity: every shooter you add pulls a defender away from the rim.",
  "A coach can only amplify what a roster already does — hire for fit, not fame.",
  "Eras without a three-point line make every deep shot worth two. Build accordingly.",
  "Rebounding wins possessions; possessions win close games.",
  "Two stars who need the ball is one star too many — someone has to screen and cut.",
];

export default function SimulationLoading({ stage, progress, goldLabel = "TEAM GOLD", blueLabel = "TEAM BLUE", coachGold, coachBlue, eraLabel }) {
  const active = phaseIndex(stage);
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);
  return (
    <div className="rise" role="status" aria-live="polite" style={{
      marginTop: 14, padding: "34px 22px", borderRadius: R.xl, textAlign: "center",
      background: "radial-gradient(ellipse at 20% 0%, rgba(253,185,39,0.07), transparent 45%), radial-gradient(ellipse at 80% 0%, rgba(110,168,254,0.07), transparent 45%), linear-gradient(180deg, rgba(6,8,16,0.92), rgba(13,17,28,0.88))",
      border: `1px solid ${T.border}`, boxShadow: T.shadowCard,
    }}>
      <div style={{ fontSize: 10, letterSpacing: 4, color: T.textDim, fontWeight: 800 }}>
        ERA<span style={{ color: T.gold }}>CLASH</span> · SIMULATION IN PROGRESS
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, margin: "18px 0 4px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, fontStyle: "italic", color: T.gold, letterSpacing: 1, fontFamily: FONT.display }}>{goldLabel}</div>
          {coachGold && <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 2 }}>Coach {coachGold}</div>}
        </div>
        <div aria-hidden="true" style={{
          width: 54, height: 54, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px solid ${T.goldBorder}`, boxShadow: `${T.glowGold}, ${T.glowBlue}`,
          fontFamily: FONT.display, fontWeight: 900, fontStyle: "italic", fontSize: 18,
          background: "rgba(0,0,0,0.4)",
        }}>
          <span style={{ color: T.gold }}>E</span><span style={{ color: T.blue }}>C</span>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, fontStyle: "italic", color: T.blue, letterSpacing: 1, fontFamily: FONT.display }}>{blueLabel}</div>
          {coachBlue && <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 2 }}>Coach {coachBlue}</div>}
        </div>
      </div>
      {eraLabel && <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>🕰️ {eraLabel} Era Style</div>}

      <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 16px" }}>
        <div className="sim-spinner" aria-hidden="true" />
      </div>

      {/* Real phase checklist */}
      <ol style={{ listStyle: "none", padding: 0, margin: "0 auto", maxWidth: 300, textAlign: "left" }}>
        {PHASES.map(([id, label], i) => (
          <li key={id} aria-current={i === active ? "step" : undefined} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "5px 0",
            fontSize: 12.5, fontWeight: i === active ? 800 : 500,
            color: i < active ? T.green : i === active ? T.text : T.textMuted,
          }}>
            <span aria-hidden="true" style={{ width: 16, textAlign: "center" }}>{i < active ? "✓" : i === active ? "▸" : "·"}</span>
            {label}{i === active && stage && !/^(Preparing|Building|Simulating|Finalizing)/.test(stage) ? ` — ${stage}` : ""}
          </li>
        ))}
      </ol>

      {progress && (
        <div style={{ maxWidth: 420, margin: "14px auto 0" }}>
          <div style={{ height: 7, background: T.border, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(progress.done / progress.total) * 100}%`, background: `linear-gradient(90deg, ${T.gold}, #ffd76a)`, transition: "width .3s" }} />
          </div>
          <div style={{ fontSize: 12, color: T.gold, marginTop: 8, fontWeight: 800 }}>
            {progress.label ? `${progress.label} — ` : ""}{progress.unit || "game"} {progress.done}/{progress.total} · {progress.wins} wins so far
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11.5, color: T.textDim, maxWidth: 420, marginLeft: "auto", marginRight: "auto", lineHeight: 1.55 }}>
        <span style={{ color: T.gold, fontWeight: 800 }}>TIP · </span>{tip}
      </div>
    </div>
  );
}
