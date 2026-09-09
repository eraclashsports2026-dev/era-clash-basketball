// ── Daily Challenge: the official Era Style + today's three coach choices ─────
// The Daily is one shared puzzle: everybody plays the SAME era with the SAME
// three coaches available, so a leaderboard compares decisions instead of luck.
// This panel is therefore read-only about the era (server-authoritative) and
// interactive about exactly one thing — which of the three coaches you hire.
//
// What is deliberately absent: coach ratings, coach OVR, era coefficients,
// fit scores, projected win probability, or any ordering that would tell the
// player which option is "best". If the UI ranked them the choice would be
// decoration. The player gets documented tendencies and picks.
import { useEffect } from "react";
import { T, card } from "../theme.js";

const Tag = ({ children }) => (
  <span style={{
    fontSize: 10.5, padding: "2px 7px", borderRadius: 999, background: T.bgCardHover,
    color: T.textDim, border: `1px solid ${T.border}`, whiteSpace: "nowrap",
  }}>{children}</span>
);

export function DailyEraBanner({ era, eraStyleId }) {
  const label = era?.label || eraStyleId;
  if (!label) return null;
  return (
    <div style={{ ...card, padding: 12, marginTop: 10, borderColor: T.border }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>🕰️ TODAY'S ERA STYLE</div>
        <div style={{ fontSize: 11, color: T.textDim }}>Same for everyone</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, color: T.gold, marginTop: 4 }}>
        {label}{era?.anchorSeason ? <span style={{ fontSize: 12, fontWeight: 700, color: T.textDim, marginLeft: 8 }}>{era.anchorSeason}</span> : null}
      </div>
      {era?.summary?.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 3 }}>
          {era.summary.map((s, i) => (
            <li key={i} style={{ fontSize: 12, lineHeight: 1.45, color: T.text }}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DailyCoachEra({ config, selectedCoachId, onSelectCoach, disabled, onOptionsViewed }) {
  const options = config?.coachOptions || [];
  // Fire the "options viewed" signal from an effect, once the options are
  // actually on screen — not from the fetch (which can resolve while the
  // player is elsewhere) and not during render (a side effect in render
  // double-fires under StrictMode).
  useEffect(() => {
    if (options.length && onOptionsViewed) onOptionsViewed();
  }, [options.length, onOptionsViewed]);

  return (
    <div style={{ marginTop: 10 }}>
      <DailyEraBanner era={config?.era} eraStyleId={config?.officialEraStyleId} />

      {options.length > 0 && (
        <div style={{ ...card, padding: 12, marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>🧠 HIRE ONE COACH</div>
            <div style={{ fontSize: 11, color: selectedCoachId ? T.textDim : T.gold, fontWeight: selectedCoachId ? 400 : 800 }}>
              {selectedCoachId ? "Locked in" : "Required"}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 4, lineHeight: 1.45 }}>
            Everyone gets these same three today. They are not ranked — they play differently.
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {options.map((o) => {
              const on = selectedCoachId === o.coachId;
              return (
                <button
                  key={o.coachId}
                  onClick={disabled ? undefined : () => onSelectCoach(o)}
                  disabled={disabled}
                  aria-pressed={on}
                  style={{
                    textAlign: "left", width: "100%", padding: "11px 12px", borderRadius: 10,
                    minHeight: 44, cursor: disabled ? "default" : "pointer",
                    background: on ? T.goldSoft : T.bgCardHover,
                    border: `2px solid ${on ? T.gold : T.border}`,
                    color: T.text, font: "inherit", opacity: disabled && !on ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 900, color: on ? T.gold : T.text }}>{o.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: T.textDim, textTransform: "uppercase" }}>{o.strategy}</span>
                  </div>
                  {o.whyDifferent && (
                    <div style={{ fontSize: 12.5, color: T.text, marginTop: 4, lineHeight: 1.4 }}>
                      <span style={{ color: T.textDim }}>Differs: </span>{o.whyDifferent}
                    </div>
                  )}
                  {o.systemTags?.length > 0 && (
                    <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
                      {o.systemTags.map((t) => <Tag key={t}>{t}</Tag>)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
