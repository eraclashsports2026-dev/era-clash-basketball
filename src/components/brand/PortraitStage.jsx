// ── The portrait stage — Phase 9A.2 ──────────────────────────────────────────
// Phase 9A.1 measured the same defect in every theme: a dark uniform sits on a
// dark card frame at ~1.06:1 and the player disappears into the card. The fix is
// the earliest SHARED presentation layer behind every player image, so no
// portrait file is altered and no theme needs its own crop:
//
//   portrait well  →  neutral radial separation field  →  team-aware rim light
//   →  soft lower fade into the information zone  →  the portrait  →  edge shadow
//
// The layers are absolutely positioned inside the existing portrait zone and
// add no size, so the frozen card geometry (8C.1) is untouched. Approved
// portraits, the premium silhouette fallback and future art all drop into the
// same stage. Colour never touches the image: the field is a neutral grey-blue,
// the rim light is the TEAM colour at low alpha along the top edge only, and no
// filter is applied to skin.
export default function PortraitStage({ children, className = "", team = "gold", ...rest }) {
  return (
    <div className={`ec-portrait-stage ${className}`.trim()} data-team={team} {...rest}>
      <div className="ec-portrait-field" aria-hidden="true" />
      <div className="ec-portrait-rim" aria-hidden="true" />
      {children}
      <div className="ec-portrait-fade" aria-hidden="true" />
    </div>
  );
}
