// ── The Time Arena ───────────────────────────────────────────────────────────
// One persistent workspace for the whole Play experience:
//
//   draft → era reveal → hire → simulate → result → full report
//
// none of which navigates away from the five you built. Phase 9B.3 made that
// literal: the arena resolves ONE of six presentation states from the
// authoritative run (src/chaos/guidedState.js) and every surface reads it.
//
// The right rail is CONTEXTUAL. It carries the one piece of information the
// current decision needs — a short guide, a compact read of the five, the era,
// the finished roster read strategically, the matchup — and never five panels
// at once. A previous game is reachable through a compact LAST CLASH control
// and a sheet; it no longer sits as a full Result Dock beside an active draft.
// When THIS game has been simulated, the Result Dock renders the result as the
// hero of the main column, above the matchup that produced it.
//
// On a phone the columns stack, and once a game has been played the result
// leads the page — a finished score buried under the board is a result nobody
// finds. Starting over is a STAGE control, next to the board it throws away.
import { useEffect, useRef, useState } from "react";
import ChaosStage from "./ChaosStage.jsx";
import LiveIntel from "./LiveIntel.jsx";
import ResultDock, { agoLabel } from "./ResultDock.jsx";
import UtilityBar from "./UtilityBar.jsx";
import {
  GUIDED, resolveGuidedState, eraAcknowledged, acknowledgeEra, contextualPanel, showsPriorResult,
  GUIDED_EVENTS, stateViewEvent,
} from "./guidedState.js";
import { track } from "../../analytics.js";

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

/** State 1's contextual panel: how Chaos works, in the order it happens. Nothing else. */
function GuideCard({ onGuide }) {
  return (
    <section className="ec-intel ec-ta-guide" aria-label="How Chaos Clash works">
      <div className="ec-intel-head">
        <span aria-hidden="true" style={{ fontSize: 13 }}>🎲</span>
        <h2 className="ec-intel-heading">HOW CHAOS WORKS</h2>
      </div>
      <ol className="ec-ta-guide-steps">
        <li><b>ROLL</b> three times. Each roll offers a new five.</li>
        <li><b>HOLD</b> the legends you want. Released players are gone.</li>
        <li><b>ADAPT</b> when the era is revealed on Roll 2.</li>
        <li><b>CHOOSE</b> a coach once your five is set.</li>
        <li><b>RUN</b> the Clash and let history decide.</li>
      </ol>
      <button type="button" className="ec-intel-more" onClick={() => onGuide?.("play")}>HOW IT WORKS</button>
    </section>
  );
}

/** A previous game, one tap away and never mistakable for the draft on screen. */
function LastClash({ priorResult, priorAt, onOpen }) {
  const s = priorResult?.sim?.finalScore;
  if (!s) return null;
  return (
    <button type="button" className="ec-ta-lastclash" onClick={onOpen}
      aria-label={`Open your last Clash: Gold ${s.gold}, Blue ${s.blue}${agoLabel(priorAt) ? `, ${agoLabel(priorAt).toLowerCase()}` : ""}`}>
      <span className="ec-ta-lastclash-k">LAST CLASH</span>
      <span className="ec-ta-lastclash-v">
        <b style={{ color: "var(--ec-a-gold)" }}>{s.gold}</b>
        <span aria-hidden="true"> – </span>
        <b style={{ color: "var(--ec-a-blue)" }}>{s.blue}</b>
      </span>
      <span className="ec-ta-lastclash-ago">{agoLabel(priorAt) || ""}</span>
    </button>
  );
}

