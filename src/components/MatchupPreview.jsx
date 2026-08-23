// ── Matchup Preview + VS divider ───────────────────────────────────────────────
// The central anchor between Team Gold and Team Blue. Locked until both teams
// are complete; then shows real engine matchup edges and the engine's actual
// win probability (the same elo-style model that decides engine games —
// nothing fabricated for aesthetics).
import { T } from "../theme.js";
import { matchupEdges } from "../engine.js";
import { teamRating } from "../rating.js";

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

export default function MatchupPreview({ gold, blue }) {
  const ready = gold?.filter(Boolean).length === 5 && blue?.filter(Boolean).length === 5;
  if (!ready) {
    return (
      <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(0,0,0,0.35)", border: `1px solid ${T.border}`, textAlign: "center", maxWidth: 340, margin: "0 auto" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.gold }}>MATCHUP PREVIEW</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Complete both teams to see the matchup breakdown and prediction.
        </div>
      </div>
    );
  }
  const edges = matchupEdges(gold, blue).slice(0, 5);
  const p = winProbability(gold, blue);
  const pg = Math.round(p * 100);
  return (
    <div className="rise" style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(0,0,0,0.45)", border: `1px solid ${T.border}`, maxWidth: 360, margin: "0 auto", width: "100%" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.gold, textAlign: "center", marginBottom: 10 }}>MATCHUP PREVIEW</div>
      {edges.map((e) => {
        const goldSide = e.edge >= 0;
        return (
          <div key={e.category} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, fontSize: 11.5 }}>
            <span style={{ width: 84, textAlign: "right", color: T.textDim, flexShrink: 0 }}>{CATEGORY_SHORT[e.category] || e.category}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.border, position: "relative", overflow: "hidden" }}>
              <div style={{
                position: "absolute", top: 0, bottom: 0,
                left: goldSide ? "50%" : `${50 - Math.abs(e.edge) * 2.4}%`,
                width: `${Math.abs(e.edge) * 2.4}%`,
                background: goldSide ? T.gold : T.blue, borderRadius: 3,
              }} />
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(232,234,242,0.25)" }} />
            </div>
            <span style={{ width: 30, fontWeight: 800, color: goldSide ? T.gold : T.blue, flexShrink: 0 }}>
              {e.edge === 0 ? "—" : `${goldSide ? "+" : ""}${e.edge}`}
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
