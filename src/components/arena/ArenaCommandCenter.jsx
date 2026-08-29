// ── Arena Command Center ─────────────────────────────────────────────────────
// One persistent workspace. The draft lives on the left, the Matchup/Result
// Dock lives on the right, and the result appears in the dock WITHOUT taking
// the user away from the teams, coaches and era they just built.
import { useState } from "react";
import ChaosClash from "../chaos/ChaosClash.jsx";
import EraContextBanner from "../chaos/EraContextBanner.jsx";
import MatchupResultDock from "./MatchupResultDock.jsx";
import ModeShelf from "./ModeShelf.jsx";
import RollStrip from "./RollStrip.jsx";

/** A locked, non-interactive summary of what was drafted, shown after the run. */
function LockedSummary({ run }) {
  if (!run) return null;
  const side = (label, roster, accent) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, color: accent, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "grid", gap: 4 }}>
        {(roster || []).filter(Boolean).map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 8, fontSize: 12.5, alignItems: "baseline" }}>
            <span style={{ color: "var(--ec-a-text-muted, #93a0b5)", fontWeight: 800, fontSize: 10.5 }}>{c.slot}</span>
            <span style={{ color: "var(--ec-a-text, #f5f7fb)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="ec-panel" style={{ padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-text-muted, #93a0b5)", marginBottom: 10 }}>
        THE MATCHUP YOU BUILT
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {side("TEAM GOLD · YOUR PICKS", run.gold?.roster, "var(--ec-a-gold, #f2b51d)")}
        {side("TEAM BLUE · LEGEND CPU", run.blue?.roster, "var(--ec-a-blue, #3b9bff)")}
      </div>
      {run.selectedCoaches && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--ec-a-border)", fontSize: 12.5, color: "var(--ec-a-text-secondary, #c3cddd)" }}>
          Coaches locked for this Clash.
        </div>
      )}
    </div>
  );
}

export default function ArenaCommandCenter({
  tier, challengeId, chaosRun, onRunChange, onReady, onGated,
  phase, result, simStage, onRunClash, onViewFullReport, onRunItBack, onNewClash,
  activeModeId, onModeAction, previewCandidateActive, busy, error,
}) {
  const complete = phase === "complete";
  const simulating = phase === "simulating";
  return (
    <div style={{ maxWidth: 1560, margin: "0 auto", padding: "14px 16px 28px" }}>
      <div className="ec-cc">
        {/* ── Main arena workspace ─────────────────────────────────────────── */}
        <div style={{ minWidth: 0, display: "grid", gap: 14 }}>
          {chaosRun?.eraContext && (
            <EraContextBanner era={chaosRun.eraContext} />
          )}

          {!complete && !simulating && (
            <>
              <RollStrip run={chaosRun} />
              {/* The shell owns the primary CTA at READY so it sits ABOVE the
                  secondary actions rather than below them. */}
              {chaosRun?.phase === "READY" && (
                <>
                  <button onClick={onRunClash} disabled={busy} style={{
                    minHeight: 58, width: "100%", borderRadius: 12, cursor: busy ? "default" : "pointer",
                    fontWeight: 900, fontSize: 16, letterSpacing: 1.2,
                    border: "1px solid var(--ec-a-gold-line)", background: "var(--ec-a-gold, #f2b51d)",
                    color: "#0a0f18", opacity: busy ? 0.6 : 1,
                  }}>{busy ? "RUNNING…" : "RUN THE CLASH"}</button>
                  {error && <div role="alert" style={{ color: "var(--ec-a-red, #f87171)", fontSize: 13, textAlign: "center" }}>{error}</div>}
                </>
              )}
              <ChaosClash
                tier={tier} challengeId={challengeId}
                onRunChange={onRunChange} onReady={onReady} onGated={onGated}
                hideEraBanner hideReadyBlock={chaosRun?.phase === "READY"}
              />
            </>
          )}

          {(complete || simulating) && <LockedSummary run={chaosRun} />}

          <ModeShelf tier={tier} activeModeId={activeModeId} onModeAction={onModeAction}
            previewCandidateActive={previewCandidateActive} />
        </div>

        {/* ── Matchup / Result Dock ────────────────────────────────────────── */}
        <aside className="ec-cc-dock" aria-label="Matchup and result">
          <MatchupResultDock
            phase={phase} run={chaosRun} result={result} simStage={simStage}
            onViewFullReport={onViewFullReport} onRunItBack={onRunItBack} onNewClash={onNewClash}
            busy={busy} />
        </aside>
      </div>
    </div>
  );
}
