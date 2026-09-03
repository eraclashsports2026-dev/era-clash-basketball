// ── The Chaos stage ──────────────────────────────────────────────────────────
// The left side of the Time Arena, composed to the canonical reference:
//
//   TEAM GOLD          CHAOS CLASH · ROLL n OF 3 · ①—②—③          TEAM BLUE
//   ┌──┬──┬──┬──┬──┐ │ ┌──┬──┬──┬──┬──┐   ten cards, ONE row
//   COACH CHAOS      ┌──────┬──────┬──────┐  three offers
//                       FINAL ROLL           one primary action
//
// Geometry lives in CSS — the tokens in index.css, graded against the frozen
// contract in data/validation/8c1/time-arena-visual-contract.json. This file
// owns composition and state; it writes no dimensions of its own.
//
// Players and coach offers share ONE three-roll sequence, so one submit carries
// both halves of a decision. Everything shown comes from the authoritative run.
import { useState, useEffect, useCallback, useRef } from "react";
import PlayerCard, { EmptyCard } from "./PlayerCard.jsx";
import CoachCard from "./CoachCard.jsx";
import ResetDialog from "./ResetDialog.jsx";
import RollStepper from "./RollStepper.jsx";
import {
  startChaos, viewChaos, submitChaosDecisions, chooseChaosCoach,
  publishChaosChallenge, abandonChaos,
} from "../../chaos/client.js";
import { recordFirstRoll } from "../../activation.js";

const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const ROLE_SLOTS = ["ROSTER MAXIMIZER", "OPPONENT COUNTER", "ERA ADAPTER"];
const RUN_KEY = "ec_chaos_run";
// When this browser last touched the run — the lobby's Continue card reads it.
// A browser-side record, never a server field, so it can be wrong only about
// idle time and never about the run itself.
const RUN_AT_KEY = "ec_chaos_run_at";

const store = {
  get: () => { try { return localStorage.getItem(RUN_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(RUN_KEY, v); localStorage.setItem(RUN_AT_KEY, String(Date.now())); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(RUN_KEY); localStorage.removeItem(RUN_AT_KEY); } catch { /* private mode */ } },
};

/** The locally authored atmosphere: court and lighting in CSS, crowd and grain
    as bundled SVG. It sits behind the stage's content and never over it. */
const Atmosphere = () => (
  <div className="ec-ta-atmos" aria-hidden="true">
    <div className="ec-ta-crowd" />
    <div className="ec-ta-grain" />
  </div>
);

const TeamLabel = ({ team, name, sub }) => (
  <div className={`ec-ta-team-label${team === "blue" ? " ec-ta-team-label--blue" : ""}`}>
    <div className="ec-ta-team-name" style={{ color: team === "blue" ? "var(--ec-a-blue)" : "var(--ec-a-gold)" }}>
      {name}
    </div>
    <div className="ec-ta-team-sub">{sub}</div>
  </div>
);

/** One side's five. display:contents — the cards are items of the roster grid,
    which is what allows one row of ten. */
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
            onToggle={() => onToggle?.(card.slot)} />
        );
      })}
    </div>
  );
}

/**
 * The run is NOT state here. It is the authoritative server view, owned by the
 * shell and passed down, so there is exactly one copy: when the shell starts a
 * new Clash or an entitled account changes the era, this stage cannot be left
 * rendering a run that no longer exists. Only the pending decision — which
 * cards and staffs are currently ticked — is local.
 */
