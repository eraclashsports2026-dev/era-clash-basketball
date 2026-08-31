// ── One drafted player in the Time Arena ─────────────────────────────────────
// The card takes its colour from the TEAM CONTAINER it sits in (see
// .ec-ta-team[data-team] in index.css), never from its position. A previous
// build tinted the card per position and Team Gold's power forward and centre
// came out blue.
//
// Team identity is never colour alone: the card carries its team in its
// accessible name, and every state carries a word (and a lock glyph) as well as
// a tint.
import PlayerImage from "../PlayerImage.jsx";
import { PLAYERS } from "../../players.js";
import { displayOVR } from "../../rating.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));

const TIER_TITLE = {
  APEX: "Apex — a franchise cornerstone in this environment",
  ELITE: "Elite — a clear first option",
  STAR: "Star — a high-quality starter",
  SPECIALIST: "Specialist — a defined role",
};

/** The empty bench slot. The board exists before any card does. */
export function EmptyCard({ slot, team }) {
  return (
    <div className="ec-pc-empty" data-slot={slot} aria-label={`Empty ${slot} slot, Team ${team}`}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: "var(--ec-a-text-muted)" }}>{slot}</div>
      <div style={{ fontSize: 10, color: "var(--ec-a-text-muted)", opacity: 0.75 }}>empty</div>
    </div>
  );
}

export default function PlayerCard({
  card, team = "gold", interactive = false, held = false, kept = false,
  locked = false, disabled = false, onToggle,
}) {
  if (!card) return <EmptyCard slot="—" team={team} />;
  const p = byId.get(card.id);
  const teamLabel = team === "blue" ? "Team Blue" : "Team Gold";

  return (
    <div className="ec-pc" data-slot={card.slot} data-held={held ? "true" : "false"}
      aria-label={`${card.name}, ${teamLabel} ${card.slot}, ${card.decade}${held ? ", held" : ""}`}>
      <div className="ec-pc-slot">{card.slot}</div>
      <div className="ec-pc-portrait">
        {p ? <PlayerImage player={p} variant="arena" team={team} /> : null}
      </div>
      <div className="ec-pc-name" title={card.name}>{card.name}</div>
      <div className="ec-pc-meta">
        <span className="ec-pc-decade">
          {card.decade}
          {kept && <span style={{ color: "var(--pc-accent)", fontWeight: 800 }}> · KEPT</span>}
        </span>
        <span className="ec-pc-ovr" title={`Draft guide rating${card.tier ? ` · ${TIER_TITLE[card.tier] || card.tier}` : ""}`}>
          {p ? displayOVR(p, card.slot) : "—"}<span>OVR</span>
        </span>
      </div>

      {interactive ? (
        <button className="ec-pc-action" data-on={held ? "true" : "false"}
          onClick={onToggle} disabled={disabled} aria-pressed={held}
          aria-label={`${held ? "Release" : "Hold"} ${card.name}, ${teamLabel} ${card.slot}`}>
          <span aria-hidden="true">{held ? "🔒" : ""}</span>{held ? "LOCKED" : "HOLD"}
        </button>
      ) : locked ? (
        // After the final roll there is no fourth: the card is not "held", it is
        // simply on the team.
        <div className="ec-pc-static" aria-label={`${card.name} is on the final ${teamLabel} roster`}>
          FINAL ROSTER
        </div>
      ) : (
        <div className="ec-pc-static" data-held={held ? "true" : "false"}
          style={held ? { borderStyle: "solid", borderColor: "var(--pc-line)", color: "var(--pc-accent)" } : undefined}
          aria-label={held ? `${card.name} held by the Legend CPU` : `${card.name} not held by the Legend CPU`}>
          <span aria-hidden="true">{held ? "🔒" : ""}</span>{held ? "HELD" : "—"}
        </div>
      )}
    </div>
  );
}
