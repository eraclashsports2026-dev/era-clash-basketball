// ── My EraClash → Overview → COMPETITIVE ─────────────────────────────────────
// Phase 9E. A restrained module: the rating, the rated record and one status
// line (#38 GLOBAL · PROVISIONAL with progress · PRIVATE). No new tab; the
// Challenges tab holds the match history, the Leaderboard holds the rankings.
import { useEffect, useRef } from "react";
import { COMPETITIVE_EVENTS, fmt } from "../../competitive/contract.js";
import { track } from "../../analytics.js";

export const statusLine = (me) => {
  if (!me) return { k: "STATUS", v: "—" };
  if (me.record.matches === 0) return { k: "STATUS", v: "NO RATED CHALLENGES YET" };
  if (me.provisional) return { k: "PROVISIONAL", v: `${me.placement.matches} / ${me.placement.matchesTarget} MATCHES · ${me.placement.opponents} / ${me.placement.opponentsTarget} OPPONENTS` };
  if (me.visibility !== "public") return { k: "STATUS", v: "PLACED · PRIVATE" };
  return { k: "STATUS", v: me.rank ? `#${me.rank} GLOBAL` : "PLACED · PUBLIC" };
};

export default function CompetitiveModule({ me, loading = false, onOpenLeaderboard }) {
  const seen = useRef(false);
  const ok = me?.status === "ok";
  useEffect(() => { if (ok && !seen.current) { seen.current = true; track(COMPETITIVE_EVENTS.RATING_VIEWED, { provisional: !!me.provisional, ratedMatchCount: Math.min(me.record.matches, 9999), visibility: me.visibility }); } }, [ok, me]);
  if (loading) return <section className="ec-cr-module" aria-labelledby="ec-cr-module-title"><h2 id="ec-cr-module-title" className="ec-cr-section">COMPETITIVE</h2><p className="ec-cr-muted">Loading your competitive rating…</p></section>;
  if (!ok) return <section className="ec-cr-module" aria-labelledby="ec-cr-module-title"><h2 id="ec-cr-module-title" className="ec-cr-section">COMPETITIVE</h2><p className="ec-cr-muted">Your competitive rating could not be loaded just now. It is safe on the server.</p></section>;
  const st = statusLine(me);
  return (
    <section className="ec-cr-module" aria-labelledby="ec-cr-module-title" data-provisional={me.provisional ? "true" : "false"} data-visibility={me.visibility}>
      <h2 id="ec-cr-module-title" className="ec-cr-section">COMPETITIVE</h2>
      <dl className="ec-cr-module-stats">
        <div><dt>RATING</dt><dd className="ec-cr-module-rating">{fmt(me.rating)}</dd></div>
        <div><dt>RECORD</dt><dd>{me.record.wins}–{me.record.losses}–{me.record.ties}</dd></div>
        <div><dt>{st.k}</dt><dd className="ec-cr-module-status">{st.v}</dd></div>
      </dl>
      <p className="ec-cr-muted">Challenge Rating measures results against other EraClash players in official Challenges. It is separate from career XP and never changes the basketball.</p>
      {onOpenLeaderboard && <button type="button" className="ec-cr-btn" onClick={onOpenLeaderboard}>OPEN LEADERBOARD</button>}
    </section>
  );
}
