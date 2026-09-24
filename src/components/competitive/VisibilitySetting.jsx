// ── LEADERBOARD VISIBILITY — the owner's privacy control ─────────────────────
// Phase 9E. Private by default. Two labelled 44px controls; the choice is a
// preference written through the existing path and takes effect on the next
// leaderboard query. Changing it never touches the rating.
import { VISIBILITY, COMPETITIVE_EVENTS } from "../../competitive/contract.js";
import { track } from "../../analytics.js";

const COPY = {
  private: ["PRIVATE", "Your rating remains visible only to you."],
  public: ["PUBLIC", "Your display name, rating and competitive record may appear on the EraClash leaderboard."],
};

export default function VisibilitySetting({ visibility = "private", onChange, busy = false, compact = false }) {
  const pick = async (v) => {
    if (v === visibility || busy || !onChange) return;
    const ok = await onChange(v);
    track(COMPETITIVE_EVENTS.VISIBILITY_CHANGED, { visibility: v, success: ok !== false });
  };
  return (
    <div className="ec-cr-vis" data-compact={compact ? "true" : "false"} role="group" aria-labelledby="ec-cr-vis-title">
      <div id="ec-cr-vis-title" className="ec-cr-section">LEADERBOARD VISIBILITY</div>
      <div className="ec-cr-vis-options">
        {VISIBILITY.map((v) => (
          <button key={v} type="button" className="ec-cr-vis-opt" aria-pressed={visibility === v} disabled={busy} onClick={() => pick(v)}>
            <span className="ec-cr-vis-k">{COPY[v][0]}</span>
            <span className="ec-cr-vis-d">{COPY[v][1]}</span>
          </button>
        ))}
      </div>
      <p className="ec-cr-muted">Changing this never changes your rating. Private means private: no public rank, not even an estimate.</p>
    </div>
  );
}
