// ── Live Intel ───────────────────────────────────────────────────────────────
// The top of the right rail: what this five IS, what it risks, what the Legend
// CPU brings, how much pressure the draft is under, and the environment the
// game will be played in.
//
// Every value is a real read of the authoritative setup. No hidden score is
// exposed and nothing here predicts a winner. Draft Pressure lives HERE and
// nowhere else — it used to be printed twice, which read as two numbers.
import { useState } from "react";
import { membershipHref } from "../../navigation.js";

const PRESSURE_TONE = {
  LOW: "var(--ec-a-text-secondary)",
  RISING: "var(--ec-a-gold)",
  HIGH: "var(--ec-a-gold)",
};

const Row = ({ label, tone, values, note }) => (
  <div className="ec-intel-row">
    <div className="ec-intel-label" style={{ color: tone }}>{label}</div>
    <div className="ec-intel-values">
      {values.filter(Boolean).map((v, i) => (
        <div key={i} className="ec-intel-value" style={i > 0 ? { color: "var(--ec-a-text-secondary)", fontSize: 11.5 } : undefined}>{v}</div>
      ))}
    </div>
    {note && <div style={{ fontSize: 11, color: "var(--ec-a-text-muted)", lineHeight: 1.45, marginTop: 2 }}>{note}</div>}
  </div>
);

