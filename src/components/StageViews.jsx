// ── Stage views: team summary cards, Era Style stage, Ready stage ──────────────
// Canonical panels D and E: compact team cards with coach lines flank a VS
// mark; the Era stage owns ONE shared era control with the real rule summary
// and the real per-roster translation notes; the Ready stage shows the
// qualitative matchup preview above the single dominant Run-the-Sim CTA.
import { useEffect, useState } from "react";
import { T, S, R, FONT, teamAccent } from "../theme.js";
import { v3meta } from "../v3meta.js";
import PlayerImage from "./PlayerImage.jsx";

/** Compact five-portrait team card with the coach line (panels D/E). */
export function TeamSummaryCard({ side, title, team, coach }) {
  const accent = teamAccent(side);
  return (
    <div style={{ flex: "1 1 240px", minWidth: 220, padding: S.md, borderRadius: R.lg,
      background: T.bgCard, border: `1px solid ${side === "blue" ? T.blueBorder : T.goldBorder}` }}>
      <div style={{ fontSize: 12, fontWeight: 900, fontStyle: "italic", letterSpacing: 1, color: accent, fontFamily: FONT.display }}>{title}</div>
      <div style={{ display: "flex", gap: 6, margin: "8px 0 6px", flexWrap: "wrap" }}>
        {(team || []).map((p) => p && <PlayerImage key={p.id} player={p} variant="thumbnail" team={side} />)}
      </div>
      <div style={{ fontSize: 11.5, color: T.textDim }}>
        Coach: <b style={{ color: T.text }}>{coach?.name ?? "—"}</b>
      </div>
    </div>
  );
}

export function VsRow({ gold, blue, coachGold, coachBlue, blueTitle = "TEAM BLUE" }) {
  return (
    <div style={{ display: "flex", gap: S.md, alignItems: "stretch", justifyContent: "center", flexWrap: "wrap", margin: "8px 0" }}>
      <TeamSummaryCard side="gold" title="TEAM GOLD" team={gold} coach={coachGold} />
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 900, fontStyle: "italic", fontFamily: FONT.display,
        background: `linear-gradient(120deg, ${T.gold} 30%, #e8eaf2 50%, ${T.blue} 70%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>VS</div>
      <TeamSummaryCard side="blue" title={blueTitle} team={blue} coach={coachBlue} />
    </div>
  );
}

/** Era Style stage (panel D): one shared era, real rules, real translations. */
export function EraStage({ eras, selected, onSelect, gold, blue }) {
  const era = eras?.find((e) => e.id === selected);
  const [notes, setNotes] = useState({ gold: null, blue: null });
  const goldIds = (gold || []).map((p) => p.id), blueIds = (blue || []).map((p) => p.id);

  useEffect(() => {
    let alive = true;
    setNotes({ gold: null, blue: null });
    if (!selected) return;
    const fetchNote = (ids) => ids.length === 5
      ? v3meta({ goldIds: ids, eraStyleId: selected }).then((j) => j?.eraNote ?? null).catch(() => null)
      : Promise.resolve(null);
    Promise.all([fetchNote(goldIds), fetchNote(blueIds)]).then(([g, b]) => { if (alive) setNotes({ gold: g, blue: b }); });
    return () => { alive = false; };
  }, [selected, JSON.stringify(goldIds), JSON.stringify(blueIds)]); // eslint-disable-line

  return (
    <section aria-label="Choose Era Style" style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, color: T.gold, textAlign: "center", margin: "10px 0" }}>CHOOSE ERA STYLE</div>
      <div role="radiogroup" aria-label="Era Style" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: S.lg }}>
        {(eras || []).map((e) => (
          <button key={e.id} role="radio" aria-checked={selected === e.id} onClick={() => onSelect(e.id)} style={{
            padding: "9px 14px", fontSize: 13, fontWeight: 900, fontStyle: "italic", borderRadius: R.sm, cursor: "pointer", minHeight: 44, minWidth: 54,
            border: `1px solid ${selected === e.id ? T.gold : T.border}`,
            background: selected === e.id ? T.goldSoft : T.bgCardHover,
            color: selected === e.id ? T.gold : T.textDim,
          }}>{e.label}</button>
        ))}
      </div>
      {era && (
        <div style={{ display: "flex", gap: S.md, flexWrap: "wrap", alignItems: "stretch" }}>
          <div style={{ flex: "1 1 300px", padding: S.lg, borderRadius: R.lg, background: T.bgCardHover, border: `1px solid ${T.goldBorder}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, fontFamily: FONT.display }}>{era.id} ERA STYLE <span style={{ color: T.textDim, fontWeight: 400, fontSize: 11, fontFamily: FONT.ui }}>anchor {era.anchorSeason}</span></div>
            <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
              {era.styleSummary.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: T.textDim, display: "flex", gap: 8 }}><span aria-hidden="true">🏀</span>{s}</div>
              ))}
              <div style={{ fontSize: 12, color: T.textDim, display: "flex", gap: 8 }}><span aria-hidden="true">🎯</span>{era.threePoint ? "The three-point shot exists in this environment." : "No three-point line — every deep shot is worth two."}</div>
            </div>
          </div>
          <div style={{ flex: "1 1 300px", padding: S.lg, borderRadius: R.lg, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>HOW THIS AFFECTS THIS MATCHUP</div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: T.gold }}>TEAM GOLD</div>
              <p style={{ fontSize: 12, color: T.text, lineHeight: 1.6, margin: "3px 0 10px" }}>{notes.gold ?? (goldIds.length === 5 ? "Reading this roster in the era…" : "Complete Team Gold to see its translation.")}</p>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: T.blue }}>TEAM BLUE</div>
              <p style={{ fontSize: 12, color: T.text, lineHeight: 1.6, margin: "3px 0 0" }}>{notes.blue ?? (blueIds.length === 5 ? "Reading this roster in the era…" : "This mode generates opponents — their translation shows in the postgame.")}</p>
            </div>
          </div>
        </div>
      )}
      <div style={{ fontSize: 10.5, color: T.textMuted, textAlign: "center", marginTop: 10 }}>One era per game — both teams play in this environment. The era never picks the winner.</div>
    </section>
  );
}
