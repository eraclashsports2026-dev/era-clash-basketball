// ── Roll progression strip ───────────────────────────────────────────────────
// Driven entirely by server state. It never infers a roll on its own, so it
// cannot invent a fourth roll or count the empty board as Roll 1.
const STEPS = [
  { n: 1, label: "ROLL 1", sub: "Draft your foundation." },
  { n: 2, label: "ROLL 2", sub: "Era revealed — adapt." },
  { n: 3, label: "ROLL 3", sub: "Final adjustments." },
];

export default function RollStrip({ run }) {
  // With no run yet, Roll 1 is the ACTIONABLE step rather than a future one:
  // it is what the button in the arena will do next.
  const current = run ? run.roll : 1;
  const locked = !!run?.rostersLocked;
  return (
    <div className="ec-rollstrip" role="list" aria-label="Draft progress">
      {STEPS.map((s) => {
        const state = locked || current > s.n ? "COMPLETE" : current === s.n ? "ACTIVE" : "UP NEXT";
        const active = state === "ACTIVE";
        const done = state === "COMPLETE";
        return (
          <div key={s.n} role="listitem" className="ec-panel" style={{
            padding: "11px 13px",
            borderColor: active ? "var(--ec-a-gold-line)" : "var(--ec-a-border)",
            background: active ? "var(--ec-a-gold-soft)" : "var(--ec-a-panel, #091321)",
            opacity: state === "UP NEXT" ? 0.72 : 1,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span aria-hidden="true" style={{ fontSize: 14 }}>🎲</span>
              <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.6, color: active ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-text, #f5f7fb)" }}>
                {s.label}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted, #93a0b5)", marginTop: 2 }}>{s.sub}</div>
            <div style={{
              fontSize: 9.5, fontWeight: 900, letterSpacing: 1, marginTop: 5,
              color: done ? "var(--ec-a-green, #4ade80)" : active ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-text-muted, #93a0b5)",
            }}>{done ? "COMPLETE ✓" : state}</div>
          </div>
        );
      })}
    </div>
  );
}
