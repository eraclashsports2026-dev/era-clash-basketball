// ── Matchup Preview + VS divider ───────────────────────────────────────────────
// The central anchor between Team Gold and Team Blue. Locked until both teams
// are complete; then shows real engine matchup edges and the engine's actual
// win probability (the same elo-style model that decides engine games —
// nothing fabricated for aesthetics).
import { useEffect, useState } from "react";
import { T } from "../theme.js";
import { matchupEdges } from "../engine.js";
import { teamRating } from "../rating.js";
import { v3meta } from "../v3meta.js";

// Same probability model as engine.simulateGame — kept in sync deliberately.
export const winProbability = (teamA, teamB) => {
  const raw = 1 / (1 + Math.pow(10, -(teamRating(teamA) - teamRating(teamB)) / 650));
  return Math.max(0.04, Math.min(0.96, raw));
};

export function VsDivider({ active }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 6px", alignSelf: "center" }}>
      <span className={active ? "vs-active" : undefined} style={{
        fontSize: 44, fontWeight: 900, fontStyle: "italic",
        background: `linear-gradient(120deg, ${T.gold} 30%, #e8eaf2 50%, ${T.blue} 70%)`,
        WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        letterSpacing: -2,
      }}>VS</span>
    </div>
  );
}

const CATEGORY_SHORT = {
  "Perimeter Creation": "Playmaking",
  "Interior Presence": "Interior",
  "Rim Protection": "Rim Protection",
  "Rebounding": "Rebounding",
  "Perimeter Defense": "Defense",
  "Spacing & Shooting": "Spacing",
  "Star Power": "Star Power",
};

// V3 pre-sim preview (Addendum 26): strategic tension only. No edge counts, no
// expected winner, no probability — those would answer the question the SIM is
// supposed to answer. The KEY CLASH is fetched from the server's V3 analysis.
function KeyClashPreview({ gold, blue, v3 }) {
  const [clash, setClash] = useState(null);
  const goldIds = gold.map((p) => p.id), blueIds = blue.map((p) => p.id);
  useEffect(() => {
    let alive = true;
    setClash(null);
    v3meta({ goldIds, blueIds, coachGoldId: v3.coachGoldId, coachBlueId: v3.coachBlueId, eraStyleId: v3.eraStyleId })
      .then((j) => { if (alive && j?.keyClash) setClash(j.keyClash); });
    return () => { alive = false; };
  }, [JSON.stringify(goldIds), JSON.stringify(blueIds), v3.coachGoldId, v3.coachBlueId, v3.eraStyleId]); // eslint-disable-line
  return (
    <div className="rise" style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(0,0,0,0.45)", border: `1px solid ${T.border}`, maxWidth: 360, margin: "0 auto", width: "100%" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.gold, textAlign: "center" }}>KEY CLASH</div>
      <div style={{ fontSize: 12.5, color: T.text, marginTop: 8, lineHeight: 1.6 }}>
        {clash || "Reading the matchup…"}
      </div>
      <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 8, textAlign: "center" }}>Run the sim to find out.</div>
    </div>
  );
}

export default function MatchupPreview({ gold, blue, v3 }) {
  const ready = gold?.filter(Boolean).length === 5 && blue?.filter(Boolean).length === 5;
  if (!ready) {
    return (
      <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(0,0,0,0.35)", border: `1px solid ${T.border}`, textAlign: "center", maxWidth: 340, margin: "0 auto" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.gold }}>MATCHUP PREVIEW</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Complete both teams to see what this matchup comes down to.
        </div>
      </div>
    );
  }
  if (v3?.enabled) return <KeyClashPreview gold={gold} blue={blue} v3={v3} />;
  const edges = matchupEdges(gold, blue).slice(0, 5);
  const p = winProbability(gold, blue);
  const pg = Math.round(p * 100);
  return (
    <div className="rise" style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(0,0,0,0.45)", border: `1px solid ${T.border}`, maxWidth: 360, margin: "0 auto", width: "100%" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.gold, textAlign: "center", marginBottom: 10 }}>MATCHUP PREVIEW</div>
      {edges.map((e) => {
        const goldSide = e.edge >= 0;
        const half = Math.min(45, Math.abs(e.edge) * 2.25); // % from center, capped
        return (
          <div key={e.category} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, fontSize: 11.5 }}>
            <span style={{ width: 78, textAlign: "right", color: T.textDim, flexShrink: 0 }}>{CATEGORY_SHORT[e.category] || e.category}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.border, position: "relative", overflow: "hidden" }}>
              {/* bar grows from the center toward the leading team's panel */}
              <div style={{
                position: "absolute", top: 0, bottom: 0,
                left: goldSide ? `${50 - half}%` : "50%",
                width: `${half}%`,
                background: goldSide ? T.gold : T.blue, borderRadius: 3,
              }} />
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(232,234,242,0.25)" }} />
            </div>
            <span style={{ width: 52, fontWeight: 800, color: goldSide ? T.gold : T.blue, flexShrink: 0 }}>
              {e.edge === 0 ? "—" : `${goldSide ? "Gold" : "Blue"} +${Math.abs(e.edge)}`}
            </span>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 10, fontSize: 12.5, fontWeight: 800 }}>
        <span style={{ color: T.gold }}>Gold {pg}%</span>
        <span style={{ color: T.textMuted }}>·</span>
        <span style={{ color: T.blue }}>Blue {100 - pg}%</span>
      </div>
      <div style={{ fontSize: 9.5, color: T.textMuted, textAlign: "center", marginTop: 4 }}>
        Engine prediction from ratings, chemistry & matchups
      </div>
    </div>
  );
}
