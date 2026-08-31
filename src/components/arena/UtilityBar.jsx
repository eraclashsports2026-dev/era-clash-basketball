// ── The arena's utility bar ──────────────────────────────────────────────────
// Help, settings, and the era this Clash is being played in. It sits under the
// primary CTA and is deliberately quieter than it: nothing here competes with
// the roll button.
//
// The era here is STATUS ONLY. Live Intel owns the explanation and the one
// membership route, because a second copy of both, 500 pixels away in the same
// viewport, reads as two different offers.

const LINKS = [
  ["HOW TO PLAY", "play", "📖"],
  ["STRATEGY GUIDE", "strategy", "🛡"],
  ["GLOSSARY", "glossary", "🔤"],
];

export default function UtilityBar({ eraState, onGuide, onSettings, onAbandon, canAbandon = false, compact = false }) {
  const era = eraState?.eraStyleId;
  const locked = !eraState?.change?.allowed;

  return (
    <div className="ec-ta-utility">
      <div className="ec-ta-utility-links">
        {compact ? (
          <button onClick={() => onGuide?.("play")}>
            <span aria-hidden="true">📖</span> HELP &amp; SETTINGS
          </button>
        ) : (
          <>
            {LINKS.map(([label, section, icon]) => (
              <button key={section} onClick={() => onGuide?.(section)}>
                <span aria-hidden="true" style={{ marginRight: 5 }}>{icon}</span>{label}
              </button>
            ))}
            <button onClick={onSettings}>
              <span aria-hidden="true" style={{ marginRight: 5 }}>⚙</span>SETTINGS
            </button>
            {canAbandon && (
              <button onClick={onAbandon} title="Leave this draft without playing it">
                <span aria-hidden="true" style={{ marginRight: 5 }}>✕</span>ABANDON DRAFT
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: "right", minWidth: 0 }}>
        {era ? (
          <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 1, color: "var(--ec-a-gold)" }}>
            ERA: {era}{eraState?.custom ? " · CUSTOM" : ""}
            {locked && <span title="Locked for this run"> 🔒</span>}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1, color: "var(--ec-a-text-muted)" }}>
            ERA: HIDDEN UNTIL ROLL 2
          </div>
        )}
      </div>
    </div>
  );
}
