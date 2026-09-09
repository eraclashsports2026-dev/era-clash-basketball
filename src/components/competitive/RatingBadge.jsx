// ── A compact competitive identity: "#38 · 1,146" or "RATING 1,146" ─────────
// Phase 9E. Numeric only — no invented league tiers while the distribution is
// still being learned.
import { fmt } from "../../competitive/contract.js";

export default function RatingBadge({ rating, rank = null, provisional = false, size = "md" }) {
  if (rating == null) return null;
  return (
    <span className="ec-cr-badge" data-size={size} data-provisional={provisional ? "true" : "false"} data-rank={rank ?? undefined}
      aria-label={rank ? `Rank ${rank}, Competitive Rating ${fmt(rating)}` : `Competitive Rating ${fmt(rating)}${provisional ? ", provisional" : ""}`}>
      {rank ? <><b>#{rank}</b><span aria-hidden="true"> · </span>{fmt(rating)}</> : <><span className="ec-cr-badge-k">RATING</span> {fmt(rating)}</>}
      {provisional && !rank && <span className="ec-cr-badge-tag">PROVISIONAL</span>}
    </span>
  );
}
