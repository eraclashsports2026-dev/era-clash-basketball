// ── Achievement icons ────────────────────────────────────────────────────────
// One small extensible set of line glyphs, keyed by the catalog's `icon`
// (its category by default), toned by the existing palette (gold, cobalt,
// violet, platinum) through CSS. No one-off artwork per achievement; a new
// glyph is one entry here.
const GLYPHS = {
  getting_started: <path d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1.1 6.1L12 17l-5.5 2.8 1.1-6.1L3.2 9.4l6.1-.8z" />,
  career: <><path d="M8 4h8v3a4 4 0 0 1-8 0V4z" /><path d="M8 5H5a3 3 0 0 0 3 3M16 5h3a3 3 0 0 1-3 3" /><path d="M12 11v4M9 19h6M10 15h4v4h-4z" /></>,
  eras: <><path d="M7 3h10M7 21h10" /><path d="M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9" /></>,
  competition: <><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  exploration: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-1.8 4.2L9 15l1.8-4.2z" /></>,
};
export const ICON_IDS = Object.freeze(Object.keys(GLYPHS));

export default function AchievementIcon({ icon = "career", tone = "gold", size = 28, locked = false }) {
  return (
    <svg className="ec-ach-icon" data-tone={tone} data-locked={locked ? "true" : "false"} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {GLYPHS[icon] || GLYPHS.career}
    </svg>
  );
}
