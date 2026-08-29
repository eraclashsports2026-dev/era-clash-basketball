// ── Per-team strategy tabs: COACH · ERA STYLE ──────────────────────────────────
// Both team cards carry the same two tabs once the roster is complete. Coach
// is per-team; Era Style is ONE shared environment for the whole game — the
// tab on either card sets the same era, and each card's tab explains how THAT
// roster translates into it.
import { useState } from "react";
import { T, teamAccent } from "../theme.js";

export default function StrategyTabs({ side, coachName, eraLabel, coachContent, eraContent }) {
  const accent = teamAccent(side);
  const [tab, setTab] = useState("coach");
  const tabs = [
    ["coach", "🧠 COACH", coachName],
    ["era", "🕰️ ERA STYLE", eraLabel],
  ];
  return (
    <div style={{ marginTop: 12 }}>
      <div role="tablist" aria-label={`${side} strategy`} style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {tabs.map(([id, label, picked]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "8px 10px", fontSize: 11.5, fontWeight: 800, borderRadius: 8, cursor: "pointer", minHeight: 40,
            border: `1px solid ${tab === id ? accent : T.border}`,
            background: tab === id ? (side === "gold" ? T.goldSoft : T.blueSoft) : "transparent",
            color: tab === id ? accent : T.textDim,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
          }}>
            {label}{picked ? <span style={{ fontWeight: 700, color: tab === id ? T.text : T.textDim }}> · {picked}</span> : ""}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === "coach" ? coachContent : eraContent}</div>
    </div>
  );
}
