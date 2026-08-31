// ── The Chaos stage ──────────────────────────────────────────────────────────
// The left side of the Time Arena: the roll progression, both benches, Coach
// Chaos, and the one primary action for whatever the run is waiting on.
//
// Players and coach offers share ONE three-roll sequence, so one submit carries
// both halves of a decision. Everything shown comes from the authoritative run
// — this component never infers a roll, an era or an opponent's hold.
import { useState, useEffect, useCallback, useRef } from "react";
import PlayerCard, { EmptyCard } from "./PlayerCard.jsx";
import CoachCard from "./CoachCard.jsx";
import RollStepper from "./RollStepper.jsx";
import {
  startChaos, viewChaos, submitChaosDecisions, chooseChaosCoach,
  publishChaosChallenge, abandonChaos,
} from "../../chaos/client.js";

const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const RUN_KEY = "ec_chaos_run";

const store = {
  get: () => { try { return localStorage.getItem(RUN_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(RUN_KEY, v); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(RUN_KEY); } catch { /* private mode */ } },
};

const Label = ({ children, tone, size = 10 }) => (
  <div style={{ fontSize: size, fontWeight: 900, letterSpacing: 1.6, color: tone || "var(--ec-a-text-muted)" }}>
    {children}
  </div>
);

/** One bench. The team owns the theme; the position never touches it. */
function Bench({ team, title, sub, roster, heldSlots, keptSlots = [], interactive, locked, busy, onToggle }) {
  const accent = team === "blue" ? "var(--ec-a-blue)" : "var(--ec-a-gold)";
  return (
    <div className="ec-ta-team" data-team={team}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <Label tone={accent} size={12}>{title}</Label>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2, color: "var(--ec-a-text-muted)" }}>{sub}</span>
      </div>
      <div className="ec-ta-five">
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
  run, tier = "GUEST", challengeId, onRunChange, onReady, onGated, onRunClash,
  phase, busy = false, error = null,
}) {
  const [holds, setHolds] = useState([]);
  const [coachHolds, setCoachHolds] = useState([]);
  const [picked, setPicked] = useState(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const resumed = useRef(false);

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
    if (challengeId) return;
    // Nothing to resume means the board is EMPTY, so the shell must drop any run
    // it is still holding: otherwise the previous game's era, progress and CTA
    // survive on top of a blank board.
    const forget = () => { store.clear(); onRunChange?.(null); };
    const id = store.get();
    if (!id) { onRunChange?.(null); return; }
    viewChaos(id, tier)
      .then((r) => { if (r?.chaos && r.chaos.status !== "ABANDONED") adopt(r.chaos); else forget(); })
      .catch(forget);
  }, [tier, challengeId, adopt, onRunChange]);

  const act = async (fn, failure) => {
    setWorking(true); setErr(null);
    try { const r = await fn(); return r; }
    catch (e) { setErr(e.message || failure); return null; }
    finally { setWorking(false); }
  };

  const deal = async () => {
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

  const abandon = async () => {
    try { await abandonChaos(run.chaosRunId, tier); } catch { /* the local reset still stands */ }
    store.clear();
    setHolds([]); setCoachHolds([]); setPicked(null);
    setConfirmAbandon(false); setChallenge(null);
    onRunChange?.(null);
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
  const stage = !run ? "THREE ROLLS AVAILABLE"
    : drafting ? `ROLL ${run.roll} OF ${run.totalRolls}`
      : selecting ? "CHOOSE YOUR STAFF"
        : ready ? "READY TO RUN" : "COMPLETE";

  // ── The one primary action, for whatever the run is waiting on ────────────
  const cta = !run ? { label: spinning ? "DEALING…" : "ROLL 1", sub: "Deal your first five and your first three staffs.", onClick: deal, on: true }
    : run.roll === 1 && drafting ? { label: spinning ? "ROLLING…" : "LOCK & ROLL 2", sub: "Keep what you want. The era is revealed on the next roll.", onClick: submitRoll, on: true }
      : run.roll === 2 && drafting ? { label: spinning ? "ROLLING…" : "FINAL ROLL", sub: "Lock in your roster and coaches.", onClick: submitRoll, on: true }
        : selecting ? { label: spinning ? "HIRING…" : "HIRE THIS STAFF", sub: picked ? "One staff, for the whole game." : "Choose one of the three offers above.", onClick: hire, on: !!picked }
          : ready ? { label: spinning ? "RUNNING…" : "RUN SIM", sub: "Rosters and staff are locked. Play it out.", onClick: onRunClash, on: true }
            : null;

  if (phase === "simulating" || phase === "complete") {
    // The finished matchup stays on screen; the stage's controls collapse.
    return (
      <section className="ec-panel ec-ta-stage" style={{ padding: 16 }} aria-label="The matchup you built">
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <Label tone="var(--ec-a-gold)" size={11}>THE MATCHUP YOU BUILT</Label>
        </div>
        <div className="ec-ta-boards">
          <Bench team="gold" title="TEAM GOLD" sub="YOUR PICKS" roster={run?.gold?.roster} heldSlots={[]} locked />
          <Bench team="blue" title="TEAM BLUE" sub="LEGEND CPU" roster={run?.blue?.roster} heldSlots={[]} locked />
        </div>
      </section>
    );
  }

  return (
    <section className="ec-panel ec-ta-stage" style={{ padding: "14px 16px 18px" }} aria-label="Chaos Clash draft">
      {/* ── Title, progression, and the era once it exists ───────────────── */}
      <div className="ec-ta-stage-head" style={{ marginBottom: 14 }}>
        <div>
          <Label tone="var(--ec-a-gold)" size={13}>CHAOS CLASH</Label>
          <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)", marginTop: 2 }}>{stage}</div>
        </div>
        <RollStepper run={run} />
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {run?.eraState?.revealed ? (
            <span style={{
              fontSize: 11, fontWeight: 900, letterSpacing: 1, padding: "5px 9px", borderRadius: 999,
              color: "var(--ec-a-gold)", border: "1px solid var(--ec-a-gold-line)", background: "var(--ec-a-gold-soft)",
            }}>
              {run.eraState.eraStyleId} ERA{run.eraState.custom ? " · CUSTOM" : ""}
              {run.eraState.change?.allowed ? "" : <span aria-hidden="true"> 🔒</span>}
            </span>
          ) : (
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: "var(--ec-a-text-muted)" }}>
              ERA HIDDEN
            </span>
          )}
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {stage}{run?.eraState?.revealed ? `. Era: ${run.eraState.eraStyleId}.` : ""}
      </div>

      {/* ── Both benches ─────────────────────────────────────────────────── */}
      <div className="ec-ta-boards">
        <Bench team="gold" title="TEAM GOLD" sub="YOUR PICKS"
          roster={run?.gold?.roster} heldSlots={drafting ? holds : (run?.gold?.heldSlots || [])}
          keptSlots={run && run.roll > 1 ? run.gold.heldSlots : []}
          interactive={drafting} locked={!drafting} busy={spinning} onToggle={togglePlayer} />
        <Bench team="blue" title="TEAM BLUE" sub="LEGEND CPU"
          roster={run?.blue?.roster} heldSlots={run?.blue?.heldSlots || []}
          keptSlots={run && run.roll > 1 ? run.blue.heldSlots : []}
          interactive={false} locked={!drafting} busy={spinning} />
      </div>

      {run && run.roll > 1 && drafting && (
        <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)", marginTop: 8, textAlign: "center" }}>
          Team Blue's decisions were locked before yours were submitted.
        </div>
      )}

      {/* ── Coach Chaos ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: 18 }}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <Label tone="var(--ec-a-coach)" size={13}>COACH CHAOS</Label>
          <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)", marginTop: 3 }}>
            {selecting
              ? "Three staffs made the final cut. Take one."
              : "Build your edge with legendary coaches — they roll with your five."}
          </div>
        </div>
        {offers.length ? (
          <div className="ec-cc-offers">
            {offers.map((o) => (
              <CoachCard key={o.role} offer={o}
                mode={selecting ? "select" : ready ? "final" : "hold"}
                held={coachHolds.includes(o.role)}
                selected={selecting ? picked === o.coachId : run?.selectedCoaches?.gold === o.coachId}
                onToggle={() => toggleCoach(o.role)}
                onSelect={() => setPicked(o.coachId)}
                disabled={spinning} />
            ))}
          </div>
        ) : (
          <div className="ec-cc-offers">
            {["ROSTER MAXIMIZER", "OPPONENT COUNTER", "ERA ADAPTER"].map((role) => (
              <div key={role} className="ec-coach-card" style={{ opacity: 0.6, minHeight: 150 }}
                aria-label={`Empty ${role.toLowerCase()} slot`}>
                <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: "var(--ec-a-coach)" }}>{role}</div>
                <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)" }}>empty</div>
              </div>
            ))}
          </div>
        )}
        {drafting && offers.length > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)", marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>
            {coachHolds.length ? `Holding ${coachHolds.length} of 3 staffs. ` : "Holding no staff. "}
            A released staff is out of this Clash for good.
          </div>
        )}
      </div>

      {/* ── One primary action ───────────────────────────────────────────── */}
      {cta && (
        <div style={{ marginTop: 18, display: "grid", gap: 6, justifyItems: "center" }}>
          <button onClick={cta.onClick} disabled={spinning || !cta.on} style={{
            minHeight: 58, width: "100%", maxWidth: 520, borderRadius: 12,
            cursor: spinning || !cta.on ? "default" : "pointer",
            fontWeight: 900, fontSize: 16, letterSpacing: 1.4,
            border: `1px solid ${cta.on ? "var(--ec-a-gold-line)" : "var(--ec-a-border)"}`,
            background: cta.on ? "var(--ec-a-gold)" : "transparent",
            color: cta.on ? "#0a0f18" : "var(--ec-a-text-muted)",
            opacity: spinning ? 0.65 : 1,
          }}>{cta.label}{cta.on && !spinning ? " 🎲" : ""}</button>
          <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)", textAlign: "center" }}>{cta.sub}</div>
          {drafting && (
            <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)", textAlign: "center" }}>
              {holds.length ? `Holding ${holds.length} of 5 players. ` : "Holding no players. "}
              Anyone you release is out of this Clash for good.
            </div>
          )}
        </div>
      )}

      {(err || error) && (
        <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: "var(--ec-a-red)", textAlign: "center" }}>
          {err || error}
        </div>
      )}

      {/* ── Secondary actions ────────────────────────────────────────────── */}
      {run && (
        <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {ready && (
            <button onClick={makeChallenge} style={secondary}>CHALLENGE THIS CHAOS</button>
          )}
          {confirmAbandon ? (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--ec-a-text-muted)" }}>Abandon this draft? It cannot be resumed.</span>
              <button onClick={abandon} style={secondary}>Yes, abandon</button>
              <button onClick={() => setConfirmAbandon(false)} style={{ ...secondary, border: "none" }}>Keep drafting</button>
            </span>
          ) : (
            <button onClick={() => setConfirmAbandon(true)} style={{ ...secondary, border: "none", textDecoration: "underline" }}>
              Abandon this draft
            </button>
          )}
        </div>
      )}

      {challenge && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--ec-a-text-muted)", textAlign: "center", wordBreak: "break-all", lineHeight: 1.5 }}>
          Same opening rolls, same rules, their own decisions:{" "}
          <span style={{ color: "var(--ec-a-gold)" }}>{`${window.location.origin}/?chaos=${challenge}`}</span>
        </div>
      )}
    </section>
  );
}

const secondary = {
  minHeight: 44, padding: "0 14px", borderRadius: 9, cursor: "pointer",
  fontWeight: 800, fontSize: 11.5, letterSpacing: 0.6,
  border: "1px solid var(--ec-a-border)", background: "transparent", color: "var(--ec-a-text-secondary)",
};
