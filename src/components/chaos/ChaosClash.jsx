// ── Chaos Clash — the default Play experience ────────────────────────────────
// Phase 8B corrects the draft's shape. The page opens EMPTY: the first roster
// only exists once the user presses ROLL 1, so the roll counter matches what
// the user actually did. Hold controls stay live in every decision round, and
// cards kept through a roll start the next round already selected.
import { useState, useEffect, useCallback, useRef } from "react";
import { T, R } from "../../theme.js";
import ChaosCard from "./ChaosCard.jsx";
import EraContextBanner from "./EraContextBanner.jsx";
import CoachOfferCard from "./CoachOfferCard.jsx";
import {
  startChaos, viewChaos, submitChaosHolds, submitChaosCoachHolds,
  chooseChaosCoach, publishChaosChallenge, abandonChaos,
} from "../../chaos/client.js";

const SLOTS = ["PG", "SG", "SF", "PF", "C"];
// SLOTS is the ROSTER order the engine indexes by and never changes. The board
// is laid out like a floor instead: both guards on the top row, then wing,
// centre and power forward across the bottom, centred under them.
const BOARD_ROWS = [["PG", "SG"], ["SF", "C", "PF"]];
const RUN_KEY = "ec_chaos_run";
const PRESSURE_COLOR = { LOW: T.onArenaDim, RISING: T.goldOnDark, HIGH: T.orange || T.goldOnDark };

const store = {
  get: () => { try { return localStorage.getItem(RUN_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(RUN_KEY, v); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(RUN_KEY); } catch { /* private mode */ } },
};

const Label = ({ children, tone = T.onArenaDim }) => (
  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: tone }}>{children}</div>
);

/** One roster-summary schema for both sides — every row always present. */
function RosterRead({ analysis }) {
  if (!analysis) return null;
  const row = (k, v) => (
    <div key={k} className="chaos-read-row">
      <span style={{ color: T.onArenaDim }}>{k}</span>
      <span style={{ color: T.onArena, fontWeight: 700, textAlign: "right" }}>{v}</span>
    </div>
  );
  return (
    <div className="chaos-read" style={{ marginTop: 10, padding: "9px 11px", borderRadius: R.sm, border: `1px solid ${T.arenaBorder}`, background: "rgba(255,255,255,0.03)" }}>
      {row("Talent", analysis.talentTier)}
      {row("Construction", analysis.constructionTier)}
      {row("Best strength", analysis.bestStrength?.label)}
      {row("Biggest risk", analysis.biggestRisk?.label)}
      {row("Opponent matchup", analysis.opponentMatchup)}
      <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 5, lineHeight: 1.45 }}>{analysis.constructionBlurb}</div>
    </div>
  );
}

function EmptySlot({ slot }) {
  return (
    <div className="chaos-empty-slot" data-slot={slot} aria-label={`Empty ${slot} slot`}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: T.onArenaDim }}>{slot}</div>
      <div style={{ fontSize: 10.5, color: T.onArenaDim, opacity: 0.7 }}>empty</div>
    </div>
  );
}

function TeamBoard({ title, side, roster, heldSlots, keptSlots = [], onToggle, interactive, busy, analysis, locked }) {
  const accent = side === "gold" ? T.goldOnDark : T.blueOnDark;
  return (
    <div className="chaos-board">
      <div style={{ textAlign: "center", marginBottom: 8 }}><Label tone={accent}>{title}</Label></div>
      <div className="chaos-roster">
        {BOARD_ROWS.map((row) => (
          <div key={row.join("-")} className={`chaos-roster-row chaos-roster-row--${row.length === 2 ? "two" : "three"}`}>
            {row.map((slot) => {
              const c = roster?.[SLOTS.indexOf(slot)];
              if (!c) return <EmptySlot key={slot} slot={slot} />;
              return (
                <ChaosCard key={c.id} card={c} side={side}
                  held={heldSlots.includes(c.slot)} kept={keptSlots.includes(c.slot)}
                  interactive={interactive} locked={locked} disabled={busy}
                  onToggle={() => onToggle?.(c.slot)} />
              );
            })}
          </div>
        ))}
      </div>
      {analysis && <RosterRead analysis={analysis} />}
    </div>
  );
}

