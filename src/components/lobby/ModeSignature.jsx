// ── Original EraClash mode signatures (Phase 9A.3P) ──────────────────────────
// One restrained motif per mode, drawn here in thin linework and placed behind a
// card's top-right corner at a few percent opacity. Seven motifs, ONE grammar:
//
//   · 1.5px strokes, round caps and joins, currentColor (the card sets it by
//     accent role — gold, cobalt, platinum, violet — from the theme's own tokens)
//   · a single 120×120 viewBox, no fills heavier than a dot, no text, no imagery
//   · decorative only: aria-hidden, focusable="false", pointer-events none;
//     every card still names its mode and its action in words
//
// They are ours: no league mark, no competitor iconography, no downloaded asset.
// The registry names which signature a mode carries (`visualSignature`), so the
// lobby never chooses one by itself.
import { SIGNATURE_IDS } from "./signatureIds.js";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
const dot = (cx, cy, r = 2.2) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" />;

export const SIGNATURES = {
  // Chaos Clash — a die, the Era Fracture running through it, possibilities branching off.
  "fracture-dice": (
    <>
      <rect x="22" y="30" width="56" height="56" rx="10" transform="rotate(-10 50 58)" {...P} />
      {dot(38, 48)}{dot(50, 58)}{dot(62, 68)}
      <path d="M8 96L112 14" {...P} strokeWidth="1.2" />
      <path d="M84 36l14-6M84 36l12 8M96 24l10-4M96 44l10 5" {...P} strokeWidth="1.1" />
    </>
  ),
  // Dream Matchup — two historical timelines crossing at one point.
  "crossing-timelines": (
    <>
      <path d="M6 88C36 84 60 40 114 30" {...P} />
      <path d="M6 32C40 36 62 80 114 90" {...P} />
      {[18, 42, 66, 90].map((x) => <path key={`a${x}`} d={`M${x} ${88 - (x - 6) * 0.54 - 2} v4`} {...P} strokeWidth="1.1" />)}
      {dot(60, 60, 2.6)}
    </>
  ),
  // Daily Clash — a calendar leaf under one spotlight; today pulses.
  "spotlight-calendar": (
    <>
      <path d="M60 6L34 62h52z" {...P} strokeWidth="1.1" strokeDasharray="3 4" />
      <rect x="30" y="52" width="60" height="50" rx="6" {...P} />
      <path d="M30 66h60M44 46v12M76 46v12" {...P} />
      {dot(60, 84, 3)}
      <circle cx="60" cy="84" r="8" {...P} strokeWidth="1" />
    </>
  ),
  // Best of 7 — seven series ticks along a line, four won.
  "series-ticks": (
    <>
      <path d="M10 60h100" {...P} />
      {[16, 30, 44, 58, 72, 86, 100].map((x, i) => (i < 4 ? dot(x, 60, 3) : <circle key={x} cx={x} cy="60" r="3" {...P} />))}
      <path d="M16 46v-8M100 46v-8M58 46v-14" {...P} strokeWidth="1.1" />
    </>
  ),
  // Win 82 — the season arc, 82 games as a progression track to the finish.
  "season-arc": (
    <>
      <path d="M10 92C24 40 96 40 110 92" {...P} />
      <path d="M10 92C22 60 46 46 60 44" {...P} strokeWidth="2.6" />
      {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((t) => { const x = 10 + t * 100; const y = 92 - Math.sin(t * Math.PI) * 48; return <path key={t} d={`M${x} ${y - 3} v6`} {...P} strokeWidth="1" />; })}
      <path d="M104 92h8v-8" {...P} />
    </>
  ),
  // Tournament — bracket geometry, paths converging on one.
  "bracket": (
    <>
      <path d="M8 22h16v14H8M8 50h16v14H8M8 78h16v14H8M8 106h16" {...P} strokeWidth="1.2" />
      <path d="M24 29h14v28H24M24 85h14v-14M38 43h14v35H38M52 60h16" {...P} />
      <path d="M68 52h20v16H68" {...P} />
      {dot(96, 60, 3)}
    </>
  ),
  // Era Gauntlet — ascending era steps, a timeline climbing.
  "era-steps": (
    <>
      <path d="M8 104h20V84h20V64h20V44h20V24h20" {...P} />
      <path d="M100 24l8 0-4-6" {...P} strokeWidth="1.2" />
      {[18, 38, 58, 78].map((x, i) => dot(x, 104 - i * 20 - 4, 1.8))}
    </>
  ),
};

export { SIGNATURE_IDS };
// The drawn set and the declared set are the same seven, in the same order.
if (Object.keys(SIGNATURES).join() !== SIGNATURE_IDS.join()) throw new Error("ModeSignature: drawn signatures differ from signatureIds.js");

export default function ModeSignature({ id, className = "" }) {
  const body = SIGNATURES[id];
  if (!body) return null;
  return (
    <svg className={`ec-mode-signature ${className}`.trim()} viewBox="0 0 120 120" width="120" height="120"
      aria-hidden="true" focusable="false" data-signature={id}>
      {body}
    </svg>
  );
}
