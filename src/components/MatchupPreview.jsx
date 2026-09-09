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

// V3 pre-sim preview: QUALITATIVE edges only (Gold Edge / Even / Blue Edge —
// the server maps the analysis model onto its own nearly-even bound; no
// numbers, no counts, no probability, no winner) plus the KEY CLASH line.
function KeyClashPreview({ gold, blue, v3 }) {
  const [data, setData] = useState(null);
  const goldIds = gold.map((p) => p.id), blueIds = blue.map((p) => p.id);
  useEffect(() => {
    let alive = true;
    setData(null);
    v3meta({ goldIds, blueIds, coachGoldId: v3.coachGoldId, coachBlueId: v3.coachBlueId, eraStyleId: v3.eraStyleId })
      .then((j) => { if (alive && j) setData(j); });
    return () => { alive = false; };
  }, [JSON.stringify(goldIds), JSON.stringify(blueIds), v3.coachGoldId, v3.coachBlueId, v3.eraStyleId]); // eslint-disable-line
  const CORE = ["Talent", "Construction", "Creation", "Spacing", "Defense", "Rebounding"];
  const rows = (data?.edges ?? []).filter((e) => CORE.includes(e.category));
  return (
    <div className="rise" style={{ padding: "14px 16px", borderRadius: 12, background: T.bgMuted, border: `1px solid ${T.border}`, maxWidth: 380, margin: "0 auto", width: "100%" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.gold, textAlign: "center" }}>MATCHUP PREVIEW</div>
      {!data && <div style={{ fontSize: 12, color: T.textDim, marginTop: 8, textAlign: "center" }}>Reading the matchup…</div>}
      {rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {rows.map((e) => (
            <div key={e.category} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 2px", fontSize: 12, borderBottom: `1px solid rgba(35,44,69,0.5)` }}>
              <span style={{ color: T.textDim }}>{"★ "}{e.category}</span>
              <span style={{ fontWeight: 800, color: e.lead === "gold" ? T.gold : e.lead === "blue" ? T.blue : T.textMuted }}>
                {e.lead === "even" ? "Even" : e.lead === "gold" ? "Gold Edge" : "Blue Edge"}{e.strong ? " ★" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      {data?.keyClash && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>KEY CLASH</div>
          <div style={{ fontSize: 12, color: T.text, marginTop: 4, lineHeight: 1.55 }}>{data.keyClash}</div>
        </div>
      )}
      <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 8, textAlign: "center" }}>Run the sim to find out.</div>
    </div>
  );
}

export default function MatchupPreview({ gold, blue, v3 }) {
  const ready = gold?.filter(Boolean).length === 5 && blue?.filter(Boolean).length === 5;
  if (!ready) {
    return (
      <div style={{ padding: "14px 16px", borderRadius: 12, background: T.bgCardHover, border: `1px solid ${T.border}`, textAlign: "center", maxWidth: 340, margin: "0 auto" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.gold }}>MATCHUP PREVIEW</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Complete both teams to see what this matchup comes down to.
        </div>
      </div>
    );
  }
  if (v3?.enabled) return <KeyClashPreview gold={gold} blue={blue} v3={v3} />;
  // Phase 7B: the legacy (Daily/Challenge) preview is qualitative too. It used
  // to print raw category numbers ("Gold +4") and a win probability, which both
  // exposed model internals and answered the question the simulation exists to
  // answer. Same model, same thresholds as the wizard read — words only.
  const EVEN_BOUND = 4, STRONG_BOUND = 10;
  const label = (edge) => {
    const a = Math.abs(edge);
    if (a <= EVEN_BOUND) return "Even";
    const side = edge > 0 ? "Gold" : "Blue";
    return a >= STRONG_BOUND ? `Strong ${side} Edge` : `${side} Edge`;
  };
  const edges = matchupEdges(gold, blue).slice(0, 5);
  return (
    <div className="rise" style={{ padding: "14px 16px", borderRadius: 12, background: T.bgMuted, border: `1px solid ${T.border}`, maxWidth: 360, margin: "0 auto", width: "100%" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.gold, textAlign: "center", marginBottom: 10 }}>MATCHUP PREVIEW</div>
      {edges.map((e) => (
        <div key={e.category} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 13, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ color: T.textDim }}>{CATEGORY_SHORT[e.category] || e.category}</span>
          <span style={{ fontWeight: 800, color: Math.abs(e.edge) <= EVEN_BOUND ? T.textMuted : e.edge > 0 ? T.gold : T.blue }}>
            {label(e.edge)}
          </span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: T.textMuted, textAlign: "center", marginTop: 8, lineHeight: 1.45 }}>
        A drafting read from player data. Run the sim to find out.
      </div>
    </div>
  );
}