export default function ChaosClash({ tier = "GUEST", onReady, onGated, challengeId, onRunChange, hideEraBanner = false, hideReadyBlock = false }) {
  const [run, setRun] = useState(null);
  const [holds, setHolds] = useState([]);
  const [coachHolds, setCoachHolds] = useState([]);
  const [pickedCoach, setPickedCoach] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const resumed = useRef(false);

  /** Adopt a server view, seeding the pending hold sets from what is held. */
  const adopt = useCallback((chaos) => {
    setRun(chaos);
    // Cards kept through the previous roll start the next round SELECTED, so a
    // user who wants to keep them does not have to re-hold them (and cannot
    // lose them by forgetting).
    setHolds(chaos?.gold?.heldSlots || []);
    setCoachHolds(chaos?.coachDraft?.heldRoles || []);
    if (chaos?.chaosRunId) store.set(chaos.chaosRunId);
    // The Arena Command Center's Result Dock reads the same run this component
    // renders, so there is one source of truth for both surfaces.
    onRunChange?.(chaos);
  }, [onRunChange]);

  // Resume an active run rather than silently starting a new one. This is what
  // stops repeated navigation from farming fresh opening rolls.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (challengeId) return;
    // Nothing to resume means the board is EMPTY, so the shell around it must
    // drop any run it is still holding. Otherwise the previous game's era,
    // roll strip and Run button survive on top of a blank board.
    const forget = () => { store.clear(); onRunChange?.(null); };
    const id = store.get();
    if (!id) { onRunChange?.(null); return; }
    viewChaos(id, tier)
      .then((r) => { if (r?.chaos && r.chaos.status !== "ABANDONED") adopt(r.chaos); else forget(); })
      .catch(forget);
  }, [tier, challengeId, adopt, onRunChange]);

  const roll1 = async () => {
    setBusy(true); setError(null);
    try {
      const r = await startChaos({ tier, challengeId });
      if (r.gated) { onGated?.(r.gate); setBusy(false); return; }
      adopt(r.chaos); setChallenge(null);
    } catch (e) { setError(e.message || "Could not start a Chaos Clash."); }
    setBusy(false);
  };

  const toggle = (slot) => setHolds((h) => (h.includes(slot) ? h.filter((s) => s !== slot) : [...h, slot]));
  const toggleCoach = (role) => setCoachHolds((h) => (h.includes(role) ? h.filter((r) => r !== role) : [...h, role]));

  const lockHolds = async () => {
    setBusy(true); setError(null);
    try { adopt((await submitChaosHolds(run.chaosRunId, holds, tier)).chaos); }
    catch (e) { setError(e.message || "Could not lock those holds."); }
    setBusy(false);
  };

  const rollCoaches = async () => {
    setBusy(true); setError(null);
    try { adopt((await submitChaosCoachHolds(run.chaosRunId, coachHolds, tier)).chaos); }
    catch (e) { setError(e.message || "Could not roll the coaches."); }
    setBusy(false);
  };

  const hireCoach = async () => {
    if (!pickedCoach) return;
    setBusy(true); setError(null);
    try {
      const r = await chooseChaosCoach(run.chaosRunId, pickedCoach, tier);
      adopt(r.chaos); onReady?.(r.chaos);
    } catch (e) { setError(e.message || "Could not hire that coach."); }
    setBusy(false);
  };

  const abandon = async () => {
    setBusy(true);
    try { await abandonChaos(run.chaosRunId, tier); } catch { /* the local reset still stands */ }
    store.clear();
    setRun(null); setHolds([]); setCoachHolds([]); setPickedCoach(null);
    setConfirmAbandon(false); setChallenge(null); setBusy(false);
    onRunChange?.(null);
  };

  const makeChallenge = async () => {
    try { setChallenge((await publishChaosChallenge(run.chaosRunId, tier)).challengeId); }
    catch { /* a failed share must never break the run */ }
  };

  // ── EMPTY: nothing is drawn until the user asks for it ─────────────────────
  if (!run) {
    return (
      <div className="ec-arena-inset" style={{ borderRadius: R.lg, padding: "16px 16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Label tone={T.goldOnDark}>CHAOS CLASH</Label>
          <div style={{ fontWeight: 900, fontSize: 14, color: T.onArena, letterSpacing: 1 }}>THREE ROLLS AVAILABLE</div>
          <Label>DRAFT PRESSURE —</Label>
        </div>
        {!hideEraBanner && <div style={{ marginBottom: 12 }}><EraContextBanner era={null} /></div>}
        <div className="chaos-boards">
          <TeamBoard title="TEAM GOLD" side="gold" roster={null} heldSlots={[]} />
          <TeamBoard title="TEAM BLUE · LEGEND" side="blue" roster={null} heldSlots={[]} />
        </div>
        <button onClick={roll1} disabled={busy} style={{
          marginTop: 14, minHeight: 54, width: "100%", borderRadius: R.sm, cursor: busy ? "default" : "pointer",
          fontWeight: 900, fontSize: 15, letterSpacing: 1.2,
          border: `1px solid ${T.goldOnDark}`, background: T.goldOnDark, color: T.arena, opacity: busy ? 0.6 : 1,
        }}>{busy ? "ROLLING…" : "ROLL 1"}</button>
        {error && <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: T.onArena, textAlign: "center" }}>{error}</div>}
      </div>
    );
  }

  const inCoachDraft = !!run.coachDraft && !run.coachDraft.selecting && run.phase !== "READY" && run.phase !== "SIMULATED";
  const inCoachSelect = !!run.coachDraft?.selecting;
  const isReady = run.phase === "READY" || run.phase === "SIMULATED";
  const drafting = run.roll <= 2 && !run.rostersLocked;
  const rollCta = run.roll === 1 ? "LOCK HOLDS & ROLL 2" : "LOCK HOLDS & FINAL ROLL";

  const stage = drafting ? `ROLL ${run.roll} OF ${run.totalRolls}`
    : inCoachDraft ? `COACH ROLL ${run.coachDraft.roll} OF ${run.coachDraft.totalRolls}`
      : inCoachSelect ? "CHOOSE YOUR COACH" : "ROSTERS LOCKED";

  return (
    <div className="ec-arena-inset" style={{ borderRadius: R.lg, padding: "16px 16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Label tone={T.goldOnDark}>CHAOS CLASH</Label>
        <div style={{ fontWeight: 900, fontSize: 14, color: T.onArena, letterSpacing: 1 }}>{stage}</div>
        <div title={run.draftPressure?.tooltip} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Label>DRAFT PRESSURE</Label>
          <span style={{ fontWeight: 900, fontSize: 12.5, color: PRESSURE_COLOR[run.draftPressure?.level] }}>
            {run.draftPressure?.level}
          </span>
        </div>
      </div>

      {/* The era never leaves the screen once it is revealed. The shell may own
          this banner, in which case it is not repeated here. */}
      {!hideEraBanner && <div style={{ marginBottom: 12 }}><EraContextBanner era={run.eraContext} /></div>}

      <div className="sr-only" aria-live="polite">{stage}</div>

      <div className="chaos-boards">
        <TeamBoard title="TEAM GOLD" side="gold" roster={run.gold.roster}
          heldSlots={drafting ? holds : run.gold.heldSlots}
          keptSlots={run.roll > 1 ? run.gold.heldSlots : []}
          onToggle={toggle} interactive={drafting} locked={!drafting}
          busy={busy} analysis={run.gold.analysis} />
        <TeamBoard title="TEAM BLUE · LEGEND" side="blue" roster={run.blue.roster}
          heldSlots={run.blue.heldSlots} keptSlots={run.roll > 1 ? run.blue.heldSlots : []}
          interactive={false} locked={!drafting} busy={busy} analysis={run.blue.analysis} />
      </div>

      {run.roll > 1 && drafting && (
        <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 8, textAlign: "center" }}>
          Team Blue's holds were locked before yours were submitted.
        </div>
      )}

      {drafting && (
        <>
          <button onClick={lockHolds} disabled={busy} style={{
            marginTop: 14, minHeight: 52, width: "100%", borderRadius: R.sm, cursor: busy ? "default" : "pointer",
            fontWeight: 900, fontSize: 14.5, letterSpacing: 1.2,
            border: `1px solid ${T.goldOnDark}`, background: T.goldOnDark, color: T.arena, opacity: busy ? 0.6 : 1,
          }}>{busy ? "ROLLING…" : rollCta}</button>
          <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 7, textAlign: "center", lineHeight: 1.5 }}>
            {holds.length ? `Holding ${holds.length} of 5. ` : "Holding nobody. "}
            Anyone you release is out of this Clash for good.
          </div>
        </>
      )}

      {(inCoachDraft || inCoachSelect) && (
        <div style={{ marginTop: 14 }}>
          <Label tone={T.goldOnDark}>{inCoachSelect ? "CHOOSE YOUR COACH" : "COACH DRAFT"}</Label>
          <div style={{ fontSize: 12, color: T.onArenaDim, margin: "4px 0 10px" }}>
            {inCoachSelect
              ? "Three staffs are on the table. Take one."
              : "Hold the staffs you want to keep, then roll the rest. A released coach is out of this Clash."}
          </div>
          <div className="chaos-offers">
            {run.coachDraft.offers.map((o) => (
              <CoachOfferCard key={o.role} offer={o}
                mode={inCoachSelect ? "select" : "hold"}
                held={coachHolds.includes(o.role)} onToggle={() => toggleCoach(o.role)}
                selected={pickedCoach === o.coachId} onSelect={() => setPickedCoach(o.coachId)}
                disabled={busy} />
            ))}
          </div>
          {inCoachDraft ? (
            <>
              <button onClick={rollCoaches} disabled={busy} style={{
                marginTop: 12, minHeight: 50, width: "100%", borderRadius: R.sm, cursor: busy ? "default" : "pointer",
                fontWeight: 900, fontSize: 14, letterSpacing: 1,
                border: `1px solid ${T.goldOnDark}`, background: T.goldOnDark, color: T.arena, opacity: busy ? 0.6 : 1,
              }}>{busy ? "ROLLING…" : run.coachDraft.roll === 2 ? "LOCK HOLDS & FINAL COACH ROLL" : "LOCK HOLDS & ROLL COACHES"}</button>
              <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 7, textAlign: "center" }}>
                {coachHolds.length ? `Holding ${coachHolds.length} of 3.` : "Holding nobody."}{" "}
                Team Blue is drafting its own staff under the same rules.
              </div>
            </>
          ) : (
            <button onClick={hireCoach} disabled={!pickedCoach || busy} style={{
              marginTop: 12, minHeight: 50, width: "100%", borderRadius: R.sm,
              cursor: pickedCoach && !busy ? "pointer" : "default",
              fontWeight: 900, fontSize: 14, letterSpacing: 1,
              border: `1px solid ${pickedCoach ? T.goldOnDark : T.arenaBorder}`,
              background: pickedCoach ? T.goldOnDark : "transparent",
              color: pickedCoach ? T.arena : T.onArenaDim, opacity: busy ? 0.6 : 1,
            }}>{busy ? "HIRING…" : "HIRE THIS COACH"}</button>
          )}
        </div>
      )}

      {isReady && !hideReadyBlock && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, color: T.onArena, textAlign: "center" }}>
            Rosters and coaches are locked. Run the sim to play it out.
          </div>
          <button onClick={makeChallenge} style={{
            marginTop: 10, minHeight: 44, width: "100%", borderRadius: R.sm, cursor: "pointer",
            fontWeight: 800, fontSize: 12.5, letterSpacing: 0.6,
            border: `1px solid ${T.arenaBorder}`, background: "transparent", color: T.onArenaDim,
          }}>CHALLENGE THIS CHAOS</button>
          {challenge && (
            <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 7, textAlign: "center", wordBreak: "break-all" }}>
              Same opening rolls, same rules, their own decisions:{" "}
              <span style={{ color: T.goldOnDark }}>{`${window.location.origin}/?chaos=${challenge}`}</span>
            </div>
          )}
        </div>
      )}

      {/* An explicit way out, so nobody is trapped in a draft. */}
      <div style={{ marginTop: 16, textAlign: "center" }}>
        {confirmAbandon ? (
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ fontSize: 12, color: T.onArenaDim }}>Abandon this draft? It cannot be resumed.</span>
            <button onClick={abandon} style={{ minHeight: 40, padding: "0 14px", borderRadius: R.sm, cursor: "pointer", fontWeight: 800, fontSize: 12, border: `1px solid ${T.arenaBorder}`, background: "transparent", color: T.onArena }}>Yes, abandon</button>
            <button onClick={() => setConfirmAbandon(false)} style={{ minHeight: 40, padding: "0 14px", borderRadius: R.sm, cursor: "pointer", fontWeight: 800, fontSize: 12, border: "none", background: "transparent", color: T.onArenaDim }}>Keep drafting</button>
          </div>
        ) : (
          <button onClick={() => setConfirmAbandon(true)} style={{
            minHeight: 40, padding: "0 14px", borderRadius: R.sm, cursor: "pointer",
            fontWeight: 700, fontSize: 11.5, border: "none", background: "transparent",
            color: T.onArenaDim, textDecoration: "underline",
          }}>Abandon this draft</button>
        )}
      </div>

      {error && <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: T.onArena, textAlign: "center" }}>{error}</div>}
    </div>
  );
}
