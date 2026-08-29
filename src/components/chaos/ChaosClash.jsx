// ── Chaos Clash — the default Play experience ────────────────────────────────
// Three rolls, hold/reroll decisions, an Era Reveal that lands before the final
// holds, then three coach offers. The CPU is always Legend; there is no
// difficulty control anywhere in this flow.
import { useState, useEffect, useCallback, useRef } from "react";
import { T, R } from "../../theme.js";
import ChaosCard from "./ChaosCard.jsx";
import { startChaos, submitChaosHolds, chooseChaosCoach, publishChaosChallenge } from "../../chaos/client.js";

const SLOTS = ["PG", "SG", "SF", "PF", "C"];

const PRESSURE_COLOR = { LOW: T.onArenaDim, RISING: T.goldOnDark, HIGH: T.orange || T.goldOnDark };

const Label = ({ children, tone = T.onArenaDim }) => (
  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: tone }}>{children}</div>
);

function TeamColumn({ title, side, roster, heldSlots, keptSlots = [], onToggle, interactive, busy, analysis }) {
  const accent = side === "gold" ? T.goldOnDark : T.blueOnDark;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <Label tone={accent}>{title}</Label>
      </div>
      <div className="chaos-roster">
        {roster.map((c, i) => (
          <ChaosCard key={c?.id || SLOTS[i]} card={c} side={side}
            held={heldSlots.includes(c?.slot)} interactive={interactive}
            kept={keptSlots.includes(c?.slot)}
            disabled={busy} onToggle={() => onToggle?.(c.slot)} />
        ))}
      </div>
      {analysis && <RosterRead analysis={analysis} />}
    </div>
  );
}

function RosterRead({ analysis }) {
  if (!analysis) return null;
  const row = (k, v) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "3px 0" }}>
      <span style={{ color: T.onArenaDim }}>{k}</span>
      <span style={{ color: T.onArena, fontWeight: 700, textAlign: "right" }}>{v}</span>
    </div>
  );
  return (
    <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: R.sm, border: `1px solid ${T.arenaBorder}`, background: "rgba(255,255,255,0.03)" }}>
      {row("Talent", analysis.talentTier)}
      {row("Construction", analysis.constructionTier)}
      {analysis.bestStrength && row("Best strength", analysis.bestStrength.label)}
      {analysis.biggestRisk && row("Biggest risk", analysis.biggestRisk.label)}
      {analysis.opponentMatchup && row("Opponent matchup", analysis.opponentMatchup)}
      <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 5, lineHeight: 1.45 }}>{analysis.constructionBlurb}</div>
    </div>
  );
}

function EraReveal({ era, onContinue }) {
  return (
    <div role="region" aria-label="Era reveal" style={{
      marginTop: 14, padding: "16px 18px", borderRadius: R.md,
      border: `1px solid ${T.goldOnDark}`, background: "rgba(233,185,73,0.08)",
    }}>
      <Label tone={T.goldOnDark}>ERA REVEAL</Label>
      <div style={{ fontSize: 26, fontWeight: 900, color: T.onArena, margin: "4px 0 10px" }}>{era.eraId}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
        {[era.threePoint, era.defensiveLegality, era.physicality, era.pace, era.rebounding].map((f) => (
          <li key={f} style={{ fontSize: 12.5, color: T.onArenaDim, lineHeight: 1.5 }}>· {f}</li>
        ))}
      </ul>
      {!!era.goldImplications?.length && (
        <div style={{ marginTop: 12 }}>
          <Label>WHAT THIS MEANS FOR TEAM GOLD</Label>
          {era.goldImplications.map((t) => (
            <div key={t} style={{ fontSize: 12.5, color: T.onArena, lineHeight: 1.55, marginTop: 4 }}>{t}</div>
          ))}
        </div>
      )}
      {(era.goldSwing?.gains?.length || era.goldSwing?.loses?.length) ? (
        <div style={{ marginTop: 10, fontSize: 12.5, color: T.onArenaDim, lineHeight: 1.55 }}>
          {era.goldSwing.gains.length ? <div><strong style={{ color: T.onArena }}>Gains opportunity:</strong> {era.goldSwing.gains.join(", ")}</div> : null}
          {era.goldSwing.loses.length ? <div><strong style={{ color: T.onArena }}>Loses opportunity:</strong> {era.goldSwing.loses.join(", ")}</div> : null}
        </div>
      ) : null}
      <div style={{ fontSize: 12, color: T.onArenaDim, marginTop: 10, lineHeight: 1.5 }}>
        Your final roll is the last chance to adapt to this environment.
      </div>
      <button onClick={onContinue} style={{
        marginTop: 12, minHeight: 46, width: "100%", borderRadius: R.sm, cursor: "pointer",
        fontWeight: 900, fontSize: 13.5, letterSpacing: 1,
        border: `1px solid ${T.goldOnDark}`, background: T.goldOnDark, color: T.arena,
      }}>MAKE MY FINAL HOLDS</button>
    </div>
  );
}

