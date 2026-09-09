// ── Synthetic uniform fixtures for the portrait stage (Phase 9A.2) ────────────
// Ten test portraits: flat, schematic figures — a head, shoulders and a jersey —
// in the uniform colours the product must survive. They are NOT likenesses and
// never leave the owner-only lab; the product resolves art from the approved
// registry alone. The skin swatch is a fixed neutral so the harness can measure
// whether the stage shifts it (it must not); the grayscale variants stand in for
// black-and-white history photographs.
const SKIN = "#C8A07A", SKIN_BW = "#9A9A9A";

const figure = ({ jersey, skin = SKIN, trim = "rgba(255,255,255,0.35)" }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 212">
<rect x="46" y="80" width="12" height="20" fill="${skin}"/>
<circle cx="52" cy="60" r="24" fill="${skin}"/>
<path d="M8 212 L8 130 Q8 104 34 98 L44 96 L52 108 L60 96 L70 98 Q96 104 96 130 L96 212 Z" fill="${jersey}"/>
<path d="M8 130 Q8 104 34 98 L30 96 Q4 100 2 132 L2 212 L8 212 Z" fill="${skin}"/>
<path d="M96 130 Q96 104 70 98 L74 96 Q100 100 102 132 L102 212 L96 212 Z" fill="${skin}"/>
<path d="M44 96 L52 110 L60 96" fill="none" stroke="${trim}" stroke-width="2"/>
</svg>`;
const uri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** id · label · team side · the jersey swatch · whether the image is grayscale (history) · testArt or null (silhouette) */
export const UNIFORM_TESTS = Object.freeze([
  { id: "dark-jersey", label: "Dark jersey", team: "gold", jersey: "#141414", art: { src: uri(figure({ jersey: "#141414" })) } },
  { id: "light-jersey", label: "Light jersey", team: "gold", jersey: "#F2F2F2", art: { src: uri(figure({ jersey: "#F2F2F2", trim: "rgba(0,0,0,0.25)" })) } },
  { id: "gold-jersey", label: "Gold / yellow jersey", team: "gold", jersey: "#E9B949", art: { src: uri(figure({ jersey: "#E9B949" })) } },
  { id: "red-jersey", label: "Red jersey", team: "gold", jersey: "#C8102E", art: { src: uri(figure({ jersey: "#C8102E" })) } },
  { id: "silhouette-gold", label: "Silhouette fallback (Gold)", team: "gold", jersey: null, art: null },
  { id: "blue-jersey", label: "Blue jersey", team: "blue", jersey: "#1D428A", art: { src: uri(figure({ jersey: "#1D428A" })) } },
  { id: "white-historical", label: "White historical uniform (B&W)", team: "blue", jersey: "#E6E6E6", grayscale: true, art: { src: uri(figure({ jersey: "#E6E6E6", skin: SKIN_BW, trim: "rgba(0,0,0,0.25)" })), grayscale: true } },
  { id: "bw-portrait", label: "Black-and-white portrait", team: "blue", jersey: "#8A8A8A", grayscale: true, art: { src: uri(figure({ jersey: "#8A8A8A", skin: SKIN_BW })), grayscale: true } },
  { id: "dark-jersey-blue-card", label: "Dark jersey on a Blue card", team: "blue", jersey: "#141414", art: { src: uri(figure({ jersey: "#141414" })) } },
  { id: "silhouette-blue", label: "Silhouette fallback (Blue)", team: "blue", jersey: null, art: null },
].map((t) => ({ ...t, art: t.art ? { ...t.art, id: t.id, alt: `${t.label} — synthetic portrait test figure` } : null })));

export const SKIN_SWATCH = SKIN;
