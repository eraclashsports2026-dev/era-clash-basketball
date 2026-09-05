// ── Live Intel ───────────────────────────────────────────────────────────────
// ONE bordered surface that reads the authoritative setup: what this five IS,
// what it risks, what the Legend CPU brings, how much pressure the draft is
// under, and — below a heavier divider rather than in a detached card — the era
// the game will be played in.
//
// Phase 9B.3 made it CONTEXTUAL. While drafting it is compact: the four reads
// as single lines and one VIEW DETAILS control, with the explanations and the
// era section one tap away. At the era reveal it shows the era alone. Once the
// five is set it reads the finished roster strategically; at Clash Ready it is
// the matchup. Every value is a real read; nothing predicts a winner. Draft
// Pressure lives HERE and nowhere else — it used to be printed twice.
import { useState } from "react";
import { membershipHref } from "../../navigation.js";
import { track } from "../../analytics.js";
import { GUIDED_EVENTS } from "./guidedState.js";

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
        <div key={i} className={`ec-intel-value${i > 0 ? " ec-intel-value--sub" : ""}`}>{v}</div>
      ))}
    </div>
    {note && <div className="ec-intel-note">{note}</div>}
  </div>
);

/**
 * @param compact  drafting: single-line reads plus VIEW DETAILS
 * @param panel    "full" | "era" | "roster" | "matchup"
 */
