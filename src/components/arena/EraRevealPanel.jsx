// ── Era Reveal ───────────────────────────────────────────────────────────────
// Phase 9B.3, state 3. The server reveals the era WITH Roll 2 (runState.js) and
// this is the one moment the arena makes it the focus: the era's name, its real
// rule facts, and one action — adapt. Nothing here decides anything; the run
// already carries the era, and continuing only records that it has been seen.
//
// Approved fracture placement 4 is "era reveal → .ec-intel-era[data-revealed]",
// so this panel wears that hook and no new fracture is introduced.
import { EraFractureDivider } from "../brand/EraFracture.jsx";

const clean = (s) => String(s || "").replace(/\.$/, "");

/** The three rule cards, from the run's real era context. Never a fixture. */
export const eraRuleCards = (run) => {
  const ctx = run?.eraContext || {};
  const facts = [...(ctx.ruleFacts || [])].filter(Boolean).map(clean);
  // Pace and rebounding are real reads too; they fill in only if fewer than
  // three rule facts exist, so the panel never invents a rule.
  for (const extra of [ctx.pace, ctx.rebounding]) if (facts.length < 3 && extra) facts.push(clean(extra));
  return facts.slice(0, 3);
};

export default function EraRevealPanel({ run, onContinue, onRules, busy = false }) {
  const era = run?.eraState?.eraStyleId;
  if (!era) return null;
  const ctx = run?.eraContext || {};
  const tagline = ctx.highlights?.[0] || null;
  const cards = eraRuleCards(run);
  const custom = !!run?.eraState?.custom;

  return (
    <section className="ec-era-reveal ec-intel-era" data-revealed="true" aria-labelledby="ec-era-reveal-title">
      <div className="ec-era-reveal-kicker">ERA REVEALED</div>
      <h2 id="ec-era-reveal-title" className="ec-era-reveal-id">{era}</h2>
      {tagline && <div className="ec-era-reveal-tag">{tagline}</div>}
      <EraFractureDivider width="56%" className="ec-era-reveal-rule" />
      {cards.length > 0 && (
        <ul className="ec-era-reveal-cards" aria-label={`${era} rules`}>
          {cards.map((f) => <li key={f} className="ec-era-reveal-card">{f}</li>)}
        </ul>
      )}
      <p className="ec-era-reveal-body">
        {custom ? "A chosen era, played by the same rules for both teams. " : "Both teams play by this era's rules. "}
        How will you adapt? Your final roll comes next.
      </p>
      <div className="ec-era-reveal-actions">
        {cards.length > 0 && (
          <button type="button" onClick={onRules} className="ec-era-reveal-more">VIEW ALL ERA RULES</button>
        )}
      </div>
    </section>
  );
}