export default function ChaosStage({
  run, tier = "GUEST", challengeId, onRunChange, onReady, onGated, onRunClash, onReset,
  phase, busy = false, error = null,
  // The visual fixture supplies its own run and must not have it cleared by the
  // resume pass, which exists to stop a stale run surviving on an empty board.
  resume = true,
}) {
  const [holds, setHolds] = useState([]);
  const [coachHolds, setCoachHolds] = useState([]);
  const [picked, setPicked] = useState(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const resumed = useRef(false);
  // The stage holds its own copy of the share link. `reset()` clears it, but a
  // New Clash started from the dock does not go through `reset()`, so without
  // this the fresh empty board still carried the finished clash's link.
  useEffect(() => { setChallenge(null); }, [run?.chaosRunId]);

  const adopt = useCallback((chaos) => {
    // Cards and staffs kept through a roll come back already selected, so
    // keeping them costs nothing and forgetting cannot lose them.
    setHolds(chaos?.gold?.heldSlots || []);
    setCoachHolds(chaos?.coachDraft?.heldRoles || []);
    setPicked(null);
    if (chaos?.chaosRunId) store.set(chaos.chaosRunId);
    onRunChange?.(chaos);
  }, [onRunChange]);

  // A run that arrives from anywhere else — a resumed session, an era change,
  // a new Clash — re-seeds the pending decision from what is actually held.
  const runKey = `${run?.chaosRunId || "none"}:${run?.roll || 0}:${run?.phase || "-"}`;
  useEffect(() => {
    setHolds(run?.gold?.heldSlots || []);
    setCoachHolds(run?.coachDraft?.heldRoles || []);
    setPicked(null);
  }, [runKey]);

  // Resume an active run rather than silently dealing a new one.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (!resume || challengeId) return;
    // Nothing to resume means the board is EMPTY, so the shell must drop any run
    // it is still holding: otherwise the previous game's era, progress and CTA
    // survive on top of a blank board.
    const forget = () => { store.clear(); onRunChange?.(null); };
    const id = store.get();
    if (!id) { onRunChange?.(null); return; }
    viewChaos(id, tier)
      .then((r) => { if (r?.chaos && r.chaos.status !== "ABANDONED") adopt(r.chaos); else forget(); })
      .catch(forget);
  }, [tier, challengeId, adopt, onRunChange, resume]);

  const act = async (fn, failure) => {
    setWorking(true); setErr(null);
    try { return await fn(); }
    catch (e) { setErr(e.message || failure); return null; }
    finally { setWorking(false); }
  };

  const deal = async () => {
    // Activation clock: the first ROLL 1 of the session, measured from the lobby.
    recordFirstRoll();
    const r = await act(() => startChaos({ tier, challengeId }), "Could not deal a Chaos Clash.");
    if (!r) return;
    if (r.gated) { onGated?.(r.gate); return; }
    adopt(r.chaos); setChallenge(null);
  };
  const submitRoll = async () => {
    const r = await act(
      () => submitChaosDecisions(run.chaosRunId, { holdSlots: holds, holdRoles: coachHolds }, tier),
      "Could not lock that decision.");
    if (r?.chaos) adopt(r.chaos);
  };
  const hire = async () => {
    if (!picked) return;
    const r = await act(() => chooseChaosCoach(run.chaosRunId, picked, tier), "Could not hire that staff.");
    if (r?.chaos) { adopt(r.chaos); onReady?.(r.chaos); }
  };
  /**
   * Start over. A draft still in progress is abandoned server-side first so the
   * run does not linger; a finished game has nothing to abandon. Either way the
   * local board is cleared and the shell deals a fresh Clash — and a finished
   * game is kept by the shell as the previous clash, so its report still opens.
   */
  const reset = async () => {
    setResetting(true);
    if (run?.chaosRunId && phase !== "complete") {
      try { await abandonChaos(run.chaosRunId, tier); } catch { /* the local reset still stands */ }
    }
    store.clear();
    setHolds([]); setCoachHolds([]); setPicked(null);
    setChallenge(null); setConfirmReset(false); setResetting(false);
    if (onReset) onReset();
    else onRunChange?.(null);
  };
  const makeChallenge = async () => {
    try { setChallenge((await publishChaosChallenge(run.chaosRunId, tier)).challengeId); }
    catch { /* a failed share must never break the run */ }
  };

  const togglePlayer = (slot) => setHolds((h) => (h.includes(slot) ? h.filter((s) => s !== slot) : [...h, slot]));
  const toggleCoach = (role) => setCoachHolds((h) => (h.includes(role) ? h.filter((r) => r !== role) : [...h, role]));

  const spinning = working || busy;
  const drafting = !!run && (run.phase === "ROLL_1_REVEALED" || run.phase === "ROLL_2_REVEALED");
  const selecting = !!run?.coachDraft?.selecting;
  const ready = run?.phase === "READY";
  const offers = run?.coachDraft?.offers || [];
  const stageLabel = !run ? "THREE ROLLS AVAILABLE"
    : drafting ? `ROLL ${run.roll} OF ${run.totalRolls}`
      : selecting ? "CHOOSE YOUR STAFF"
        : ready ? "READY TO RUN" : "COMPLETE";

  const cta = !run ? { label: spinning ? "DEALING…" : "ROLL 1", sub: "Deal your first five and your first three staffs.", onClick: deal, on: true }
    : run.roll === 1 && drafting ? { label: spinning ? "ROLLING…" : "LOCK & ROLL 2", sub: "Keep what you want. The era is revealed on the next roll.", onClick: submitRoll, on: true }
      : run.roll === 2 && drafting ? { label: spinning ? "ROLLING…" : "FINAL ROLL", sub: "Lock in your roster and coaches.", onClick: submitRoll, on: true }
        : selecting ? { label: spinning ? "HIRING…" : "HIRE THIS STAFF", sub: picked ? "One staff, for the whole game." : "Choose one of the three offers above.", onClick: hire, on: !!picked }
          : ready ? { label: spinning ? "RUNNING…" : "RUN SIM", sub: "Rosters and staff are locked. Play it out.", onClick: onRunClash, on: true }
            : null;

  // ── After the game: the matchup stays, the controls collapse ──────────────
  // The board keeps the five and the staff DECISION — which of the three you
  // hired, and therefore what you passed up. Nothing else on the page says
  // that, and without it the stage left a tall empty column beside a full rail.
  if (phase === "simulating" || phase === "complete") {
    const hiredId = run?.selectedCoaches?.gold;
    return (
      <section className="ec-ta-stage" aria-label="The matchup you built">
        <Atmosphere />
        <div className="ec-ta-stage-head">
          <TeamLabel team="gold" name="TEAM GOLD" sub="YOUR FIVE" />
          <div className="ec-ta-title">
            <div className="ec-ta-title-main">THE MATCHUP YOU BUILT</div>
            <div className="ec-ta-title-sub">{run?.eraState?.eraStyleId ? `${run.eraState.eraStyleId} ERA` : ""}</div>
          </div>
          <TeamLabel team="blue" name="TEAM BLUE" sub="LEGEND RIVAL" />
        </div>
        <div className="ec-ta-roster">
          <Bench team="gold" roster={run?.gold?.roster} heldSlots={[]} locked />
          <div className="ec-ta-roster-divider" aria-hidden="true" />
          <Bench team="blue" roster={run?.blue?.roster} heldSlots={[]} locked />
        </div>

        {offers.length > 0 && (
          <div className="ec-ta-coach">
            <div className="ec-ta-coach-head">
              <div className="ec-ta-coach-title">YOUR STAFF DECISION</div>
              <div className="ec-ta-coach-sub">
                {hiredId ? "One of these three coached the whole game. The other two are what you passed up."
                  : "Three staffs made the final cut."}
              </div>
            </div>
            <div className="ec-cc-offers">
              {offers.map((o) => (
                <CoachCard key={o.role} offer={o} mode="final" selected={o.coachId === hiredId} disabled />
              ))}
            </div>
          </div>
        )}

        {/* The way out of a finished game, ON THE BOARD. Without this the only
            route to a new Clash was a link inside the result, which is not
            where someone looking at their own five expects to find it. */}
        <div className="ec-ta-stage-actions">
          <button onClick={() => setConfirmReset(true)} style={quiet}
            aria-label="Start a new Clash">NEW CLASH</button>
        </div>

        <ResetDialog open={confirmReset} state="complete" busy={resetting}
          onConfirm={reset} onCancel={() => setConfirmReset(false)} />
      </section>
    );
  }

  // Progressive disclosure: one focus per state. The coach section is
  // actionable only while offers are on the table (holds during the rolls, the
  // hire after the third); at every other moment it is visibly subdued so it
  // never competes with the roll button.
  const focus = !run ? "empty" : drafting ? "hold" : selecting ? "hire" : ready ? "ready" : "other";
  const coachActive = offers.length > 0 && (drafting || selecting);
  return (
    <section className="ec-ta-stage" aria-label="Chaos Clash draft" data-focus={focus}>
      <Atmosphere />

      <div className="ec-ta-stage-head">
        <TeamLabel team="gold" name="TEAM GOLD" sub="YOUR FIVE" />
        <div className="ec-ta-title">
          <div className="ec-ta-title-main">CHAOS CLASH</div>
          <div className="ec-ta-title-sub">{stageLabel}</div>
          <RollStepper run={run} />
        </div>
        <TeamLabel team="blue" name="TEAM BLUE" sub="LEGEND RIVAL" />
      </div>

      <div className="sr-only" aria-live="polite">
        {stageLabel}{run?.eraState?.revealed ? `. Era: ${run.eraState.eraStyleId}.` : ""}
      </div>

      <div className="ec-ta-roster">
        <Bench team="gold" roster={run?.gold?.roster}
          heldSlots={drafting ? holds : (run?.gold?.heldSlots || [])}
          keptSlots={run && run.roll > 1 ? run.gold.heldSlots : []}
          interactive={drafting} locked={!drafting} busy={spinning} onToggle={togglePlayer} />
        <div className="ec-ta-roster-divider" aria-hidden="true" />
        <Bench team="blue" roster={run?.blue?.roster}
          heldSlots={run?.blue?.heldSlots || []}
          keptSlots={run && run.roll > 1 ? run.blue.heldSlots : []}
          interactive={false} locked={!drafting} busy={spinning} />
      </div>

      {/* ── Coach Chaos, inside the same stage and the same viewport ──────── */}
      <div className="ec-ta-coach" data-active={coachActive ? "true" : "false"}>
        <div className="ec-ta-coach-head">
          <div className="ec-ta-coach-title">COACH CHAOS</div>
          <div className="ec-ta-coach-sub">
            {selecting ? "Three staffs made the final cut. Take one."
              : "Build your edge with legendary coaches"}
          </div>
        </div>
        <div className="ec-cc-offers">
          {offers.length ? offers.map((o) => (
            <CoachCard key={o.role} offer={o}
              mode={selecting ? "select" : ready ? "final" : "hold"}
              held={coachHolds.includes(o.role)}
              selected={selecting ? picked === o.coachId : run?.selectedCoaches?.gold === o.coachId}
              onToggle={() => toggleCoach(o.role)}
              onSelect={() => setPicked(o.coachId)}
              disabled={spinning} />
          )) : ROLE_SLOTS.map((role) => (
            <div key={role} className="ec-coach-card" aria-label={`Empty ${role.toLowerCase()} slot`}>
              <div className="ec-coach-role">{role}</div>
              <div className="ec-coach-portrait">
                <div className="ec-coach-figure" aria-hidden="true" style={{ opacity: 0.35 }} />
              </div>
              <div className="ec-coach-body">
                <div className="ec-coach-span">Rolls with your five.</div>
              </div>
              <div className="ec-coach-foot"><div className="ec-coach-static">EMPTY</div></div>
            </div>
          ))}
        </div>
      </div>

      {/* ── One primary action ───────────────────────────────────────────── */}
      {cta && (
        <div className="ec-ta-cta-wrap">
          {/* Three columns so the CTA stays exactly centred no matter what sits
              beside it, and the secondary actions cost the composition nothing
              vertically — there is 360px of empty stage on either side of a
              352px button, and no room at all below it. */}
          <div className="ec-ta-cta-row">
            <span aria-hidden="true" />
            <button className="ec-ta-cta" onClick={cta.onClick} disabled={spinning || !cta.on}>
              {cta.label}{cta.on && !spinning ? " 🎲" : ""}
            </button>
            {run ? (
              <div className="ec-ta-stage-actions">
                {ready && <button onClick={makeChallenge} style={quiet}>CHALLENGE THIS CHAOS</button>}
                <button onClick={() => setConfirmReset(true)} style={quiet}
                  aria-label="Reset this Clash and deal a new one">RESET</button>
              </div>
            ) : <span aria-hidden="true" />}
          </div>
          <div className="ec-ta-cta-sub">
            {cta.sub}
            {drafting && (
              <>
                {" · "}
                {holds.length ? `holding ${holds.length}/5` : "holding no players"}
                {coachHolds.length ? ` and ${coachHolds.length}/3 staffs` : " and no staff"}
                {" · released is gone for good"}
                {run.roll > 1 && " · Team Blue's decisions were locked before yours were submitted."}
              </>
            )}
          </div>
        </div>
      )}

      {(err || error) && (
        <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "var(--ec-a-red)", textAlign: "center" }}>
          {err || error}
        </div>
      )}

      {/* A board with a run but no primary action still needs its way out. */}
      {run && !cta && (
        <div className="ec-ta-stage-actions">
          <button onClick={() => setConfirmReset(true)} style={quiet}
            aria-label="Reset this Clash and deal a new one">RESET</button>
        </div>
      )}

      {challenge && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ec-a-text-muted)", textAlign: "center", wordBreak: "break-all" }}>
          Same opening rolls, their own decisions:{" "}
          <span style={{ color: "var(--ec-a-gold)" }}>{`${window.location.origin}/?chaos=${challenge}`}</span>
        </div>
      )}

      <ResetDialog open={confirmReset} state="draft" busy={resetting}
        onConfirm={reset} onCancel={() => setConfirmReset(false)} />
    </section>
  );
}

const quiet = {
  minHeight: 44, padding: "0 14px", borderRadius: 8, cursor: "pointer",
  fontWeight: 800, fontSize: 11, letterSpacing: 0.6,
  border: "1px solid var(--ec-a-border)", background: "transparent", color: "var(--ec-a-text-muted)",
};
