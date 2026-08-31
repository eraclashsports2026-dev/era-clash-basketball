// ── One draftable card on the roll screen ────────────────────────────────────
import PlayerImage from "../PlayerImage.jsx";
import { T, R } from "../../theme.js";
import { PLAYERS } from "../../players.js";
import { displayOVR } from "../../rating.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));

/** One or two meaningful role tags, read from the card's real statistics. */
export const roleTags = (p, slot) => {
  if (!p) return [];
  const tags = [];
  if (p.ast >= 7) tags.push("Primary creator");
  else if (p.ast >= 4.8) tags.push("Secondary passer");
  if (p.blk >= 2.0) tags.push("Rim protector");
  else if (p.stl >= 1.8) tags.push("Ball hawk");
  if (p.reb >= 12) tags.push("Glass eater");
  if (p.pts >= 26) tags.push("Volume scorer");
  else if (p.pts >= 20 && tags.length < 2) tags.push("Scorer");
  if (!tags.length) tags.push((p.positions || []).length > 1 ? "Positional flex" : "Role player");
  return tags.slice(0, 2);
};

const chip = {
  fontSize: 9, padding: "2px 6px", borderRadius: R.pill, maxWidth: "100%",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  display: "flex", alignItems: "center",
};

const TIER_STYLE = {
  APEX: { bg: "rgba(233,185,73,0.20)", fg: T.goldOnDark, bd: T.goldOnDark },
  ELITE: { bg: "rgba(233,185,73,0.12)", fg: T.goldOnDark, bd: "rgba(233,185,73,0.5)" },
  STAR: { bg: "rgba(122,176,245,0.14)", fg: T.blueOnDark, bd: "rgba(122,176,245,0.45)" },
  SPECIALIST: { bg: "rgba(255,255,255,0.06)", fg: T.onArenaDim, bd: T.arenaBorder },
};

export default function ChaosCard({ card, side, held, onToggle, disabled, interactive = true, kept = false, locked = false }) {
  if (!card) return <div style={{ minHeight: 150, borderRadius: R.md, border: `1px dashed ${T.arenaBorder}` }} />;
  const p = byId.get(card.id);
  const ts = TIER_STYLE[card.tier] || TIER_STYLE.SPECIALIST;
  const accent = side === "gold" ? T.goldOnDark : T.blueOnDark;
  return (
    <div className="chaos-card" data-slot={card.slot} data-held={held ? "true" : "false"} style={{
      borderRadius: R.md, padding: 9, display: "flex", flexDirection: "column", gap: 7,
      border: `1px solid ${held ? accent : T.arenaBorder}`,
      background: held ? "rgba(233,185,73,0.10)" : "rgba(255,255,255,0.04)",
      boxShadow: held ? `0 0 0 1px ${accent} inset` : "none",
      transition: "border-color 140ms ease, background 140ms ease",
    }}>
      {/* Portrait and rating on one row, the NAME on its own full-width line.
          Sharing a row with the rating squeezed names to single initials at
          five-across, which is the one thing a draft card must never do. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <PlayerImage player={p} variant="thumbnail" />
        <div title="Draft guide rating" style={{
          fontWeight: 900, fontSize: 18, color: accent, fontVariantNumeric: "tabular-nums", lineHeight: 1,
        }}>{p ? displayOVR(p, card.slot) : "\u2014"}</div>
      </div>
      <div>
        {/* Exactly two lines, whether the name is "Sam Jones" or "Giannis
            Antetokounmpo". The HOLD control below carries the full name for
            screen readers and as its accessible label. */}
        <div title={card.name} style={{
          fontWeight: 800, fontSize: 12.5, color: T.onArena, lineHeight: 1.25, wordBreak: "break-word",
          height: 32, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {card.name}
        </div>
        <div style={{ fontSize: 10.5, color: T.onArenaDim, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {card.slot} · {card.decade}
          {kept && <span style={{ color: accent, fontWeight: 800 }}> · KEPT</span>}
        </div>
      </div>
      {/* Three fixed rows — the tier and up to two role tags — so a player with
          one tag is exactly as tall as a player with two. Wrapping chips made
          cards 1, 2 or 3 lines tall at random. */}
      <div style={{ display: "grid", gridTemplateRows: "repeat(3, 18px)", gap: 3, alignContent: "start", justifyItems: "start" }}>
        <span style={{ ...chip, letterSpacing: 0.5, fontWeight: 800,
          background: ts.bg, color: ts.fg, border: `1px solid ${ts.bd}` }}>{card.tier}</span>
        {roleTags(p, card.slot).map((t) => (
          <span key={t} title={t} className="chaos-tag">{t}</span>
        ))}
      </div>
      <div style={{ marginTop: "auto" }}>
      {interactive ? (
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={held}
          aria-label={`${held ? "Release" : "Hold"} ${card.name}`}
          style={{
            width: "100%", minHeight: 44, borderRadius: R.sm, cursor: disabled ? "default" : "pointer",
            fontWeight: 800, fontSize: 12, letterSpacing: 0.5,
            border: `1px solid ${held ? accent : T.arenaBorder}`,
            background: held ? accent : "transparent",
            color: held ? T.arena : T.onArenaDim,
            opacity: disabled ? 0.55 : 1,
          }}>
          {held ? "HELD" : "HOLD"}
        </button>
      ) : locked ? (
        // After the final roll there is no fourth roll, so the card is not
        // "held" — it is simply on the team.
        <div aria-label={`${card.name} is on the final roster`} style={{
          minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: R.sm, fontWeight: 800, fontSize: 10, letterSpacing: 0.8,
          border: `1px solid ${T.arenaBorder}`, background: "transparent", color: T.onArenaDim,
        }}>FINAL ROSTER</div>
      ) : (
        <div aria-label={held ? `${card.name} held by the CPU` : `${card.name} not held`} style={{
          minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: R.sm, fontWeight: 800, fontSize: 11, letterSpacing: 0.5,
          border: `1px solid ${held ? accent : "transparent"}`,
          background: held ? "rgba(122,176,245,0.14)" : "transparent",
          color: held ? accent : T.onArenaDim,
        }}>{held ? "HELD" : "\u2014"}</div>
      )}
      </div>
    </div>
  );
}
