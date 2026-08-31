// ── The arena's utility bar ──────────────────────────────────────────────────
// Help, settings, and the era this Clash is being played in. It sits under the
// primary CTA and is deliberately quieter than it: nothing here competes with
// the roll button.
import { membershipHref } from "../../navigation.js";

const LINKS = [
  ["HOW TO PLAY", "play", "📖"],
  ["STRATEGY GUIDE", "strategy", "🛡"],
  ["GLOSSARY", "glossary", "🔤"],
];

export default function UtilityBar({ eraState, onGuide, onSettings, onMembership, onAbandon, canAbandon = false, compact = false }) {
  const era = eraState?.eraStyleId;
  const locked = !eraState?.change?.allowed;
  const reason = eraState?.change?.reason;

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
          <>
            <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 1, color: "var(--ec-a-gold)" }}>
              ERA: {era}{eraState?.custom ? " · CUSTOM" : ""}
              {locked && <span aria-hidden="true" title="Locked for this run"> 🔒</span>}
            </div>
            {locked && reason === "NOT_ENTITLED" && (
              <button onClick={() => onMembership?.(membershipHref({ feature: "custom-era", required: "PLUS", from: "utility-bar" }))}
                style={{
                  minHeight: 34, padding: 0, background: "transparent", border: "none", cursor: "pointer",
                  color: "var(--ec-a-text-muted)", fontSize: 11, fontWeight: 700, textDecoration: "underline",
                }}>Change eras with membership</button>
            )}
            {locked && reason === "COMPETITIVE_LOCK" && (
              <div style={{ fontSize: 11, color: "var(--ec-a-text-muted)" }}>Locked for a fair rematch</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1, color: "var(--ec-a-text-muted)" }}>
            ERA: HIDDEN UNTIL ROLL 2
          </div>
        )}
      </div>
    </div>
  );
}