export default function LiveIntel({ run, onEraChange, onMembership, compact = false, panel = "full" }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [eraOpen, setEraOpen] = useState(false);
  const [more, setMore] = useState(false);
  const g = run?.gold?.analysis;
  const b = run?.blue?.analysis;
  const eraState = run?.eraState;
  const eraCtx = run?.eraContext;
  const change = eraState?.change;
  const expanded = !compact || more;

  const toggleMore = () => {
    setMore((o) => { if (!o) track(GUIDED_EVENTS.LIVE_INTEL_EXPANDED, { roll: run?.roll ?? null }); return !o; });
  };
  const toggleRules = () => {
    setRulesOpen((o) => { if (!o) track(GUIDED_EVENTS.ERA_RULES_EXPANDED, { from: "live_intel" }); return !o; });
  };

  // ── The era section: shared by the full panel and the era-only panel ───────
  const eraSection = (
    <div className="ec-intel-era" data-revealed={eraState?.revealed ? "true" : "false"}>
      <div className="ec-intel-head">
        <span aria-hidden="true" style={{ fontSize: 12 }}>🗓</span>
        <h3 className="ec-intel-heading">ERA IMPACT</h3>
      </div>

      {!eraState?.revealed ? (
        <>
          <div className="ec-intel-label" style={{ color: "var(--ec-a-text-muted)", marginTop: 4 }}>ERA HIDDEN</div>
          <div className="ec-intel-note" style={{ marginTop: 3 }}>Revealed with Roll 2, before your final decision.</div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
            <span className="ec-intel-era-id">{eraState.eraStyleId}</span>
            {!change?.allowed && <span aria-hidden="true" title="This era is locked for this run">🔒</span>}
            <span style={{
              marginLeft: "auto", fontSize: 9.5, fontWeight: 900, letterSpacing: 1,
              padding: "4px 8px", borderRadius: 7,
              color: "var(--ec-a-coach)", border: `1px solid ${eraState.custom ? "var(--ec-a-coach)" : "var(--ec-a-coach-line)"}`,
              background: "var(--ec-a-coach-soft)",
            }}>{eraState.custom ? "CUSTOM ERA" : "CURRENT ERA"}</span>
          </div>

          <div style={{ display: "grid", gap: 2, marginTop: 8 }}>
            {(panel === "era" ? [] : (eraCtx?.highlights || [])).filter(Boolean).map((h, i) => (
              <div key={h} className={i === 0 ? "ec-intel-value" : "ec-intel-value ec-intel-value--sub"}
                style={i === 0 ? { color: "var(--ec-a-coach)" } : undefined}>{h}</div>
            ))}
          </div>

          {rulesOpen && (
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
              {[eraCtx?.pace, eraCtx?.rebounding, ...(eraCtx?.ruleFacts || [])].filter(Boolean).map((f) => (
                <li key={f} className="ec-intel-note">· {f}</li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <button onClick={toggleRules} aria-expanded={rulesOpen} style={linkBtn}>
              {rulesOpen ? "Less" : "Era rules"}
            </button>
            {eraState.custom && eraState.seedEraStyleId && (
              <span className="ec-intel-note">Rolled: {eraState.seedEraStyleId}</span>
            )}
          </div>

          {/* What the account may actually do, decided by the server. */}
          {change?.allowed ? (
            <div style={{ marginTop: 8, borderTop: "1px solid var(--ec-a-border)", paddingTop: 8 }}>
              <button onClick={() => setEraOpen((o) => !o)} aria-expanded={eraOpen} style={{
                minHeight: 40, width: "100%", borderRadius: 8, cursor: "pointer",
                fontWeight: 800, fontSize: 11.5, letterSpacing: 0.6,
                border: "1px solid var(--ec-a-coach-line)", background: "var(--ec-a-coach-soft)",
                color: "var(--ec-a-coach)",
              }}>{eraOpen ? "KEEP THIS ERA" : "CHANGE ERA"}</button>
              {eraOpen && (
                <div style={{ marginTop: 7 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 4 }}>
                    {(change.eras || []).map((id) => (
                      <button key={id} onClick={() => onEraChange?.(id)} aria-pressed={id === eraState.eraStyleId} style={{
                        minHeight: 40, borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 800,
                        border: `1px solid ${id === eraState.eraStyleId ? "var(--ec-a-gold-line)" : "var(--ec-a-border)"}`,
                        background: id === eraState.eraStyleId ? "var(--ec-a-gold-soft)" : "transparent",
                        color: id === eraState.eraStyleId ? "var(--ec-a-gold)" : "var(--ec-a-text-secondary)",
                      }}>{id}</button>
                    ))}
                  </div>
                  <div className="ec-intel-note" style={{ marginTop: 6 }}>
                    Unranked solo play only, before the final roll. A chosen era is labelled CUSTOM
                    wherever this game appears, and every era plays by the same rules for everyone.
                  </div>
                </div>
              )}
            </div>
          ) : change?.reason === "COMPETITIVE_LOCK" ? (
            <div className="ec-intel-note" style={{ marginTop: 8, borderTop: "1px solid var(--ec-a-border)", paddingTop: 8 }}>
              {change.message || "Same-seed challenges keep the era they were dealt, for everyone."}
            </div>
          ) : change?.reason === "NOT_ENTITLED" ? (
            <div style={{ marginTop: 8, borderTop: "1px solid var(--ec-a-border)", paddingTop: 8 }}>
              <button onClick={() => onMembership?.(membershipHref({ feature: "custom-era", required: "PLUS", from: "live-intel" }))}
                style={linkBtn}>Change eras with membership</button>
              <div className="ec-intel-note" style={{ marginTop: 2 }}>
                Your era is rolled for you, and it is the same environment for both teams.
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  // ── Era only (state 3) ─────────────────────────────────────────────────────
  if (panel === "era") {
    return <section className="ec-intel ec-intel--era" aria-label="Era impact">{eraSection}</section>;
  }

  // ── The finished five, read strategically (state 4) ────────────────────────
  if (panel === "roster") {
    return (
      <section className="ec-intel" aria-label="Your five, read">
        <div className="ec-intel-head">
          <span aria-hidden="true" style={{ color: "var(--ec-a-green)", fontSize: 13 }}>⌁</span>
          <h2 className="ec-intel-heading">YOUR FIVE, READ</h2>
        </div>
        {!g ? <div className="ec-intel-value">The read arrives with the full bench.</div> : (
          <>
            <Row label="YOUR IDENTITY" tone="var(--ec-a-gold)" values={[g.bestStrength?.label, `${g.talentTier} talent · ${g.constructionTier} construction`]} />
            <Row label="BIGGEST RISK" tone="var(--ec-a-red)" values={[g.biggestRisk?.label]} note="A coach can lean into the strength or cover the risk. That is the decision on the board." />
            <Row label="BLUE'S STRENGTH" tone="var(--ec-a-blue)" values={[b?.bestStrength?.label ?? "—"]} />
          </>
        )}
      </section>
    );
  }

  // ── The matchup (state 5): no prediction, no likely winner ─────────────────
  if (panel === "matchup") {
    return (
      <section className="ec-intel" aria-label="Matchup intel">
        <div className="ec-intel-head">
          <span aria-hidden="true" style={{ color: "var(--ec-a-green)", fontSize: 13 }}>⌁</span>
          <h2 className="ec-intel-heading">MATCHUP INTEL</h2>
        </div>
        {!g ? <div className="ec-intel-value">The read arrives with the full bench.</div> : (
          <>
            <Row label="GOLD IDENTITY" tone="var(--ec-a-gold)" values={[g.bestStrength?.label]} />
            <Row label="BLUE STRENGTH" tone="var(--ec-a-blue)" values={[b?.bestStrength?.label ?? "—"]} />
            {eraState?.revealed && <Row label="ERA" tone="var(--ec-a-coach)" values={[eraState.eraStyleId, eraCtx?.highlights?.[0]]} />}
            <Row label="KEY MATCHUP" tone="var(--ec-a-text-secondary)" values={[g.biggestRisk?.label]} note="Where this Clash is most likely to be decided — not who wins it." />
          </>
        )}
      </section>
    );
  }

  // ── Full and compact (states 2 and the fixture) ────────────────────────────
  return (
    <section className={`ec-intel${compact ? " ec-intel--compact" : ""}`} aria-label="Live intel and era impact" data-expanded={expanded ? "true" : "false"}>
      <div className="ec-intel-head">
        <span aria-hidden="true" style={{ color: "var(--ec-a-green)", fontSize: 13 }}>⌁</span>
        <h2 className="ec-intel-heading">LIVE INTEL</h2>
      </div>

      {!run ? (
        <div className="ec-intel-value">Roll your first five to reveal your team identity.</div>
      ) : !g ? (
        <div className="ec-intel-value">Your five is still incomplete — the read arrives with the full bench.</div>
      ) : (
        <>
          <Row label="YOUR IDENTITY" tone="var(--ec-a-gold)"
            values={[g.bestStrength?.label, expanded ? `${g.talentTier} talent · ${g.constructionTier} construction` : null]} />
          <Row label="BIGGEST RISK" tone="var(--ec-a-red)"
            values={[g.biggestRisk?.label]} />
          <Row label="BLUE'S STRENGTH" tone="var(--ec-a-blue)"
            values={[b?.bestStrength?.label ?? "—", expanded && b ? `${b.talentTier} talent · ${b.constructionTier} construction` : null]} />
          <Row label="DRAFT PRESSURE" tone={PRESSURE_TONE[run.draftPressure?.level] || "var(--ec-a-text-secondary)"}
            values={[run.draftPressure?.level ?? "—"]}
            note={expanded ? "Rare talent held lowers the odds of the next elite pull, never to zero. A read of what you built, not a prediction." : null} />
        </>
      )}

      {compact && run && g && (
        <button type="button" className="ec-intel-more" onClick={toggleMore} aria-expanded={more}>
          {more ? "LESS" : "VIEW DETAILS"}
        </button>
      )}

      {/* Era Impact: a SECTION of this panel. Compact intel keeps it one tap away. */}
      {expanded && eraSection}
    </section>
  );
}

const linkBtn = {
  minHeight: 36, padding: 0, background: "transparent", border: "none", cursor: "pointer",
  color: "var(--ec-a-text-secondary)", fontSize: 11.5, fontWeight: 700, textDecoration: "underline",
};
