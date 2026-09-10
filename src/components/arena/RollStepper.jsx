// ── Roll progression ─────────────────────────────────────────────────────────
// Three rolls, named for what each one is for. Driven entirely by the
// authoritative run: it never infers a roll of its own, so it cannot invent a
// fourth or count an empty board as Roll 1.
const STEPS = [
  { n: 1, label: "ROLL 1", sub: "Your first five and your first three staffs." },
  { n: 2, label: "ROLL 2", sub: "Hold who stays; the rest are rerolled." },
  { n: 3, label: "FINAL ROLL", sub: "Final roster, final three offers, one hire — then the era." },
];

export const rollState = (run, n) => {
  const current = run ? run.roll : 1;
  const finished = run?.phase === "READY" || run?.phase === "SIMULATED";
  if (finished || current > n) return "COMPLETE";
  if (current === n) return "ACTIVE";
  return "UP NEXT";
};

export default function RollStepper({ run }) {
  return (
    <div className="ec-ta-stepper" role="list" aria-label="Draft progress">
      {STEPS.map((s, i) => {
        const state = rollState(run, s.n);
        return (
          <div key={s.n} style={{ display: "flex", alignItems: "flex-start" }}>
            {i > 0 && <div className="ec-ta-step-rule" aria-hidden="true" />}
            <div className="ec-ta-step" data-state={state} role="listitem" title={s.sub}
              aria-label={`Roll ${s.n}, ${s.label.toLowerCase()} — ${state.toLowerCase()}`}>
              <div className="ec-ta-step-dot">{state === "COMPLETE" ? "✓" : s.n}</div>
              <div className="ec-ta-step-label">{s.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
