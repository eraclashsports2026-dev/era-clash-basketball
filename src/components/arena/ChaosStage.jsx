// ── The Chaos stage — six presentations of ONE evolving board ────────────────
// Phase 9B.3. The same roster frame is on screen from the first roll to the
// final score; what changes is the FOCUS:
//
//   EMPTY         the empty frame and one action: ROLL
//   DRAFTING      cards, HOLD, and the next roll
//   ERA_REVEAL    the era becomes the focus, once, after Roll 2
//   COACH_SELECT  the five is set and compresses; the three staffs are the hero
//   READY         the matchup, and one action: RUN CLASH
//   RESULT        this game, as the hero (the Result Dock renders it beside us)
//
// Geometry lives in CSS. Which state we are in is DERIVED by src/chaos/
// guidedState.js from the authoritative run and the shell's game phase; this
// component never decides a state of its own. Players and coach offers still
// share ONE three-roll sequence on the server; the client simply no longer
// surfaces staff holds mid-draft, which is a presentation choice — the server
// contract and the draft mechanics are unchanged.
import { useState, useEffect, useCallback, useRef } from "react";
import PlayerCard, { EmptyCard } from "./PlayerCard.jsx";
import CoachCard from "./CoachCard.jsx";
import ResetDialog from "./ResetDialog.jsx";
import RollStepper from "./RollStepper.jsx";
import EraRevealPanel from "./EraRevealPanel.jsx";
import { EraFractureTransition } from "../brand/EraFracture.jsx";
import {
  startChaos, viewChaos, submitChaosDecisions, chooseChaosCoach,
  publishChaosChallenge, abandonChaos,
} from "../../chaos/client.js";
import {
  GUIDED, primaryAction, rosterCompressed, rosterInteractive, showsCoachOffers,
  holdAnnouncement, coachAnnouncement, stateAnnouncement, GUIDED_EVENTS,
} from "../../chaos/guidedState.js";
import { recordFirstRoll } from "../../activation.js";
import { track } from "../../analytics.js";

const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const ROLE_SLOTS = ["ROSTER MAXIMIZER", "OPPONENT COUNTER", "ERA ADAPTER"];
const RUN_KEY = "ec_chaos_run";
// When this browser last touched the run — the lobby's Continue card reads it.
const RUN_AT_KEY = "ec_chaos_run_at";