export default function TimeArena({
  tier, challengeId, chaosRun, onRunChange, onReady, onGated,
  phase, result, priorResult, priorAt, simStage,
  onRunClash, onViewFullReport, onRunItBack, onNewClash, onChallenge, onEraChange, onReset,
  onGuide, onSettings, onMembership,
  busy, error, resume = true,
}) {
  const compact = useCompact();
  // The one browser-side fact the resolver needs: has THIS run's era reveal
  // been seen. Read from storage each render; the tick forces a re-render when
  // the player continues.
  const [, ackTick] = useState(0);
  const runId = chaosRun?.chaosRunId || null;
  const ack = eraAcknowledged(runId);
  const state = resolveGuidedState({ run: chaosRun, phase, result, eraAcknowledged: ack });
  const [mobileTeam, setMobileTeam] = useState("gold");
  const [priorOpen, setPriorOpen] = useState(false);
  const finished = phase === "complete" || phase === "simulating";
  const panel = contextualPanel(state);
  const showPrior = showsPriorResult(state) && !!priorResult?.sim;

  // Telemetry: once per state TRANSITION, never per render.
  const prevState = useRef(null);
  useEffect(() => {
    if (prevState.current === state) return;
    prevState.current = state;
    const props = { state, roll: chaosRun?.roll ?? null, era_style: chaosRun?.eraState?.eraStyleId || null };
    track(GUIDED_EVENTS.STATE_VIEWED, props);
    const entry = stateViewEvent(state);
    if (entry) track(entry, props);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  // A fresh board shows Gold first on a phone.
  useEffect(() => { if (state === GUIDED.EMPTY) setMobileTeam("gold"); }, [state]);
  // The last-clash sheet closes on Escape and never survives into the result.
  useEffect(() => {
    if (!priorOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setPriorOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [priorOpen]);
  useEffect(() => { if (!showPrior) setPriorOpen(false); }, [showPrior]);

  const acknowledge = () => { acknowledgeEra(runId); ackTick((n) => n + 1); };

  return (
    <div className="ec-ta" data-guided-state={state}>
      <div className="ec-ta-main">
        <ChaosStage
          run={chaosRun} tier={tier} challengeId={challengeId} resume={resume}
          onRunChange={onRunChange} onReady={onReady} onGated={onGated}
          onRunClash={onRunClash} phase={phase} busy={busy} error={error} result={result}
          onReset={onReset}
          guidedState={state} onAcknowledgeEra={acknowledge} onGuide={onGuide}
          mobileTeam={mobileTeam} onMobileTeam={setMobileTeam} />

        {/* The Result: the score leads in the stage head above the matchup that
            produced it; the story, box score, coaching, analysis and the
            actions follow here, framed to the board's width. */}
        {state === GUIDED.RESULT && (
          <div className="ec-ta-result-hero">
            <ResultDock variant="hero"
              phase={phase} run={chaosRun} result={result}
              priorResult={null} priorAt={null} simStage={simStage}
              onViewFullReport={onViewFullReport} onRunItBack={onRunItBack}
              onNewClash={onNewClash} onChallenge={onChallenge} busy={busy} />
          </div>
        )}

        <UtilityBar eraState={chaosRun?.eraState} compact={compact} showEra={state !== GUIDED.EMPTY}
          onGuide={onGuide} onSettings={onSettings} />
      </div>

      {panel && (
        <aside className={`ec-ta-rail${finished ? " ec-ta-rail--front" : ""}`} aria-label="Live intel">
          {panel === "guide" && <GuideCard onGuide={onGuide} />}
          {panel === "intel-compact" && <LiveIntel run={chaosRun} compact onEraChange={onEraChange} onMembership={onMembership} />}
          {panel === "era" && <LiveIntel run={chaosRun} panel="era" onEraChange={onEraChange} onMembership={onMembership} />}
          {panel === "roster" && <LiveIntel run={chaosRun} panel="roster" />}
          {panel === "matchup" && <LiveIntel run={chaosRun} panel="matchup" />}
          {showPrior && <LastClash priorResult={priorResult} priorAt={priorAt} onOpen={() => setPriorOpen(true)} />}
        </aside>
      )}

      {priorOpen && showPrior && (
        <div className="ec-sheet-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPriorOpen(false); }}>
          <div className="ec-sheet" role="dialog" aria-modal="true" aria-label="Your last Clash">
            <button type="button" className="ec-sheet-close" onClick={() => setPriorOpen(false)} autoFocus>← BACK TO THE DRAFT</button>
            <ResultDock phase="draft" run={chaosRun} result={null} priorResult={priorResult} priorAt={priorAt}
              onViewFullReport={(res) => { setPriorOpen(false); onViewFullReport?.(res); }} busy={busy} />
          </div>
        </div>
      )}
    </div>
  );
}
