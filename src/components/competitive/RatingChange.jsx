// ── COMPETITIVE RATING — the movement after a Challenge comparison ───────────
// Phase 9E. Rendered under CHALLENGE COMPLETE, after the comparison and before
// career XP. Rated: both movements, said in words and numbers (never colour
// alone). Unrated: the closed reason, and never a fake "+0" as though the
// rating ran. Nothing here computes; the server answered from the ledger.
import { useEffect, useRef } from "react";
import { UNRATED_COPY, COMPETITIVE_EVENTS, announceChange, fmt } from "../../competitive/contract.js";
import { track } from "../../analytics.js";

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

export default function RatingChange({ rating, surface = "dark" }) {
  const shown = useRef(false);
  useEffect(() => {
    if (!rating || shown.current) return;
    shown.current = true;
    track(COMPETITIVE_EVENTS.CHANGE_SHOWN, { success: rating.status === "ok", ...(rating.rated ? { ratingDelta: rating.you?.delta ?? 0, outcome: rating.outcome } : { reason: rating.reason || "not_eligible" }) });
  }, [rating]);
  if (!rating || rating.status !== "ok") return null;
  if (!rating.rated) {
    return (
      <section className="ec-cr-change" data-surface={surface} data-rated="false" aria-labelledby="ec-cr-change-title">
        <h2 id="ec-cr-change-title" className="ec-cr-kicker">UNRATED CHALLENGE</h2>
        <p className="ec-cr-body">{UNRATED_COPY[rating.reason] || UNRATED_COPY.not_eligible}</p>
      </section>
    );
  }
  if (!rating.you) return null;   // an observer's browser: nothing of theirs moved
  const { you, them } = rating;
  return (
    <section className="ec-cr-change" data-surface={surface} data-rated="true" data-delta={you.delta} aria-labelledby="ec-cr-change-title">
      <div className="ec-cr-head">
        <h2 id="ec-cr-change-title" className="ec-cr-kicker">COMPETITIVE RATING · RATED CHALLENGE</h2>
        <output className="ec-cr-sr" aria-live="polite">{announceChange(you.delta, you.after)}</output>
      </div>
      <div className="ec-cr-cols">
        <div className="ec-cr-col" data-side="you">
          <div className="ec-cr-col-k">YOU</div>
          <div className="ec-cr-col-rating">{fmt(you.after)}</div>
          <div className="ec-cr-col-delta" data-direction={you.delta > 0 ? "up" : you.delta < 0 ? "down" : "flat"}>{signed(you.delta)}<span className="ec-cr-sr"> {you.delta > 0 ? "up" : you.delta < 0 ? "down" : "no change"}</span></div>
        </div>
        {them && (
          <div className="ec-cr-col" data-side="them">
            <div className="ec-cr-col-k">{String(them.name || "Coach").toUpperCase()}</div>
            <div className="ec-cr-col-rating">{fmt(them.after)}</div>
            <div className="ec-cr-col-delta" data-direction={them.delta > 0 ? "up" : them.delta < 0 ? "down" : "flat"}>{signed(them.delta)}</div>
          </div>
        )}
      </div>
      <p className="ec-cr-foot">Challenge Rating {rating.ratingVersion}. The comparison decided the result; the rating moved from it.</p>
    </section>
  );
}
