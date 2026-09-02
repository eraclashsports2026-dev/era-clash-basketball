// ── "Continue your Chaos Clash" ──────────────────────────────────────────────
// Shown above the lobby's mode grid when this browser holds an unfinished,
// server-authoritative run. Everything on it is read from the run's PUBLIC view
// (the same view the arena renders), so nothing unrevealed can leak here: the
// era shows only once the server has revealed it, and the Legend CPU's holds
// are never mentioned. Time since last activity is the browser's own record of
// when it last touched the run, not a server field.
import { useEffect, useRef, useState } from "react";
import ModeGlyph from "./ModeGlyph.jsx";

const STAGE_LINE = (run) => {
  if (!run) return "";
  if (run.phase === "READY") return "Ready to run · rosters and staff locked";
  if (run.coachDraft?.selecting) return "Roll 3 of 3 · choose your staff";
  if (run.phase === "ROLL_1_REVEALED" || run.phase === "ROLL_2_REVEALED") return `Roll ${run.roll} of ${run.totalRolls || 3} · deciding holds`;
  return `Roll ${run.roll || 1} of ${run.totalRolls || 3}`;
};

/** Coarse and honest: "just now", "12 minutes ago", "3 hours ago". */
export const agoLabel = (at, now = Date.now()) => {
  if (!at) return null;
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
};

export default function ContinueCard({ run, lastActivityAt, expired = false, busy = false, onContinue, onAbandon, onDismiss }) {
  const [, tick] = useState(0);
  const ref = useRef(null);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  if (expired) {
    return (
      <section className="ec-continue ec-continue--expired" aria-labelledby="ec-continue-title" ref={ref}>
        <div className="ec-continue-glyph" aria-hidden="true"><ModeGlyph id="chaos" size={30} /></div>
        <div className="ec-continue-body">
          <h2 id="ec-continue-title" className="ec-continue-title">YOUR CHAOS CLASH EXPIRED</h2>
          <p className="ec-continue-line">Runs stay open for six hours. This one has closed; nothing was recorded. Start a new Clash whenever you like.</p>
        </div>
        <div className="ec-continue-actions">
          <button className="ec-continue-quiet" onClick={onDismiss}>DISMISS</button>
        </div>
      </section>
    );
  }
  if (!run) return null;

  const held = run.gold?.heldSlots?.length || 0;
  const era = run.eraState?.revealed ? run.eraState.eraStyleId : null;
  const ago = agoLabel(lastActivityAt);
  return (
    <section className="ec-continue" aria-labelledby="ec-continue-title" data-phase={run.phase}>
      <div className="ec-continue-glyph" aria-hidden="true"><ModeGlyph id="chaos" size={30} /></div>
      <div className="ec-continue-body">
        <h2 id="ec-continue-title" className="ec-continue-title">CONTINUE YOUR CHAOS CLASH</h2>
        <p className="ec-continue-line">
          <span>{STAGE_LINE(run)}</span>
          <span aria-hidden="true"> · </span>
          <span>{era ? `${era} era` : "era not yet revealed"}</span>
          {ago && <><span aria-hidden="true"> · </span><span>last activity {ago}</span></>}
        </p>
        <p className="ec-continue-teams">
          <span className="ec-continue-team ec-continue-team--gold">
            <span className="ec-continue-team-name">TEAM GOLD</span> your five{held ? ` · ${held} held` : ""}
          </span>
          <span className="ec-continue-team ec-continue-team--blue">
            <span className="ec-continue-team-name">TEAM BLUE</span> Legend CPU
          </span>
        </p>
      </div>
      <div className="ec-continue-actions">
        <button className="ec-continue-cta" onClick={onContinue} disabled={busy}
          aria-label="Continue your Chaos Clash where you left it">CONTINUE</button>
        <button className="ec-continue-quiet" onClick={onAbandon} disabled={busy}
          aria-label="Abandon this Chaos Clash">ABANDON</button>
      </div>
    </section>
  );
}