export default function LiveIntel({ run, onEraChange, onMembership }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [eraOpen, setEraOpen] = useState(false);
  const g = run?.gold?.analysis;
  const b = run?.blue?.analysis;
  const eraState = run?.eraState;
  const eraCtx = run?.eraContext;
  const change = eraState?.change;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="ec-panel ec-panel-raised" style={{ padding: 14 }} aria-label="Live intel">
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
          <span aria-hidden="true" style={{ color: "var(--ec-a-green)", fontSize: 13 }}>⌁</span>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-text)" }}>LIVE INTEL</div>
        </div>

        {!run ? (
          <div style={{ fontSize: 12.5, color: "var(--ec-a-text-secondary)", lineHeight: 1.55 }}>
            Roll your first five to reveal your team identity.
          </div>
        ) : !g ? (
          <div style={{ fontSize: 12.5, color: "var(--ec-a-text-secondary)", lineHeight: 1.55 }}>
            Your five is still incomplete — the read arrives with the full bench.
          </div>
        ) : (
          <>
            <Row label="YOUR IDENTITY" tone="var(--ec-a-gold)"
              values={[g.bestStrength?.label, `${g.talentTier} talent · ${g.constructionTier} construction`]} />
            <Row label="BIGGEST RISK" tone="var(--ec-a-red)"
              values={[g.biggestRisk?.label]} note={g.biggestRisk?.detail} />
            <Row label="BLUE'S STRENGTH" tone="var(--ec-a-blue)"
              values={[b?.bestStrength?.label ?? "—", b ? `${b.talentTier} talent · ${b.constructionTier} construction` : null]} />
            <Row label="DRAFT PRESSURE" tone={PRESSURE_TONE[run.draftPressure?.level] || "var(--ec-a-text-secondary)"}
              values={[run.draftPressure?.level ?? "—"]} note={run.draftPressure?.tooltip} />
            <div style={{ fontSize: 11, color: "var(--ec-a-text-muted)", marginTop: 8, lineHeight: 1.45 }}>
              A read of what you have built, not a prediction. The game decides it.
            </div>
          </>
        )}
      </section>

      {/* ── Era Impact ───────────────────────────────────────────────────── */}
      <section className="ec-panel ec-panel-raised" style={{ padding: 14 }} aria-label="Era impact">
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
          <span aria-hidden="true" style={{ fontSize: 12 }}>🗓</span>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-text)" }}>ERA IMPACT</div>
        </div>

        {!eraState?.revealed ? (
          <div style={{ fontSize: 12.5, color: "var(--ec-a-text-secondary)", lineHeight: 1.55 }}>
            <span style={{ fontWeight: 900, letterSpacing: 1.2, color: "var(--ec-a-text-muted)" }}>ERA HIDDEN</span>
            <div style={{ marginTop: 4 }}>Revealed with Roll 2, before your final decision.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 900, color: "var(--ec-a-gold)", lineHeight: 1 }}>
                {eraState.eraStyleId}
              </span>
              {!change?.allowed && <span aria-hidden="true" title="This era is locked for this run">🔒</span>}
              <span style={{
                marginLeft: "auto", fontSize: 9.5, fontWeight: 900, letterSpacing: 1,
                padding: "4px 8px", borderRadius: 999,
                color: eraState.custom ? "var(--ec-a-coach)" : "var(--ec-a-text-secondary)",
                border: `1px solid ${eraState.custom ? "var(--ec-a-coach-line)" : "var(--ec-a-border)"}`,
              }}>{eraState.custom ? "CUSTOM ERA" : "CURRENT ERA"}</span>
            </div>

            <div style={{ display: "grid", gap: 3, marginTop: 9 }}>
              {(eraCtx?.highlights || []).filter(Boolean).map((h) => (
                <div key={h} style={{ fontSize: 12, color: "var(--ec-a-text-secondary)", lineHeight: 1.5 }}>{h}</div>
              ))}
            </div>

            {rulesOpen && (
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                {[eraCtx?.pace, eraCtx?.rebounding, ...(eraCtx?.ruleFacts || [])].filter(Boolean).map((f) => (
                  <li key={f} style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)", lineHeight: 1.5 }}>· {f}</li>
                ))}
              </ul>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
              <button onClick={() => setRulesOpen((o) => !o)} aria-expanded={rulesOpen} style={linkBtn}>
                {rulesOpen ? "Less" : "Era rules"}
              </button>
              {eraState.custom && eraState.seedEraStyleId && (
                <span style={{ fontSize: 11, color: "var(--ec-a-text-muted)" }}>
                  Rolled: {eraState.seedEraStyleId}
                </span>
              )}
            </div>

            {/* ── Era control ──────────────────────────────────────────────
                What the account may actually do, decided by the server. A
                competitive run is reported as such BEFORE membership, so nobody
                is invited to pay for something no tier can change. */}
            {change?.allowed ? (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--ec-a-border)", paddingTop: 10 }}>
                <button onClick={() => setEraOpen((o) => !o)} aria-expanded={eraOpen} style={{
                  minHeight: 44, width: "100%", borderRadius: 9, cursor: "pointer",
                  fontWeight: 800, fontSize: 11.5, letterSpacing: 0.6,
                  border: "1px solid var(--ec-a-coach-line)", background: "var(--ec-a-coach-soft)",
                  color: "var(--ec-a-coach)",
                }}>{eraOpen ? "KEEP THIS ERA" : "CHANGE ERA"}</button>
                {eraOpen && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 5 }}>
                      {(change.eras || []).map((id) => (
                        <button key={id} onClick={() => onEraChange?.(id)} style={{
                          minHeight: 44, borderRadius: 8, cursor: "pointer",
                          fontSize: 11, fontWeight: 800,
                          border: `1px solid ${id === eraState.eraStyleId ? "var(--ec-a-gold-line)" : "var(--ec-a-border)"}`,
                          background: id === eraState.eraStyleId ? "var(--ec-a-gold-soft)" : "transparent",
                          color: id === eraState.eraStyleId ? "var(--ec-a-gold)" : "var(--ec-a-text-secondary)",
                        }} aria-pressed={id === eraState.eraStyleId}>{id}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ec-a-text-muted)", marginTop: 7, lineHeight: 1.45 }}>
                      Unranked solo play only, before the final roll. A chosen era is labelled CUSTOM
                      wherever this game appears, and every era plays by the same rules for everyone.
                    </div>
                  </div>
                )}
              </div>
            ) : change?.reason === "COMPETITIVE_LOCK" ? (
              <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--ec-a-text-muted)", lineHeight: 1.5, borderTop: "1px solid var(--ec-a-border)", paddingTop: 10 }}>
                {change.message || "Same-seed challenges keep the era they were dealt, for everyone."}
              </div>
            ) : change?.reason === "NOT_ENTITLED" ? (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--ec-a-border)", paddingTop: 10 }}>
                <button onClick={() => onMembership?.(membershipHref({ feature: "custom-era", required: "PLUS", from: "live-intel" }))}
                  style={linkBtn}>Change eras with membership</button>
                <div style={{ fontSize: 11, color: "var(--ec-a-text-muted)", marginTop: 3, lineHeight: 1.45 }}>
                  Your era is rolled for you, and it is the same environment for both teams.
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

const linkBtn = {
  minHeight: 44, padding: 0, background: "transparent", border: "none", cursor: "pointer",
  color: "var(--ec-a-text-secondary)", fontSize: 11.5, fontWeight: 700, textDecoration: "underline",
};
