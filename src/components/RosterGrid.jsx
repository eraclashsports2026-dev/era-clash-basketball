// ── Roster grid — the concept's five-across card row ─────────────────────────
// Position header above each card, portrait, name split (given name small /
// family name bold), OVR beneath. Five columns on desktop, two on tablet, one
// on phones — the same cards, reflowed, never a horizontally scrolling page.
// Portraits come from PlayerImage, which serves an approved image when one
// exists and a branded EraClash fallback otherwise. No invented likenesses.
import { POSITIONS, DECADE_COLORS } from "../players.js";
import { displayOVR } from "../rating.js";
import { T, S, R, FONT, teamAccent } from "../theme.js";
import { teamFit, fitColor } from "../chemistryView.js";
import PlayerImage from "./PlayerImage.jsx";

const POS_LABEL = { PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward", PF: "Power Forward", C: "Center" };
const splitName = (name) => {
  const parts = String(name).split(" ");
  return parts.length === 1 ? { first: "", last: parts[0] } : { first: parts[0], last: parts.slice(1).join(" ") };
};

function PositionHeader({ pos, accent }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: accent, textAlign: "center", marginBottom: 5 }}>{pos}</div>
  );
}

function FilledCard({ p, pos, team, accent, fit, hideStats, flash, onSwap }) {
  const { first, last } = splitName(p.name);
  const ovr = displayOVR(p, pos);
  const body = (
    <>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <PlayerImage player={p} variant="card" team={team} />
      </div>
      <div style={{ fontSize: 10.5, color: T.textDim, textAlign: "center", lineHeight: 1.15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{first}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, textAlign: "center", lineHeight: 1.2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last}</div>
      <div style={{ fontSize: 20, fontWeight: 900, fontStyle: "italic", color: accent, textAlign: "center", fontFamily: FONT.display, marginTop: 2 }}>
        {hideStats ? "—" : ovr}
      </div>
      <div style={{ fontSize: 9.5, color: DECADE_COLORS[p.decade] ?? T.textMuted, fontWeight: 700, textAlign: "center" }}>{p.decade}</div>
      {fit && !hideStats && (
        <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, color: fitColor(fit, T), textAlign: "center", marginTop: 3 }}>FIT {fit}</div>
      )}
    </>
  );
  const style = {
    padding: "10px 8px", borderRadius: R.md, background: T.bgCardHover,
    border: `1px solid ${T.border}`, minWidth: 0, boxSizing: "border-box", width: "100%",
    textAlign: "center", color: T.text,
  };
  if (!onSwap) return <div className={flash ? `slot-flash-${team}` : undefined} style={style}>{body}</div>;
  return (
    <button className={flash ? `slot-flash-${team}` : undefined} onClick={onSwap}
      aria-label={`Swap ${p.name}`} style={{ ...style, cursor: "pointer", minHeight: 132 }}>{body}</button>
  );
}

function EmptyCard({ pos, team, accent, onAdd }) {
  const body = (
    <>
      <div aria-hidden="true" style={{
        width: 40, height: 40, margin: "0 auto 8px", borderRadius: "50%",
        border: `1px dashed ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center",
        color: accent, fontSize: 19, fontWeight: 700,
      }}>+</div>
      <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.3 }}>Add<br />{POS_LABEL[pos]}</div>
    </>
  );
  const style = {
    padding: "14px 8px", borderRadius: R.md, background: "rgba(0,0,0,0.22)",
    border: `1px dashed ${T.border}`, minWidth: 0, boxSizing: "border-box", width: "100%",
    textAlign: "center", color: T.text, minHeight: 132,
  };
  if (!onAdd) return <div style={style}>{body}</div>;
  return <button onClick={onAdd} aria-label={`Add ${POS_LABEL[pos]}`} style={{ ...style, cursor: "pointer" }}>{body}</button>;
}

/**
 * five: array of 5 player objects or nulls (index = POSITIONS index)
 * onSlot(i): open the picker for that slot (omit for read-only rosters)
 */
export default function RosterGrid({ five, team = "gold", onSlot, hideStats, fitFor, flashSlot }) {
  const accent = teamAccent(team);
  return (
    <div className="roster-grid" role="list" aria-label={`${team === "blue" ? "Team Blue" : "Team Gold"} lineup`}>
      {POSITIONS.map((pos, i) => {
        const p = five?.[i] ?? null;
        return (
          <div key={pos} role="listitem" style={{ minWidth: 0 }}>
            <PositionHeader pos={pos} accent={accent} />
            {p
              ? <FilledCard p={p} pos={pos} team={team} accent={accent} hideStats={hideStats}
                  fit={fitFor ? fitFor(i) : null} flash={flashSlot === i} onSwap={onSlot ? () => onSlot(i) : null} />
              : <EmptyCard pos={pos} team={team} accent={accent} onAdd={onSlot ? () => onSlot(i) : null} />}
          </div>
        );
      })}
    </div>
  );
}
