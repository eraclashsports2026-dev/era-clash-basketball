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
import { useEffect, useState } from "react";
import ChaosStage from "./ChaosStage.jsx";
import LiveIntel from "./LiveIntel.jsx";
import ResultDock from "./ResultDock.jsx";
import UtilityBar from "./UtilityBar.jsx";
import ModeShelf from "./ModeShelf.jsx";

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
  activeModeId, onModeAction, previewCandidateActive, busy, error,
}) {
  const compact = useCompact();
  const finished = phase === "complete" || phase === "simulating";

  return (
    <div className="ec-ta">
      <div className="ec-ta-main">
        <ChaosStage
          run={chaosRun} tier={tier} challengeId={challengeId}
          onRunChange={onRunChange} onReady={onReady} onGated={onGated}
          onRunClash={onRunClash} phase={phase} busy={busy} error={error} />

        <UtilityBar eraState={chaosRun?.eraState} compact={compact}
          onGuide={onGuide} onSettings={onSettings} onMembership={onMembership} />

        <ModeShelf tier={tier} activeModeId={activeModeId} onModeAction={onModeAction}
          previewCandidateActive={previewCandidateActive} />
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
