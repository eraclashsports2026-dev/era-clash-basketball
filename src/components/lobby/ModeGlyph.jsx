// ── Original EraClash mode glyphs ────────────────────────────────────────────
// Seven small line drawings, one per mode, in the current text colour. They are
// our own — geometric, stroke-based, tinted by the surface they sit on — and
// they carry no meaning on their own: every card names its mode in words.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

const GLYPHS = {
  // Chaos Clash: a die caught mid-turn, three pips for three rolls.
  chaos: (
    <>
      <rect x="5" y="5" width="22" height="22" rx="5" transform="rotate(-8 16 16)" {...P} />
      <circle cx="11.5" cy="11.5" r="1.7" fill="currentColor" />
      <circle cx="16" cy="16" r="1.7" fill="currentColor" />
      <circle cx="20.5" cy="20.5" r="1.7" fill="currentColor" />
    </>
  ),
  // Dream Matchup: two fives facing across a centre line.
  dream: (
    <>
      <circle cx="9" cy="12" r="3.2" {...P} />
      <circle cx="23" cy="20" r="3.2" {...P} />
      <path d="M4 22c0-3 2.2-5 5-5s5 2 5 5M18 30c0-3 2.2-5 5-5s5 2 5 5" {...P} />
      <path d="M16 4v24" {...P} strokeDasharray="2 3" />
    </>
  ),
  // Daily Clash: a calendar leaf with one marked day.
  daily: (
    <>
      <rect x="5" y="7" width="22" height="20" rx="3" {...P} />
      <path d="M5 13h22M11 4v6M21 4v6" {...P} />
      <circle cx="16" cy="20" r="2.2" fill="currentColor" />
    </>
  ),
  // Best of 7: seven ticks, four filled.
  bo7: (
    <>
      <path d="M5 16h22" {...P} />
      {[6.5, 9.7, 12.9, 16, 19.1, 22.3, 25.5].map((x, i) => (
        <circle key={x} cx={x} cy="16" r="1.5" fill={i < 4 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" />
      ))}
      <path d="M8 8l3 3M24 8l-3 3M8 24l3-3M24 24l-3-3" {...P} />
    </>
  ),
  // Win 82: a season arc with the finish line.
  win82: (
    <>
      <path d="M5 24c3-12 19-12 22 0" {...P} />
      <path d="M16 6v6" {...P} />
      <path d="M22 24h5v-4" {...P} />
      <circle cx="16" cy="24" r="2" fill="currentColor" />
    </>
  ),
  // Tournament: a bracket to one.
  tournament: (
    <>
      <path d="M5 7h5v6H5M5 19h5v6H5M10 10h4v12h-4M14 16h6M20 13h5v6h-5" {...P} />
      <circle cx="27" cy="16" r="1.6" fill="currentColor" />
    </>
  ),
  // Era Gauntlet: stepped eras rising.
  gauntlet: (
    <>
      <path d="M4 26h6v-6h6v-6h6v-6h6" {...P} />
      <path d="M26 8l2 2-2 2" {...P} />
    </>
  ),
};

export default function ModeGlyph({ id, size = 34, className }) {
  const body = GLYPHS[id] || GLYPHS.dream;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

export const MODE_GLYPH_IDS = Object.freeze(Object.keys(GLYPHS));
