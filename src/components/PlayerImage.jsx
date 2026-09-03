// ── PlayerImage — the ONE way player imagery renders ──────────────────────────
// Resolution order (see docs/IMAGES.md):
//   1. Approved, provenance-tracked real image for this player entry
//   2. Approved general-era image for the same player (era_match: general)
//   3. EraClash branded silhouette fallback (always safe — never a fake face)
// No AI-generated athlete likenesses, ever. No hotlinks in the product: only
// assets from src/images/approved.json (served from /players/…).
import { useState } from "react";
import approvedData from "../images/approved.json";
import { DECADE_COLORS } from "../players.js";
import { T } from "../theme.js";

const byPlayer = {};
for (const img of approvedData.images) {
  if (!img.approved_for_product) continue;
  (byPlayer[img.player_id] ||= []).push(img);
}

export const resolvePlayerImage = (playerId) => {
  const imgs = byPlayer[playerId];
  if (!imgs?.length) return null;
  return [...imgs].sort((a, b) => {
    const rank = (x) => (x.era_match_quality === "exact" ? 0 : x.era_match_quality === "near" ? 1 : 2);
    return rank(a) - rank(b);
  })[0];
};

// Sizes per variant: fixed containers so images never cause layout shift.
const VARIANTS = {
  // The Time Arena card fills its own width, so this variant is fluid: the
  // container is what decides how wide a bench card is at a given breakpoint.
  arena: { w: "100%", h: 104, radius: 10, fs: 24 },
  thumbnail: { w: 40, h: 40, radius: 8, fs: 13 },
  card: { w: 56, h: 56, radius: 10, fs: 16 },
  roster: { w: 64, h: 80, radius: 10, fs: 18 },
  scoreboard: { w: 52, h: 66, radius: 8, fs: 15 },
  mvp: { w: 108, h: 132, radius: 14, fs: 34 },
  share: { w: 80, h: 100, radius: 12, fs: 22 },
};

// These were plain strings containing the literal text `T.goldSoft`, not
// template literals — an invalid colour, so the browser discarded the whole
// declaration and the silhouettes rendered with no team tint at all.
const TEAM_TINT = {
  gold: `linear-gradient(180deg, ${T.goldSoft}, rgba(11,14,23,0.55))`,
  blue: `linear-gradient(180deg, ${T.blueSoft}, rgba(11,14,23,0.55))`,
};

// Branded silhouette: initials on an era-colored jersey shape. Intentional,
// premium, and never mistakable for a real photograph.
function Silhouette({ p, v, team }) {
  const era = DECADE_COLORS[p.decade] || T.gold;
  const initials = p.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <div role="img" className="ec-portrait-stage" data-team={team} aria-label={`${p.name} EraClash player silhouette`} style={{
      width: v.w, height: v.h, borderRadius: v.radius, flexShrink: 0, position: "relative",
      background: `linear-gradient(180deg, ${era}33 0%, #0b0e17 90%)`,
      border: `1px solid ${team === "blue" ? T.blueBorder : T.goldBorder}`,
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      <div className="ec-portrait-field" aria-hidden="true" />
      <div className="ec-portrait-rim" aria-hidden="true" />
      <svg viewBox="0 0 64 80" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.5 }} aria-hidden="true">
        <ellipse cx="32" cy="26" rx="12" ry="13" fill="#000" opacity="0.55" />
        <path d="M10 80 Q12 48 32 46 Q52 48 54 80 Z" fill="#000" opacity="0.55" />
        <path d="M22 52 L32 60 L42 52 L42 80 L22 80 Z" fill={era} opacity="0.35" />
      </svg>
      <span style={{ position: "relative", fontWeight: 900, fontStyle: "italic", fontSize: v.fs, color: "rgba(232,234,242,0.9)", letterSpacing: 1 }}>
        {initials}
      </span>
    </div>
  );
}

export default function PlayerImage({ player, variant = "thumbnail", team = "gold" }) {
  const [failed, setFailed] = useState(false);
  const v = VARIANTS[variant] || VARIANTS.thumbnail;
  const img = resolvePlayerImage(player.id);

  if (!img || failed) return <Silhouette p={player} v={v} team={team} />;

  return (
    <div className="ec-portrait-stage" data-team={team} style={{ width: v.w, height: v.h, borderRadius: v.radius, flexShrink: 0, position: "relative", overflow: "hidden", background: T.bgMuted, border: `1px solid ${team === "blue" ? T.blueBorder : T.goldBorder}` }}>
      <div className="ec-portrait-field" aria-hidden="true" />
      <div className="ec-portrait-rim" aria-hidden="true" />
      <img
        src={img.local_asset_path}
        alt={`${player.name}, ${player.decade} player image`}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", filter: variant === "mvp" ? "none" : "grayscale(0.35) contrast(1.05)" }}
      />
      {variant !== "mvp" && <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: TEAM_TINT[team] || TEAM_TINT.gold }} />}
    </div>
  );
}
