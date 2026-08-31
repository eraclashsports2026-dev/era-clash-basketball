// ── The Time Arena ───────────────────────────────────────────────────────────
// One persistent workspace for the whole Play experience:
//
//   draft → era reveal → hire → simulate → result → full report
//
// none of which navigates away from the five you built. The stage owns the
// left; Live Intel and the Result Dock own the right and stay put.
//
// On a phone the columns stack, and once a game has been played the result
// leads the page — a finished score buried under the board is a result nobody
// finds.
//
// There is no mode shelf here: a permanent rack of other modes under every
// draft competes with the game being played, and the Play and Fantasy menus
// already carry every mode.
import { useEffect, useState } from "react";
import ChaosStage from "./ChaosStage.jsx";
import LiveIntel from "./LiveIntel.jsx";
import ResultDock from "./ResultDock.jsx";
import UtilityBar from "./UtilityBar.jsx";

const useCompact = (max = 560) => {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(max-width: ${max}px)`);
    const sync = () => setCompact(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, [max]);
  return compact;
};

export default function TimeArena({
  tier, challengeId, chaosRun, onRunChange, onReady, onGated,
  phase, result, priorResult, priorAt, simStage,
  onRunClash, onViewFullReport, onRunItBack, onNewClash, onChallenge, onEraChange,
  onGuide, onSettings, onMembership,
  busy, error, resume = true,
}) {
  const compact = useCompact();
  // Leaving a draft is a utility, not part of the composition, so the control
  // lives in the utility bar and the stage owns the confirmation.
  const [abandonNonce, setAbandonNonce] = useState(0);
  const finished = phase === "complete" || phase === "simulating";

  return (
    <div className="ec-ta">
      <div className="ec-ta-main">
        <ChaosStage
          run={chaosRun} tier={tier} challengeId={challengeId} resume={resume}
          onRunChange={onRunChange} onReady={onReady} onGated={onGated}
          onRunClash={onRunClash} phase={phase} busy={busy} error={error}
          abandonNonce={abandonNonce} />

        <UtilityBar eraState={chaosRun?.eraState} compact={compact}
          canAbandon={!!chaosRun && phase === "draft"}
          onAbandon={() => setAbandonNonce((n) => n + 1)}
          onGuide={onGuide} onSettings={onSettings} onMembership={onMembership} />

      </div>

      <aside className={`ec-ta-rail${finished ? " ec-ta-rail--front" : ""}`} aria-label="Live intel and result">
        <LiveIntel run={chaosRun} onEraChange={onEraChange} onMembership={onMembership} />
        <ResultDock
          phase={phase} run={chaosRun} result={result}
          priorResult={priorResult} priorAt={priorAt} simStage={simStage}
          onViewFullReport={onViewFullReport} onRunItBack={onRunItBack}
          onNewClash={onNewClash} onChallenge={onChallenge} busy={busy} />
      </aside>
    </div>
  );
}
