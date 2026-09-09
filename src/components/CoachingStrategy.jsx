// ── Coaching & Strategy ──────────────────────────────────────────────────────
// Phase 8B reorganises this tab into three sub-sections instead of two very
// long parallel columns. It should read as a scouting report and a film-room
// explanation — never as a debug transcript.
import { useState } from "react";
import { T, S, R, FONT, teamAccent } from "../theme.js";

const SECTIONS = [
  ["offense", "Offensive Scheme"],
  ["defense", "Defensive Scheme"],
  ["adjustments", "In-Game Adjustments"],
];
const VISIBLE_ADJUSTMENTS = 4;

function Sub({ title, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: T.textDim, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function OffensePanel({ data, side }) {
  const { openingPlan: plan, finalActions, attackedMatchups } = data;
  const other = side === "gold" ? "Blue" : "Gold";
  return (
    <>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.65 }}>
        {plan.actions?.length > 0 && (
          <>{data.coach ?? "The staff"} opened in {plan.actions[0].action.toLowerCase()}
            {plan.actions[1] ? ` with ${plan.actions[1].action.toLowerCase()} behind it` : ""}. </>
        )}
        {plan.initiator && <>{plan.initiator} started the offense. </>}
        {plan.pace && <>The plan asked for a {plan.pace} tempo. </>}
        {plan.crashesGlass === true && <>They crashed the offensive glass rather than getting back.</>}
        {plan.crashesGlass === false && <>They got back rather than crashing the glass.</>}
      </div>

      {finalActions?.length > 0 && plan.actions?.length > 0 && finalActions[0].action !== plan.actions[0].action && (
        <Sub title="HOW IT EVOLVED">
          <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>
            It opened in {plan.actions[0].action.toLowerCase()}, but the game moved toward {finalActions[0].action.toLowerCase()}.
          </div>
        </Sub>
      )}

      {/* The useful half of the old "attacked against this defence" list, told
          from the attacking side and always with its consequence. */}
      {attackedMatchups?.length > 0 && (
        <Sub title="PRIMARY MATCHUPS TARGETED">
          <div style={{ display: "grid", gap: 5 }}>
            {attackedMatchups.map((m, i) => (
              <div key={i} style={{ fontSize: 13.5, color: T.text, lineHeight: 1.55 }}>{m.text}</div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 5 }}>
            What {other} ran at this defense.
          </div>
        </Sub>
      )}

      {plan.actions?.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.textDim }}>Tactical mix</summary>
          <div style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.6, marginTop: 5 }}>
            <div><strong style={{ color: T.text }}>Planned:</strong> {plan.actions.map((a) => `${a.action.toLowerCase()} ${a.share}%`).join(", ")}</div>
            {finalActions?.length > 0 && (
              <div><strong style={{ color: T.text }}>Actual:</strong> {finalActions.map((a) => `${a.action.toLowerCase()} ${a.share}%`).join(", ")}</div>
            )}
          </div>
        </details>
      )}
    </>
  );
}

function DefensePanel({ data }) {
  const d = data.defense;
  if (!d) return <div style={{ fontSize: 13.5, color: T.textDim }}>No defensive detail was recorded.</div>;
  return (
    <>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.65 }}>
        {d.shell}{d.ballScreenCoverage ? `, ${d.ballScreenCoverage}` : ""}.
        {d.pressure ? ` ${d.pressure[0].toUpperCase() + d.pressure.slice(1)} pressure` : ""}
        {d.pressure && d.help ? `, ${d.help} help.` : d.help ? ` ${d.help[0].toUpperCase() + d.help.slice(1)} help.` : d.pressure ? "." : ""}
      </div>
      {d.constraints?.length > 0 && (
        <Sub title="WHAT LIMITED IT">
          <div style={{ display: "grid", gap: 4 }}>
            {d.constraints.map((c, i) => (
              <div key={i} style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.55 }}>· {c.text || c.detail}</div>
            ))}
          </div>
        </Sub>
      )}
    </>
  );
}

function AdjustmentsPanel({ data }) {
  const [all, setAll] = useState(false);
  const applied = data.adjustments || [];
  const declined = data.declinedAdjustments || [];
  const shown = all ? applied : applied.slice(0, VISIBLE_ADJUSTMENTS);
  if (!applied.length) {
    return <div style={{ fontSize: 13.5, color: T.textDim }}>No in-game adjustment was recorded.</div>;
  }
  return (
    <>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
        {shown.map((a, i) => (
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
      {applied.length > VISIBLE_ADJUSTMENTS && (
        <button onClick={() => setAll((x) => !x)} style={{
          marginTop: 8, background: "transparent", border: "none", cursor: "pointer",
          color: T.gold, fontSize: 12, fontWeight: 700, textDecoration: "underline", padding: 0,
        }}>{all ? "Show fewer" : `Show all ${applied.length}`}</button>
      )}
      {declined.length > 0 && (
        <Sub title="CONSIDERED BUT DECLINED">
          {declined.slice(0, 3).map((a, i) => (
            <div key={i} style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.55, marginTop: 4 }}>
              {a.when ? <span style={{ fontWeight: 700 }}>{a.when} — </span> : null}{a.text}
            </div>
          ))}
        </Sub>
      )}
    </>
  );
}

function TeamCard({ side, data, section }) {
  const accent = teamAccent(side);
  if (!data) return null;
  return (
    <div style={{ padding: S.lg, borderRadius: R.lg, background: T.bgCard, border: `1px solid ${T.border}`, borderTop: `3px solid ${accent}`, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: accent }}>TEAM {side === "blue" ? "BLUE" : "GOLD"}</div>
      <div style={{ fontSize: 17, fontWeight: 900, fontFamily: FONT.display, color: T.text, marginBottom: 4 }}>{data.coach ?? "—"}</div>
      {section === "offense" && <OffensePanel data={data} side={side} />}
      {section === "defense" && <DefensePanel data={data} />}
      {section === "adjustments" && <AdjustmentsPanel data={data} />}
    </div>
  );
}

export default function CoachingStrategy({ coaching, eraLabel, eraImpact }) {
  const [section, setSection] = useState("offense");
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
      {(eraLabel || eraImpact) && (
        <div style={{ fontSize: 12.5, color: T.textDim, marginBottom: 8, lineHeight: 1.55 }}>
          {eraImpact || `Played in the ${eraLabel} Era Style.`}
        </div>
      )}
      <div role="tablist" aria-label="Coaching sections" className="coaching-sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section === id} onClick={() => setSection(id)} style={{
            minHeight: 42, padding: "0 14px", borderRadius: R.sm, cursor: "pointer",
            fontWeight: 800, fontSize: 12.5,
            border: `1px solid ${section === id ? T.goldBorder : T.border}`,
            background: section === id ? T.goldSoft : "transparent",
            color: section === id ? T.gold : T.textDim,
          }}>{label}</button>
        ))}
      </div>
      <div className="coaching-grid" style={{ marginTop: 10 }}>
        <TeamCard side="gold" data={coaching.gold} section={section} />
        <TeamCard side="blue" data={coaching.blue} section={section} />
      </div>
    </div>
  );
}