function CoachOffers({ offers, onPick, busy }) {
  const [sel, setSel] = useState(null);
  return (
    <div style={{ marginTop: 12 }}>
      <Label tone={T.goldOnDark}>CHOOSE YOUR COACH</Label>
      <div style={{ fontSize: 12, color: T.onArenaDim, margin: "4px 0 10px" }}>
        Three staffs will take this roster. Each wants a different game.
      </div>
      <div className="chaos-offers">
        {offers.map((o) => (
          <button key={o.coachId} onClick={() => setSel(o.coachId)} aria-pressed={sel === o.coachId}
            style={{
              textAlign: "left", borderRadius: R.md, padding: 13, cursor: "pointer",
              border: `1px solid ${sel === o.coachId ? T.goldOnDark : T.arenaBorder}`,
              background: sel === o.coachId ? "rgba(233,185,73,0.10)" : "rgba(255,255,255,0.04)",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
            <Label tone={T.goldOnDark}>{o.roleLabel.toUpperCase()}</Label>
            <div style={{ fontWeight: 900, fontSize: 15.5, color: T.onArena }}>{o.name}</div>
            <div style={{ fontSize: 11.5, color: T.onArenaDim }}>{o.roleBlurb}</div>
            <div style={{ height: 1, background: T.arenaBorder, margin: "3px 0" }} />
            {[o.offense, o.central, o.targets, o.defense, o.era].filter(Boolean).map((line) => (
              <div key={line} style={{ fontSize: 12, color: T.onArena, lineHeight: 1.5 }}>{line}</div>
            ))}
            <div style={{ fontSize: 11.5, color: T.onArenaDim, lineHeight: 1.5, fontStyle: "italic" }}>
              Tradeoff: {o.sacrifice}
            </div>
          </button>
        ))}
      </div>
      <button disabled={!sel || busy} onClick={() => onPick(sel)} style={{
        marginTop: 12, minHeight: 50, width: "100%", borderRadius: R.sm,
        cursor: sel && !busy ? "pointer" : "default",
        fontWeight: 900, fontSize: 14, letterSpacing: 1,
        border: `1px solid ${sel ? T.goldOnDark : T.arenaBorder}`,
        background: sel ? T.goldOnDark : "transparent",
        color: sel ? T.arena : T.onArenaDim, opacity: busy ? 0.6 : 1,
      }}>{busy ? "LOCKING…" : "HIRE THIS COACH"}</button>
    </div>
  );
}

export default function ChaosClash({ tier = "GUEST", onReady, onGated, challengeId }) {
  const [run, setRun] = useState(null);
  const [holds, setHolds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [eraAcked, setEraAcked] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const started = useRef(false);

  const begin = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await startChaos({ tier, challengeId });
      if (r.gated) { onGated?.(r.gate); setBusy(false); return; }
      setRun(r.chaos); setHolds([]); setEraAcked(false); setChallenge(null);
    } catch (e) { setError(e.message || "Could not start a Chaos Clash."); }
    setBusy(false);
  }, [tier, challengeId, onGated]);

  useEffect(() => { if (!started.current) { started.current = true; begin(); } }, [begin]);

  const toggle = (slot) => setHolds((h) => (h.includes(slot) ? h.filter((s) => s !== slot) : [...h, slot]));

  const lockHolds = async () => {
    setBusy(true); setError(null);
    try {
      const r = await submitChaosHolds(run.chaosRunId, holds, tier);
      setRun(r.chaos); setHolds([]); setEraAcked(false);
    } catch (e) { setError(e.message || "Could not lock those holds."); }
    setBusy(false);
  };

  const pickCoach = async (coachId) => {
    setBusy(true); setError(null);
    try {
      const r = await chooseChaosCoach(run.chaosRunId, coachId, tier);
      setRun(r.chaos);
      onReady?.(r.chaos);
    } catch (e) { setError(e.message || "Could not hire that coach."); }
    setBusy(false);
  };

  const makeChallenge = async () => {
    try {
      const r = await publishChaosChallenge(run.chaosRunId, tier);
      setChallenge(r.challengeId);
    } catch { /* a failed share must never break the run */ }
  };

  if (error && !run) {
    return (
      <div style={{ textAlign: "center", padding: 26 }}>
        <div style={{ color: T.text, fontWeight: 700 }}>{error}</div>
        <button onClick={begin} style={{ marginTop: 12, minHeight: 44, padding: "0 20px", borderRadius: R.sm, cursor: "pointer", fontWeight: 800, border: `1px solid ${T.goldBorder}`, background: T.goldSoft, color: T.gold }}>Try again</button>
      </div>
    );
  }
  if (!run) return <div style={{ textAlign: "center", padding: 30, color: T.textDim }}>Rolling your Clash…</div>;

  const showEra = run.era && !eraAcked && run.phase === "ERA_REVEALED";
  const inCoachStage = run.phase === "COACH_OFFERS_REVEALED";
  const isReady = run.phase === "READY" || run.phase === "SIMULATED";
  const rollCta = run.roll === 1 ? "LOCK HOLDS & ROLL AGAIN" : "FINAL ROLL";

  return (
    <div className="ec-arena-inset" style={{ borderRadius: R.lg, padding: "16px 16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Label tone={T.goldOnDark}>CHAOS CLASH</Label>
        <div style={{ fontWeight: 900, fontSize: 14, color: T.onArena, letterSpacing: 1 }}>
          {isReady || inCoachStage ? "ROSTERS LOCKED" : `ROLL ${run.roll} OF ${run.totalRolls}`}
        </div>
        <div title={run.draftPressure.tooltip} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Label>DRAFT PRESSURE</Label>
          <span style={{ fontWeight: 900, fontSize: 12.5, color: PRESSURE_COLOR[run.draftPressure.level] }}>
            {run.draftPressure.level}
          </span>
        </div>
      </div>
      <div className="sr-only" aria-live="polite">
        {isReady ? "Rosters and coaches locked." : `Roll ${run.roll} of ${run.totalRolls}. Draft pressure ${run.draftPressure.level}.`}
      </div>

      <div className="chaos-boards">
        <TeamColumn title="TEAM GOLD" side="gold" roster={run.gold.roster}
          heldSlots={isReady || inCoachStage ? run.gold.heldSlots : holds}
          keptSlots={run.roll > 1 ? run.gold.heldSlots : []}
          onToggle={toggle} interactive={!inCoachStage && !isReady}
          busy={busy || showEra}
          analysis={run.gold.analysis} />
        <TeamColumn title="TEAM BLUE · LEGEND" side="blue" roster={run.blue.roster}
          heldSlots={run.blue.heldSlots} keptSlots={run.roll > 1 ? run.blue.heldSlots : []}
          interactive={false} busy={busy}
          analysis={run.blue.analysis} />
      </div>

      {run.roll > 1 && !inCoachStage && !isReady && (
        <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 8, textAlign: "center" }}>
          Team Blue's holds were locked before yours were submitted.
        </div>
      )}

      {showEra && <EraReveal era={run.era} onContinue={() => setEraAcked(true)} />}

      {!showEra && !inCoachStage && !isReady && (
        <>
          <button onClick={lockHolds} disabled={busy} style={{
            marginTop: 14, minHeight: 52, width: "100%", borderRadius: R.sm, cursor: busy ? "default" : "pointer",
            fontWeight: 900, fontSize: 14.5, letterSpacing: 1.2,
            border: `1px solid ${T.goldOnDark}`, background: T.goldOnDark, color: T.arena, opacity: busy ? 0.6 : 1,
          }}>{busy ? "ROLLING…" : rollCta}</button>
          <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 7, textAlign: "center", lineHeight: 1.5 }}>
            {holds.length ? `Holding ${holds.length}. ` : "Holding nobody. "}
            Anyone you release is out of this Clash for good.
          </div>
        </>
      )}

      {inCoachStage && <CoachOffers offers={run.coachOffers} onPick={pickCoach} busy={busy} />}

      {isReady && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, color: T.onArena, textAlign: "center" }}>
            Rosters and coaches are locked. Run the Clash to play it out.
          </div>
          <button onClick={makeChallenge} style={{
            marginTop: 10, minHeight: 44, width: "100%", borderRadius: R.sm, cursor: "pointer",
            fontWeight: 800, fontSize: 12.5, letterSpacing: 0.6,
            border: `1px solid ${T.arenaBorder}`, background: "transparent", color: T.onArenaDim,
          }}>CHALLENGE THIS CHAOS</button>
          {challenge && (
            <div style={{ fontSize: 11.5, color: T.onArenaDim, marginTop: 7, textAlign: "center", wordBreak: "break-all" }}>
              Share this link — same opening rolls, same rules, their own decisions:{" "}
              <span style={{ color: T.goldOnDark }}>{`${window.location.origin}/?chaos=${challenge}`}</span>
            </div>
          )}
        </div>
      )}

      {error && <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: T.onArena, textAlign: "center" }}>{error}</div>}
    </div>
  );
}
