// ── Coach selection modal ─────────────────────────────────────────────────────
// Phase 7B. The coach step previously stacked three long scouting reports in
// the page and hid the other 22 coaches behind a bare name list, so the choice
// was simultaneously cluttered and under-informed. This is the player-picker
// pattern applied to coaches: a filterable, searchable, sortable list beside a
// detail pane, with one Select action.
//
// ERA SEQUENCING: a coach's era compatibility cannot exist before an era is
// chosen. `eraStyleId` is undefined until the era stage locks one, and every
// era-fit affordance is hidden until then — never a placeholder verdict.
import { useEffect, useMemo, useRef, useState } from "react";
import { T, S, R, Z, FONT, teamAccent } from "../theme.js";

const FAMILIES = [
  ["all", "All Coaches", () => true],
  ["fast", "Fast Break", (t) => /fast.?break|transition|pace|running|up-tempo|seven seconds|early offense/i.test(t)],
  ["half", "Half Court", (t) => /halfcourt|half-court|post|triangle|princeton|flex|corner|execution|inside-out/i.test(t)],
  ["defense", "Defense", (t) => /defen|pressure|trapping|zone|jordan rules|bad boys|help/i.test(t)],
  ["motion", "Motion", (t) => /motion|passing|read-and-react|flow|beautiful game|hit the open man|spacing|pace and space|pace-and-space/i.test(t)],
  ["development", "Development", (t) => /culture|management|empower|teaching|players|ubuntu|depth|discipline|conditioning|detail/i.test(t)],
];
const familyMatch = (coach, key) => {
  const fam = FAMILIES.find(([k]) => k === key);
  if (!fam || key === "all") return true;
  return (coach.systemTags ?? []).some((t) => fam[2](t));
};

const SORTS = [["recommended", "Recommended"], ["name", "Name"], ["era", "Era"], ["system", "System"]];

export function CoachAvatar({ name, accent, size = 44 }) {
  const initials = String(name).split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, flexShrink: 0, borderRadius: 10,
      background: T.bgMuted, border: `1px solid ${accent}66`,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.34, fontWeight: 900, letterSpacing: 0.5, color: accent, fontStyle: "italic",
    }}>{initials}</span>
  );
}

const FIT_COLOR = (fit) => (fit === "EXCELLENT" ? T.green : fit === "GOOD" ? T.green : fit === "POOR" ? T.red : T.textDim);

