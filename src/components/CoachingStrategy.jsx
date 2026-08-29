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
  const { openingPlan: plan, defense, adjustments, attackedMatchups, finalActions } = data;
  return (
    <div style={{ padding: S.lg, borderRadius: R.lg, background: T.bgCard, border: `1px solid ${T.border}`, borderTop: `3px solid ${accent}`, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: accent }}>TEAM {side === "blue" ? "BLUE" : "GOLD"}</div>
      <div style={{ fontSize: 17, fontWeight: 900, fontFamily: FONT.display, color: T.text }}>{data.coach ?? "—"}</div>

      <Panel title="OPENING PLAN">
        <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>
          {plan.actions.length > 0 && <>Built around {plan.actions.map((a) => `${a.action.toLowerCase()} (${a.share}%)`).join(", ")}. </>}
          {plan.pace && <>{plan.pace[0].toUpperCase() + plan.pace.slice(1)} tempo. </>}
          {plan.initiator && <>{plan.initiator} initiates. </>}
          {plan.crashesGlass === true && <>Crashes the offensive glass.</>}
          {plan.crashesGlass === false && <>Gets back rather than crashing.</>}
        </div>
      </Panel>

      {finalActions?.length > 0 && (
        <Panel title="WHAT IT BECAME">
          <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>
            {finalActions.map((a) => `${a.action.toLowerCase()} (${a.share}%)`).join(", ")}
          </div>
        </Panel>
      )}

      {defense && (
        <Panel title="DEFENSIVE SCHEME">
          <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>
            {defense.shell}. {defense.ballScreenCoverage ? `${defense.ballScreenCoverage} ball-screen coverage. ` : ""}
            {defense.pressure ? `${defense.pressure[0].toUpperCase() + defense.pressure.slice(1)} pressure` : ""}
            {defense.help ? `, ${defense.help} help.` : "."}
          </div>
          {defense.constraints?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {defense.constraints.map((c, i) => (
                <div key={i} style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.5 }}>
                  ⚠ {c.detail}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title="IN-GAME ADJUSTMENTS">
        {adjustments?.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {adjustments.slice(0, 6).map((a, i) => (
              <li key={i} style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>
                <span style={{ color: T.textDim }}>Poss. {a.possession} —</span> {a.trigger}, so the staff {a.response}.
              </li>
            ))}
          </ol>
        ) : (
          <div style={{ fontSize: 13.5, color: T.textDim }}>No in-game adjustment was recorded.</div>
        )}
      </Panel>

      {attackedMatchups?.length > 0 && (
        <Panel title="ATTACKED AGAINST THIS DEFENCE">
          {attackedMatchups.map((m, i) => (
            <div key={i} style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>
              {m.scorer} vs {m.defender} — {m.possessions} possessions
            </div>
          ))}
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
