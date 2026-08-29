// ── Coaching & Strategy ──────────────────────────────────────────────────────
// Phase 7B. This tab now shows coaching: the plan each staff opened with, the
// defensive shell it installed and what personnel or era rules constrained it,
// every in-game adjustment with the trigger that caused it, and the matchups
// the opponent attacked. Every item is a recorded engine decision. A side with
// no recorded adjustment says exactly that.
import { T, S, R, FONT, teamAccent } from "../theme.js";

function Panel({ title, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: T.textDim, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function SideColumn({ side, data }) {
  const accent = teamAccent(side);
  if (!data) return null;
  const { openingPlan: plan, defense, adjustments, declinedAdjustments, attackedMatchups, finalActions } = data;
  const sideName = side === "blue" ? "Blue" : "Gold";
  return (
    <div style={{ padding: S.lg, borderRadius: R.lg, background: T.bgCard, border: `1px solid ${T.border}`, borderTop: `3px solid ${accent}`, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: accent }}>TEAM {side === "blue" ? "BLUE" : "GOLD"}</div>
      <div style={{ fontSize: 17, fontWeight: 900, fontFamily: FONT.display, color: T.text }}>{data.coach ?? "—"}</div>

      <Panel title="OFFENSIVE PLAN">
        <div style={{ fontSize: 14, color: T.text, lineHeight: 1.65 }}>
          {plan.actions.length > 0 && (
            <>{data.coach ?? "The staff"} opened {sideName} in {plan.actions[0].action.toLowerCase()}
              {plan.actions[1] ? ` with ${plan.actions[1].action.toLowerCase()} behind it` : ""}. </>
          )}
          {plan.initiator && <>{plan.initiator} started the offense. </>}
          {plan.pace && <>The plan asked for a {plan.pace} tempo. </>}
          {plan.crashesGlass === true && <>They crashed the offensive glass rather than getting back.</>}
          {plan.crashesGlass === false && <>They got back rather than crashing the glass.</>}
        </div>
        {/* Percentages SUPPORT the explanation; they do not replace it. */}
        {plan.actions.length > 0 && (
          <details style={{ marginTop: 7 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.textDim }}>Tactical mix</summary>
            <div style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.6, marginTop: 5 }}>
              <div><strong style={{ color: T.text }}>Planned:</strong> {plan.actions.map((a) => `${a.action.toLowerCase()} ${a.share}%`).join(", ")}</div>
              {finalActions?.length > 0 && (
                <div><strong style={{ color: T.text }}>Actual:</strong> {finalActions.map((a) => `${a.action.toLowerCase()} ${a.share}%`).join(", ")}</div>
              )}
            </div>
          </details>
        )}
      </Panel>

      {finalActions?.length > 0 && plan.actions.length > 0 && finalActions[0].action !== plan.actions[0].action && (
        <Panel title="HOW IT EVOLVED">
          <div style={{ fontSize: 14, color: T.text, lineHeight: 1.65 }}>
            The plan opened in {plan.actions[0].action.toLowerCase()}, but the game moved toward{" "}
            {finalActions[0].action.toLowerCase()}.
          </div>
        </Panel>
      )}

      {defense && (
        <Panel title="DEFENSIVE SCHEME">
          <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>
            {/* The coverage label is already a complete phrase ("mixing its
                ball-screen coverages"); appending a suffix produced
                "...coverages ball-screen coverage." */}
            {defense.shell}{defense.ballScreenCoverage ? `, ${defense.ballScreenCoverage}` : ""}.
            {defense.pressure ? ` ${defense.pressure[0].toUpperCase() + defense.pressure.slice(1)} pressure` : ""}
            {defense.pressure && defense.help ? `, ${defense.help} help.` : defense.help ? ` ${defense.help[0].toUpperCase() + defense.help.slice(1)} help.` : defense.pressure ? "." : ""}
          </div>
          {defense.constraints?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {defense.constraints.map((c, i) => (
                <div key={i} style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.55 }}>
                  · {c.text || c.detail}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title="IN-GAME ADJUSTMENTS">
        {adjustments?.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
            {adjustments.slice(0, 6).map((a, i) => (
              <li key={i} style={{ fontSize: 13.5, color: T.text, lineHeight: 1.55 }}>
                {(a.when || a.scoreState) && (
                  <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1, color: T.textDim }}>
                    {[a.when, a.scoreState].filter(Boolean).join(" — ").toUpperCase()}
                  </div>
                )}
                {a.text}
              </li>
            ))}
          </ol>
        ) : (
          <div style={{ fontSize: 13.5, color: T.textDim }}>No in-game adjustment was recorded.</div>
        )}
        {declinedAdjustments?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: T.textMuted }}>CONSIDERED BUT DECLINED</div>
            {declinedAdjustments.slice(0, 3).map((a, i) => (
              <div key={i} style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.55, marginTop: 4 }}>
                {a.when ? <span style={{ fontWeight: 700 }}>{a.when} — </span> : null}{a.text}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {attackedMatchups?.length > 0 && (
        <Panel title={`WHAT ${side === "blue" ? "GOLD" : "BLUE"} TARGETED`}>
          <div style={{ display: "grid", gap: 5 }}>
            {attackedMatchups.map((m, i) => (
              <div key={i} style={{ fontSize: 13.5, color: T.text, lineHeight: 1.55 }}>
                {m.text || `${m.scorer} vs ${m.defender} — ${m.possessions} possessions`}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export default function CoachingStrategy({ coaching, eraLabel }) {
  if (!coaching) {
    return (
      <div style={{ padding: S.lg, borderRadius: R.lg, background: T.bgCard, border: `1px solid ${T.border}`, marginTop: 12 }}>
        <div style={{ fontSize: 14, color: T.textDim, lineHeight: 1.6 }}>
          Coaching detail is recorded by the preview simulation. This result was produced by the production
          engine, which does not record game-plan and adjustment history.
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      {eraLabel && <div style={{ fontSize: 12.5, color: T.textDim, marginBottom: 8 }}>Played in the {eraLabel} Era Style.</div>}
      <div className="coaching-grid">
        <SideColumn side="gold" data={coaching.gold} />
        <SideColumn side="blue" data={coaching.blue} />
      </div>
    </div>
  );
}
