// ── Era Reveal ───────────────────────────────────────────────────────────────
// Phase 9B.3, state 3. The server reveals the era WITH Roll 2 (runState.js) and
// this is the one moment the arena makes it the focus: the era's name, its real
// rule facts, and one action — adapt. Nothing here decides anything; the run
// already carries the era, and continuing only records that it has been seen.
//
// Approved fracture placement 4 is "era reveal → .ec-intel-era[data-revealed]",
// so this panel wears that hook and no new fracture is introduced.
import { EraFractureDivider } from "../brand/EraFracture.jsx";

const clean = (s) => String(s || "").replace(/\.$/, "").trim();

/**
 * A fact, read as a headline: its first clause, capped at a word boundary. The
 * whole fact stays on the card as its title and for screen readers, so nothing
 * is lost — only shortened. Never a fixture: every string is the run's own.
 */
export const headline = (fact, max = 34) => {
  const first = clean(fact).split(/\s*[;:(—–]\s*/)[0].trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max).replace(/\s+\S*$/, "");
  return `${cut}…`;
};

/** The three rule cards, from the run's real era context: highlights first. */
export const eraRuleCards = (run) => {
  const ctx = run?.eraContext || {};
  const seen = new Set();
  const out = [];
  for (const f of [...(ctx.highlights || []), ...(ctx.ruleFacts || []), ctx.pace, ctx.rebounding]) {
    const full = clean(f);
    if (!full || seen.has(full)) continue;
    seen.add(full);
    out.push({ full, short: headline(full) });
    if (out.length === 3) break;
  }
  return out;
};

export default function EraRevealPanel({ run, onContinue, onRules, busy = false }) {
  const era = run?.eraState?.eraStyleId;
  if (!era) return null;
  const cards = eraRuleCards(run);
  const custom = !!run?.eraState?.custom;

  return (
    <section className="ec-era-reveal ec-intel-era" data-revealed="true" aria-labelledby="ec-era-reveal-title">
      <div className="ec-era-reveal-kicker">ERA REVEALED</div>
      <h2 id="ec-era-reveal-title" className="ec-era-reveal-id">{era}</h2>
      <EraFractureDivider width="56%" className="ec-era-reveal-rule" />
      {cards.length > 0 && (
        <ul className="ec-era-reveal-cards" aria-label={`${era} rules`}>
          {cards.map((c) => (
            <li key={c.full} className="ec-era-reveal-card" title={c.full}>
              <span aria-hidden="true">{c.short}</span>
              <span className="sr-only">{c.full}</span>
            </li>
          ))}
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
