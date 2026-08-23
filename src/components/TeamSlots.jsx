// ── Team panel building blocks ─────────────────────────────────────────────────
// PlayerSlot (empty affordance / filled premium card) and the TeamPanel shell
// with Gold/Blue identity. Used by the builder for both sides of the matchup.
import { POSITIONS, DECADE_COLORS } from "../players.js";
import { displayOVR } from "../rating.js";
import { playerArchetypes } from "../attributes.js";
import { T, teamPanel, teamAccent } from "../theme.js";
import { teamFit, fitColor } from "../chemistryView.js";
import PlayerImage from "./PlayerImage.jsx";

const POS_LABEL = { PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward", PF: "Power Forward", C: "Center" };

export function EmptySlot({ pos, team, onAdd, hint }) {
  const accent = teamAccent(team);
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 900, color: accent, width: 26, letterSpacing: 0.5 }}>{pos}</span>
      <span aria-hidden="true" style={{
        width: 34, height: 34, borderRadius: "50%", border: `1px solid ${T.border}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: T.textDim, fontSize: 17, fontWeight: 700, flexShrink: 0,
      }}>+</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: T.textDim }}>
        {hint || `Add ${POS_LABEL[pos]}`}
      </span>
    </div>
  );
  if (!onAdd) {
    return <div style={{ padding: "12px 14px", borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, opacity: 0.75 }}>{inner}</div>;
  }
  return (
    <button onClick={onAdd} style={{
      display: "block", width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10,
      background: T.bgCard, border: `1px solid ${T.border}`, cursor: "pointer", color: T.text, minHeight: 58,
    }}>{inner}</button>
  );
}

export function FilledSlot({ p, pos, team, fit, hideStats, onSwap, flash }) {
  const accent = teamAccent(team);
  const arch = hideStats ? [] : playerArchetypes(p.id);
  const ovr = displayOVR(p, pos);
  return (
    // minWidth: 0 + maxWidth: 100% are load-bearing: grid/flex items default to
    // min-width:auto and refuse to shrink below content width, which pushed
    // cards out of the team panel at ≤1440px. Never remove them.
    <div className={flash ? `slot-flash-${team}` : undefined} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
      background: T.bgCardHover, border: `1px solid ${T.border}`, minHeight: 58,
      minWidth: 0, maxWidth: "100%", overflow: "hidden", boxSizing: "border-box",
    }}>
      <span style={{ fontSize: 11, fontWeight: 900, color: accent, width: 24, flexShrink: 0 }}>{pos}</span>
      <PlayerImage player={p} variant="thumbnail" team={team} />
      <div style={{ minWidth: 0, flex: "1 1 0%" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{p.name}</span>
          <span style={{ fontSize: 11, color: DECADE_COLORS[p.decade], fontWeight: 700, flexShrink: 0 }}>{p.decade}</span>
        </div>
        <div style={{ fontSize: 11, color: T.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.team}{!hideStats && ` · ${p.pts} PTS ${p.reb} REB ${p.ast} AST`}
        </div>
        {arch.length > 0 && (
          <div style={{ fontSize: 9.5, color: accent, letterSpacing: 1, fontWeight: 700, marginTop: 1, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {arch.slice(0, 2).join(" · ")}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 900, fontStyle: "italic", color: accent }}>{hideStats ? "?" : ovr}</div>
        <div style={{ fontSize: 8.5, letterSpacing: 1, color: T.textDim }}>OVR</div>
        {fit && !hideStats && (
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: fitColor(fit, T), marginTop: 2 }}>
            FIT {fit}
          </div>
        )}
      </div>
      {onSwap && (
        <button onClick={onSwap} aria-label={`Swap ${p.name}`} style={{
          border: `1px solid ${T.border}`, background: "transparent", color: T.textDim,
          borderRadius: 7, padding: "6px 8px", cursor: "pointer", fontSize: 11, flexShrink: 0,
        }}>↺</button>
      )}
    </div>
  );
}

// side = "gold" | "blue"
export function TeamShell({ team: side, title, count, children }) {
  const accent = teamAccent(side);
  return (
    <section aria-label={title} style={{ ...teamPanel(side), padding: 16, flex: "1 1 340px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, fontStyle: "italic", letterSpacing: 1, color: accent }}>{title}</h2>
        {count != null && <span style={{ fontSize: 12, color: T.textDim, fontWeight: 700 }}>{count} / 5</span>}
      </div>
      {children}
    </section>
  );
}

// Read-only lineup used for the Blue side and previews.
export function LineupList({ team, side = "blue", hideStats }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {POSITIONS.map((pos, i) => team?.[i]
        ? <FilledSlot key={pos} p={team[i]} pos={pos} team={side} hideStats={hideStats} fit={teamFit(team, i)} />
        : <EmptySlot key={pos} pos={pos} team={side} />)}
    </div>
  );
}
