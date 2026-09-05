// ── CHALLENGE COMPLETE: your result against the original ─────────────────────
// Phase 9C. Rendered in the result once the server has bound the recipient's
// stored result to their attempt. Two honest columns and one sentence decided
// by the comparison contract; the original's five and coach open only now.
import { useEffect } from "react";
import { comparisonLine, CHALLENGE_EVENTS } from "../../challenges/contract.js";
import { track } from "../../analytics.js";

const signed = (n) => (n > 0 ? `+${n}` : String(n));
const WORD = { win: "WIN", loss: "LOSS", tie: "TIE" };

export default function ChallengeComparison({ comparison, challenge, creatorName, state = "ready", onRetry }) {
  useEffect(() => { if (comparison) track(CHALLENGE_EVENTS.COMPARISON_VIEWED, { challengeVersion: challenge?.challengeVersion || "1.0.0", status: comparison.outcome }); }, [comparison?.outcome]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = creatorName || challenge?.creatorName || "the challenger";
  if (state === "pending") return <section className="ec-chal-cmp" aria-live="polite"><div className="ec-chal-kicker">CHALLENGE</div><p className="ec-chal-body">Comparing your result with {name}'s…</p></section>;
  if (state === "failed") return (
    <section className="ec-chal-cmp" aria-live="polite">
      <div className="ec-chal-kicker">CHALLENGE</div>
      <p className="ec-chal-body">Your Clash is complete and recorded, but the challenge comparison could not be saved. {onRetry ? "You can try again." : ""}</p>
      {onRetry && <button type="button" className="ec-chal-btn" onClick={onRetry}>RETRY COMPARISON</button>}
    </section>
  );
  if (!comparison) return null;
  const { recipient: you, creator: them, outcome } = comparison;
  return (
    <section className="ec-chal-cmp" data-outcome={outcome} aria-labelledby="ec-chal-cmp-title">
      <div className="ec-chal-kicker">CHALLENGE COMPLETE</div>
      <h2 id="ec-chal-cmp-title" className="ec-chal-title">{comparisonLine(comparison, name)}</h2>
      <div className="ec-chal-cols">
        <div className="ec-chal-col" data-side="you">
          <div className="ec-chal-col-k">YOUR RESULT</div>
          <div className="ec-chal-col-score">{you.gold}–{you.blue}</div>
          <div className="ec-chal-col-line"><span className={`ec-chal-tag ec-chal-tag--${you.outcome}`}>{WORD[you.outcome]}</span> <span>performance {signed(you.performance)}</span></div>
        </div>
        <div className="ec-chal-vs" aria-hidden="true">vs</div>
        <div className="ec-chal-col" data-side="original">
          <div className="ec-chal-col-k">ORIGINAL · {name.toUpperCase()}</div>
          <div className="ec-chal-col-score">{them.gold}–{them.blue}</div>
          <div className="ec-chal-col-line"><span className={`ec-chal-tag ec-chal-tag--${them.outcome}`}>{WORD[them.outcome]}</span> <span>performance {signed(them.performance)}</span></div>
          {challenge && (
            <div className="ec-chal-orig">
              {challenge.era && <div><b>ERA</b> {challenge.era}{challenge.eraCustom ? " · custom" : ""}</div>}
              {challenge.creatorCoach?.name && <div><b>COACH</b> {challenge.creatorCoach.name}</div>}
              {challenge.creatorMvp?.name && <div><b>MVP</b> {challenge.creatorMvp.name}{challenge.creatorMvp.pts ? ` · ${challenge.creatorMvp.pts} PTS` : ""}</div>}
              {challenge.creatorRoster?.length > 0 && <div><b>FIVE</b> {challenge.creatorRoster.map((p) => p.name || p.id).join(" · ")}</div>}
            </div>
          )}
        </div>
      </div>
      <p className="ec-chal-foot">Win or loss decides first; the margin breaks the tie. Comparison contract {comparison.comparisonVersion}.</p>
    </section>
  );
}