const store = {
  get: () => { try { return localStorage.getItem(RUN_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(RUN_KEY, v); localStorage.setItem(RUN_AT_KEY, String(Date.now())); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(RUN_KEY); localStorage.removeItem(RUN_AT_KEY); } catch { /* private mode */ } },
};

const Atmosphere = () => (
  <div className="ec-ta-atmos" aria-hidden="true">
    <div className="ec-ta-crowd" />
    <div className="ec-ta-grain" />
  </div>
);

const TeamLabel = ({ team, name, sub }) => (
  <div className={`ec-ta-team-label${team === "blue" ? " ec-ta-team-label--blue" : ""}`}>
    <div className="ec-ta-team-name" style={{ color: team === "blue" ? "var(--ec-a-blue)" : "var(--ec-a-gold)" }}>{name}</div>
    <div className="ec-ta-team-sub">{sub}</div>
  </div>
);

/** One side's five. display:contents — the cards are items of the roster grid. */
function Bench({ team, roster, heldSlots, keptSlots = [], interactive, locked, busy, onToggle }) {
  return (
    <div className="ec-ta-team" data-team={team}>
      {SLOTS.map((slot, i) => {
        const card = roster?.[i];
        if (!card) return <EmptyCard key={slot} slot={slot} team={team} />;
        return (
          <PlayerCard key={card.id} card={card} team={team}
            interactive={interactive} locked={locked} disabled={busy}
            held={heldSlots.includes(card.slot)} kept={keptSlots.includes(card.slot)}
            onToggle={() => onToggle?.(card)} />
        );
      })}
    </div>
  );
}

/** The compressed staff line under a five, from the run's own offers. */
const StaffLine = ({ team, run }) => {
  const id = run?.selectedCoaches?.[team];
  const offers = team === "gold" ? (run?.coachDraft?.offers || []) : [];
  const hired = offers.find((o) => o.coachId === id);
  const blueName = run?.cpuCoachCommit?.name || run?.coachDraft?.opponent?.find?.((o) => o.coachId === id)?.name;
  const name = team === "gold" ? hired?.name : (blueName || null);
  const role = team === "gold" ? (hired?.roleLabel || hired?.role) : null;
  if (!name && !role) return null;
  return (
    <div className={`ec-ta-staff ec-ta-staff--${team}`}>
      <span className="ec-ta-staff-k">COACH</span>
      <span className="ec-ta-staff-v">{name || "—"}</span>
      {role && <span className="ec-ta-staff-role">{String(role).toUpperCase()}</span>}
    </div>
  );
};

export default function ChaosStage({
  run, tier = "GUEST", challengeId, onRunChange, onReady, onGated, onRunClash, onReset,
  phase, busy = false, error = null, resume = true,
  guidedState = GUIDED.EMPTY, onAcknowledgeEra, onGuide,
  mobileTeam = "gold", onMobileTeam,
}) {
  const [holds, setHolds] = useState([]);
  const [picked, setPicked] = useState(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [announce, setAnnounce] = useState("");
  const resumed = useRef(false);
  const ctaRef = useRef(null);
  useEffect(() => { setChallenge(null); }, [run?.chaosRunId]);

  const adopt = useCallback((chaos) => {
    setHolds(chaos?.gold?.heldSlots || []);
    setPicked(null);
    if (chaos?.chaosRunId) store.set(chaos.chaosRunId);
    onRunChange?.(chaos);
  }, [onRunChange]);

  // A run that arrives from anywhere else re-seeds the pending decision from
  // what is actually held. Keyed so a mid-roll decision is never remounted away.
  const runKey = `${run?.chaosRunId || "none"}:${run?.roll || 0}:${run?.phase || "-"}`;
  useEffect(() => { setHolds(run?.gold?.heldSlots || []); setPicked(null); }, [runKey]);

  // Resume an active run rather than silently dealing a new one. Once per mount.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (!resume || challengeId) return;
    const forget = () => { store.clear(); onRunChange?.(null); };
    const id = store.get();
    if (!id) { onRunChange?.(null); return; }
    viewChaos(id, tier)
      .then((r) => { if (r?.chaos && r.chaos.status !== "ABANDONED") adopt(r.chaos); else forget(); })
      .catch(forget);
  }, [tier, challengeId, adopt, onRunChange, resume]);

  // Focus moves with the decision: when the state changes, the primary action
  // receives focus once, so a keyboard user is never left on a control that has
  // just disappeared. The era reveal is the exception — it announces, it does
  // not grab, so it cannot steal focus on every re-render (spec §22).
  const stateRef = useRef(guidedState);
  useEffect(() => {
    if (stateRef.current === guidedState) return;
    stateRef.current = guidedState;
    setAnnounce(stateAnnouncement(guidedState, { run }));
    if (guidedState !== GUIDED.ERA_REVEAL && guidedState !== GUIDED.RESULT) ctaRef.current?.focus?.({ preventScroll: true });
  }, [guidedState, run]);

  const act = async (fn, failure) => {
    setWorking(true); setErr(null);
    try { return await fn(); }
    catch (e) { setErr(e.message || failure); return null; }
    finally { setWorking(false); }
  };

  const deal = async () => {
    recordFirstRoll();
    const r = await act(() => startChaos({ tier, challengeId }), "Could not deal a Chaos Clash.");
    if (!r) return;
    if (r.gated) { onGated?.(r.gate); return; }
    adopt(r.chaos); setChallenge(null);
    track("chaos_roll_completed", { roll: 0, holds: 0, staff_holds: 0, next_phase: r.chaos?.phase || null });
  };
  const submitRoll = async () => {
    const fromRoll = run.roll;
    // Staff holds are no longer surfaced mid-draft; the server still accepts
    // the field and rolls all three offers when it is empty.
    const r = await act(
      () => submitChaosDecisions(run.chaosRunId, { holdSlots: holds, holdRoles: [] }, tier),
      "Could not lock that decision.");
    if (r?.chaos) {
      adopt(r.chaos);
      track("chaos_roll_completed", { roll: fromRoll, holds: holds.length, staff_holds: 0, next_phase: r.chaos.phase || null });
      if (r.chaos.eraState?.revealed && !run.eraState?.revealed) track("chaos_era_revealed", { era_style: r.chaos.eraState.eraStyleId || null, roll: r.chaos.roll || null });
    }
  };
  const hire = async () => {
    if (!picked) return;
    const r = await act(() => chooseChaosCoach(run.chaosRunId, picked, tier), "Could not hire that staff.");
    if (r?.chaos) { adopt(r.chaos); track("chaos_coach_selected", { coach_id: picked, role: offers.find((o) => o.coachId === picked)?.role || null }); onReady?.(r.chaos); }
  };
  const reset = async () => {
    setResetting(true);
    if (run?.chaosRunId && phase !== "complete") {
      try { await abandonChaos(run.chaosRunId, tier); } catch { /* the local reset still stands */ }
    }
    store.clear();
    setHolds([]); setPicked(null);
    setChallenge(null); setConfirmReset(false); setResetting(false);
    if (onReset) onReset();
    else onRunChange?.(null);
  };
  const makeChallenge = async () => {
    try { setChallenge((await publishChaosChallenge(run.chaosRunId, tier)).challengeId); }
    catch { /* a failed share must never break the run */ }
  };

  const togglePlayer = (card) => {
    setHolds((h) => {
      const next = h.includes(card.slot) ? h.filter((s) => s !== card.slot) : [...h, card.slot];
      setAnnounce(holdAnnouncement(card, next.includes(card.slot), next.length));
      return next;
    });
  };
  const pick = (o) => {
    setPicked(o.coachId);
    setAnnounce(coachAnnouncement(o));
    track(GUIDED_EVENTS.COACH_OFFER_SELECTED, { role: o.role || null });
  };
  const continueFromEra = () => {
    track(GUIDED_EVENTS.ERA_REVEAL_CONTINUED, { era_style: run?.eraState?.eraStyleId || null });
    onAcknowledgeEra?.();
  };

  const spinning = working || busy;
  const state = guidedState;
  const offers = run?.coachDraft?.offers || [];
  const interactive = rosterInteractive(state) && !!run;
  const compressed = rosterCompressed(state);
  const eraId = run?.eraState?.eraStyleId || null;
  const simulating = phase === "simulating";

  const cta = primaryAction(state, { run, spinning, picked });
  const onPrimary = cta && {
    deal, roll: submitRoll, "acknowledge-era": continueFromEra, hire, run: onRunClash,
  }[cta.action];
  const firePrimary = () => {
    if (!cta || !onPrimary) return;
    track(GUIDED_EVENTS.PRIMARY_ACTION, { state, action: cta.action, roll: run?.roll ?? null });
    if (cta.action === "run") track(GUIDED_EVENTS.RUN_CLASH_STARTED, { era_style: eraId });
    onPrimary();
  };

  const title = state === GUIDED.RESULT ? (simulating ? "SIMULATING THE CLASH" : "CLASH COMPLETE")
    : state === GUIDED.READY ? "CLASH READY"
      : state === GUIDED.COACH_SELECT ? "COACH CHAOS"
        : "CHAOS CLASH";
  const subtitle = state === GUIDED.EMPTY ? "ROLL 1 OF 3"
    : state === GUIDED.DRAFTING ? `ROLL ${run?.roll} OF ${run?.totalRolls}`
      : state === GUIDED.ERA_REVEAL ? "ADAPT TO THE ERA"
        : state === GUIDED.COACH_SELECT ? "YOUR ROSTER IS SET"
          : state === GUIDED.READY ? "TWO LEGENDARY ROSTERS. ONE ERA. NO PREDICTIONS."
            : simulating ? "LET HISTORY DECIDE" : "THE MATCHUP YOU BUILT";

  return (
    <section className="ec-ta-stage" aria-label={state === GUIDED.RESULT ? "The matchup you built" : "Chaos Clash draft"}
      data-guided-state={state} data-roster={compressed ? "compressed" : "full"} data-focus={state.toLowerCase()}>
      <Atmosphere />
      {/* Approved fracture placement 3: one sweep when a roll lands; 7: the simulation. */}
      {simulating
        ? <EraFractureTransition kind="sim" hold />
        : <EraFractureTransition kind="roll" token={run ? run.roll : null} />}

      <div className="ec-ta-stage-head">
        <TeamLabel team="gold" name="TEAM GOLD" sub="YOUR FIVE" />
        <div className="ec-ta-title">
          <h1 className="ec-ta-title-main">{title}</h1>
          <div className="ec-ta-title-sub">{subtitle}</div>
          {state !== GUIDED.RESULT && <RollStepper run={run} />}
          {(state === GUIDED.READY || state === GUIDED.RESULT || state === GUIDED.COACH_SELECT) && eraId && (
            <div className="ec-ta-era-chip" aria-label={`Era ${eraId}${run?.eraState?.custom ? ", custom" : ""}`}>
              <span aria-hidden="true">🗓</span> ERA: {eraId}{run?.eraState?.custom ? " · CUSTOM" : ""}
              {!run?.eraState?.change?.allowed && <span aria-hidden="true" title="Locked for this run"> 🔒</span>}
            </div>
          )}
        </div>
        <TeamLabel team="blue" name="TEAM BLUE" sub="LEGEND RIVAL" />
      </div>

      {/* One live region: state changes, holds, the era, the pick. Never the CTA text. */}
      <div className="sr-only" aria-live="polite">{announce}</div>

      {/* Phone: one team at a time, the other one tap away. Desktop ignores this. */}
      <div className="ec-ta-team-toggle" role="tablist" aria-label="Show a team">
        {[["gold", "TEAM GOLD"], ["blue", "TEAM BLUE"]].map(([t, l]) => (
          <button key={t} role="tab" aria-selected={mobileTeam === t} data-team={t}
            onClick={() => onMobileTeam?.(t)}>{l}</button>
        ))}
      </div>

      <div className="ec-ta-roster" data-mobile-team={mobileTeam}>
        <Bench team="gold" roster={run?.gold?.roster}
          heldSlots={interactive ? holds : (run?.gold?.heldSlots || [])}
          keptSlots={run && run.roll > 1 && state === GUIDED.DRAFTING ? run.gold.heldSlots : []}
          interactive={interactive} locked={!interactive && !!run} busy={spinning} onToggle={togglePlayer} />
        <div className="ec-ta-roster-divider" aria-hidden="true" />
        <Bench team="blue" roster={run?.blue?.roster}
          heldSlots={run?.blue?.heldSlots || []}
          keptSlots={run && run.roll > 1 && state === GUIDED.DRAFTING ? run.blue.heldSlots : []}
          interactive={false} locked={!interactive && !!run} busy={spinning} />
      </div>

      {compressed && (
        <div className="ec-ta-staff-row">
          <StaffLine team="gold" run={run} />
          <StaffLine team="blue" run={run} />
        </div>
      )}

      {/* ── State 3: the era, once ────────────────────────────────────────── */}
      {state === GUIDED.ERA_REVEAL && (
        <EraRevealPanel run={run} onRules={() => { track(GUIDED_EVENTS.ERA_RULES_EXPANDED, { from: "era_reveal" }); onGuide?.("glossary"); }} busy={spinning} />
      )}

      {/* ── State 4: Coach Chaos, only once the five is set ───────────────── */}
      {showsCoachOffers(state) && (
        <div className="ec-ta-coach" data-active="true">
          <div className="ec-ta-coach-head">
            <h2 className="ec-ta-coach-title">COACH CHAOS</h2>
            <div className="ec-ta-coach-sub">
              Build your edge with legendary coaches. Three staffs made the final cut — take one.
            </div>
          </div>
          <div className="ec-cc-offers" aria-label={`Three coaching offers: ${ROLE_SLOTS.join(", ")}`}>
            {offers.map((o) => (
              <CoachCard key={o.role} offer={o} mode="select"
                selected={picked === o.coachId}
                onSelect={() => pick(o)} disabled={spinning} />
            ))}
          </div>
        </div>
      )}

      {/* ── One primary action ───────────────────────────────────────────── */}
      {cta && (
        <div className="ec-ta-cta-wrap" data-action={cta.action}>
          <div className="ec-ta-cta-row">
            <span aria-hidden="true" />
            <button ref={ctaRef} className="ec-ta-cta" onClick={firePrimary} disabled={spinning || !cta.enabled}
              aria-describedby="ec-ta-cta-sub">
              {cta.action === "run" && <span aria-hidden="true">⚡</span>}
              {cta.label}
              {(cta.action === "deal" || cta.action === "roll") && cta.enabled && !spinning && <span aria-hidden="true"> 🎲</span>}
              {cta.action === "acknowledge-era" && <span aria-hidden="true"> →</span>}
            </button>
            {run && state !== GUIDED.ERA_REVEAL ? (
              <div className="ec-ta-stage-actions">
                {state === GUIDED.READY && <button onClick={makeChallenge} style={quiet}>CHALLENGE THIS CHAOS</button>}
                <button onClick={() => setConfirmReset(true)} style={quiet}
                  aria-label="Reset this Clash and deal a new one">RESET</button>
              </div>
            ) : state === GUIDED.EMPTY ? (
              <div className="ec-ta-stage-actions">
                <button onClick={() => onGuide?.("play")} style={quiet} aria-label="How Chaos Clash works">
                  <span aria-hidden="true">?</span> HOW IT WORKS
                </button>
              </div>
            ) : <span aria-hidden="true" />}
          </div>
          <div id="ec-ta-cta-sub" className="ec-ta-cta-sub">
            {cta.sub}
            {state === GUIDED.DRAFTING && (
              <>
                {" · "}{holds.length ? `holding ${holds.length}/5` : "holding no players"}{" · released is gone for good"}
              </>
            )}
            {state === GUIDED.EMPTY && " · Three rolls. Hold the legends you want. New players are offered each roll."}
          </div>
        </div>
      )}

      {(err || error) && (
        <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "var(--ec-a-red)", textAlign: "center" }}>
          {err || error}
        </div>
      )}

      {/* A finished game keeps its way out ON THE BOARD (the dock has one too). */}
      {state === GUIDED.RESULT && !simulating && (
        <div className="ec-ta-stage-actions">
          <button onClick={() => setConfirmReset(true)} style={quiet} aria-label="Start a new Clash">NEW CLASH</button>
        </div>
      )}
      {run && !cta && state !== GUIDED.RESULT && (
        <div className="ec-ta-stage-actions">
          <button onClick={() => setConfirmReset(true)} style={quiet} aria-label="Reset this Clash and deal a new one">RESET</button>
        </div>
      )}

      {challenge && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ec-a-text-muted)", textAlign: "center", wordBreak: "break-all" }}>
          Same opening rolls, their own decisions:{" "}
          <span style={{ color: "var(--ec-a-gold)" }}>{`${window.location.origin}/?chaos=${challenge}`}</span>
        </div>
      )}

      {state === GUIDED.RESULT ? (
        <ResetDialog open={confirmReset} state="complete" busy={resetting}
          onConfirm={reset} onCancel={() => setConfirmReset(false)} />
      ) : (
        <ResetDialog open={confirmReset} state="draft" busy={resetting}
          onConfirm={reset} onCancel={() => setConfirmReset(false)} />
      )}
    </section>
  );
}

const quiet = {
  minHeight: 44, padding: "0 14px", borderRadius: 8, cursor: "pointer",
  fontWeight: 800, fontSize: 11, letterSpacing: 0.6,
  border: "1px solid var(--ec-a-border)", background: "transparent", color: "var(--ec-a-text-muted)",
};