export default function CoachModal({ side, coaches, recommended, selectedId, eraStyleId, eraLabel, onSelect, onClose }) {
  const accent = teamAccent(side);
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const recById = useMemo(() => new Map((recommended ?? []).map((r) => [r.id, r])), [recommended]);
  const [focusId, setFocusId] = useState(selectedId ?? recommended?.[0]?.id ?? coaches?.[0]?.id ?? null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const f = dialogRef.current.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = (coaches ?? []).filter((c) => familyMatch(c, family));
    if (q) out = out.filter((c) => `${c.name} ${c.span} ${(c.systemTags ?? []).join(" ")}`.toLowerCase().includes(q));
    const rank = (c) => (recById.has(c.id) ? 0 : 1);
    const byName = (a, b) => a.name.localeCompare(b.name);
    if (sort === "name") out = [...out].sort(byName);
    else if (sort === "era") out = [...out].sort((a, b) => String(a.span).localeCompare(String(b.span)) || byName(a, b));
    else if (sort === "system") out = [...out].sort((a, b) => String(a.systemTags?.[0] ?? "").localeCompare(String(b.systemTags?.[0] ?? "")) || byName(a, b));
    else out = [...out].sort((a, b) => rank(a) - rank(b) || byName(a, b));
    return out;
  }, [coaches, family, query, sort, recById]);

  const focused = list.find((c) => c.id === focusId) ?? list[0] ?? null;
  const rec = focused ? recById.get(focused.id) : null;

  const control = {
    padding: "9px 12px", fontSize: 14, borderRadius: R.sm, minHeight: 42,
    border: `1px solid ${T.border}`, background: T.bgCard, color: T.text,
  };

  return (
    <div role="presentation" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: Z.modal, background: "rgba(12,22,39,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Select coach for Team ${side === "blue" ? "Blue" : "Gold"}`}
        onClick={(e) => e.stopPropagation()} className="coach-modal" style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
          boxShadow: T.shadowRaised, width: "100%", maxWidth: 940, maxHeight: "88vh", display: "flex", flexDirection: "column",
        }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <h2 style={{ margin: 0, fontSize: 18, fontFamily: FONT.display, color: T.text }}>Select Coach</h2>
          <span style={{ padding: "4px 12px", borderRadius: R.pill, fontSize: 12, fontWeight: 800,
            background: side === "blue" ? T.blueSoft : T.goldSoft, color: accent, border: `1px solid ${accent}55` }}>
            Team {side === "blue" ? "Blue" : "Gold"}
          </span>
          <button ref={closeRef} onClick={onClose} aria-label="Close coach selection" style={{
            marginLeft: "auto", ...control, cursor: "pointer", fontWeight: 800, minWidth: 44,
          }}>✕</button>
        </div>

        {/* controls */}
        <div style={{ display: "flex", gap: 8, padding: "12px 18px", flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search coaches…"
            aria-label="Search coaches" style={{ ...control, flex: "1 1 200px" }} />
          <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Filter by system" style={{ ...control, cursor: "pointer" }}>
            {FAMILIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort coaches" style={{ ...control, cursor: "pointer" }}>
            {SORTS.map(([k, label]) => <option key={k} value={k}>Sort: {label}</option>)}
          </select>
        </div>

        {/* body: list + detail */}
        <div className="coach-modal-body">
          <ul role="listbox" aria-label="Coaches" style={{ listStyle: "none", margin: 0, padding: 10, overflowY: "auto", display: "grid", gap: 6, alignContent: "start" }}>
            {list.length === 0 && <li style={{ padding: 14, fontSize: 14, color: T.textDim }}>No coach matches that search.</li>}
            {list.map((c) => {
              const r = recById.get(c.id);
              const on = focused?.id === c.id;
              return (
                <li key={c.id}>
                  <button role="option" aria-selected={on} onClick={() => setFocusId(c.id)} className="coach-row" style={{
                    width: "100%", textAlign: "left",
                    padding: "10px 12px", borderRadius: R.md, cursor: "pointer", minHeight: 62,
                    border: `1px solid ${on ? accent : T.border}`,
                    background: on ? (side === "blue" ? T.blueSoft : T.goldSoft) : T.bgCard, color: T.text,
                  }}>
                    <CoachAvatar name={c.name} accent={accent} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 14.5 }}>{c.name}</b>
                        <span style={{ fontSize: 12, color: T.textDim }}>{c.span}</span>
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: T.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(c.systemTags ?? []).slice(0, 2).join(" • ")}
                      </span>
                    </span>
                    <span className="coach-row-meta">
                      {r && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, color: accent, whiteSpace: "nowrap" }}>RECOMMENDED</span>}
                      {r?.teamFit && <span style={{ fontSize: 11, fontWeight: 800, color: FIT_COLOR(r.teamFit), whiteSpace: "nowrap" }}>Fit: {r.teamFit}</span>}
                      {selectedId === c.id && <span style={{ fontSize: 11, fontWeight: 800, color: accent, whiteSpace: "nowrap" }}>✓ current</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div style={{ padding: 16, overflowY: "auto", borderLeft: `1px solid ${T.border}`, background: T.bgCardHover }}>
            {!focused ? <div style={{ fontSize: 14, color: T.textDim }}>Choose a coach to see the detail.</div> : (
              <>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <CoachAvatar name={focused.name} accent={accent} size={56} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 900, fontFamily: FONT.display, color: T.text }}>{focused.name}</div>
                    <div style={{ fontSize: 13, color: T.textDim }}>
                      {focused.span}{focused.championships ? ` · ${focused.championships}× champion` : ""}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {rec?.teamFit && (
                    <span style={{ padding: "4px 10px", borderRadius: R.pill, fontSize: 11.5, fontWeight: 800,
                      background: T.bgMuted, color: FIT_COLOR(rec.teamFit), border: `1px solid ${T.border}` }}>
                      Roster fit: {rec.teamFit}
                    </span>
                  )}
                  {/* Era compatibility only exists once an era has been chosen. */}
                  {eraStyleId && rec?.eraFit && (
                    <span style={{ padding: "4px 10px", borderRadius: R.pill, fontSize: 11.5, fontWeight: 800,
                      background: T.bgMuted, color: FIT_COLOR(rec.eraFit), border: `1px solid ${T.border}` }}>
                      {eraLabel || eraStyleId} fit: {rec.eraFit}
                    </span>
                  )}
                  {rec?.angle && (
                    <span style={{ padding: "4px 10px", borderRadius: R.pill, fontSize: 11.5, fontWeight: 800,
                      background: side === "blue" ? T.blueSoft : T.goldSoft, color: accent, border: `1px solid ${accent}55` }}>
                      {rec.angle}
                    </span>
                  )}
                </div>

                <Section title="SYSTEM IDENTITY">
                  {(focused.systemTags ?? []).map((t, i) => (
                    <div key={i} style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>
                      <span style={{ color: T.green, fontWeight: 800 }}>✓</span> {t}
                    </div>
                  ))}
                </Section>

                {rec?.whyItFits && <Section title="WHY THIS COACH"><p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: T.text }}>{rec.whyItFits}</p></Section>}
                {!rec && (focused.bestWith ?? []).length > 0 && (
                  <Section title="BEST WITH">
                    {focused.bestWith.map((b, i) => <div key={i} style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>• {b}</div>)}
                  </Section>
                )}
                {(rec?.concern || focused.concern) && (
                  <Section title="POTENTIAL TRADEOFF">
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: T.text }}>{rec?.concern || focused.concern}</p>
                  </Section>
                )}
                {!eraStyleId && (
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 12, lineHeight: 1.5 }}>
                    Era compatibility appears once you pick the Era Style in the next step.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", gap: 10, padding: "12px 18px", borderTop: `1px solid ${T.border}`, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...control, cursor: "pointer", fontWeight: 700, minWidth: 100 }}>Cancel</button>
          <button onClick={() => focused && onSelect(focused)} disabled={!focused} style={{
            padding: "11px 22px", fontSize: 14, fontWeight: 900, borderRadius: R.sm, minHeight: 44,
            border: "none", cursor: focused ? "pointer" : "default",
            background: focused ? accent : T.border, color: "#fffdf8", minWidth: 150,
          }}>{focused ? `Select ${focused.name.split(" ").slice(-1)[0]}` : "Select Coach"}</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: T.textDim, marginBottom: 5 }}>{title}</div>
      {children}
    </div>
  );
}
