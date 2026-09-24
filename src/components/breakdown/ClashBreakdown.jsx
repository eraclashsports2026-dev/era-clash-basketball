// ── CLASH BREAKDOWN — the completed result, explained descriptively ───────────
// Progressive disclosure under the final score (and, for a Challenge
// recipient, under the comparison): a compact entry with the single largest
// recorded difference, one control to open the rest. Opened: the largest
// statistical differences (up to three, fewer when fewer qualify), the team
// comparison behind one more control, key performances from both teams, and
// period-by-period game flow. Everything shown is computed by the pure
// engine (src/breakdown/engine.js) from the completed result; this component
// only lays it out. Nothing here claims what caused the result.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buildBreakdown } from "../../breakdown/engine.js";
import { SECTION_TITLE, DESCRIPTIVE_NOTE, BREAKDOWN_EVENTS, CLASH_BREAKDOWN_VERSION } from "../../breakdown/contract.js";
import { track } from "../../analytics.js";

const TEAM = { gold: "Gold", blue: "Blue" };
const DIRECTION_NOTE = { lower: "fewer is stronger", higher: null, neutral: "volume, not a verdict" };

export default function ClashBreakdown({ result, surface = "dock", defaultOpen = false }) {
  const breakdown = useMemo(() => buildBreakdown(result), [result]);
  const [open, setOpen] = useState(defaultOpen);
  const [compare, setCompare] = useState(false);
  const opened = useRef(false);
  const id = useId();
  useEffect(() => { setOpen(defaultOpen); setCompare(false); }, [breakdown.resultId, defaultOpen]);
  if (!breakdown.available) return null;
  const { keyDifferences: diffs, teamComparison, playerPerformances: perf, gameFlow: flow } = breakdown;
  const teaser = diffs.length ? diffs[0].summary : breakdown.balancedLine;

  const toggle = () => {
    const next = !open; setOpen(next);
    if (next && !opened.current) { opened.current = true; track(BREAKDOWN_EVENTS.OPENED, { breakdownVersion: CLASH_BREAKDOWN_VERSION, surface, insightCount: diffs.length, hasFlow: !!flow }); }
  };
  const toggleCompare = () => { const next = !compare; setCompare(next); if (next) track(BREAKDOWN_EVENTS.COMPARISON_OPENED, { breakdownVersion: CLASH_BREAKDOWN_VERSION, surface }); };

  return (
    <section className="ec-bd" data-surface={surface} data-open={open} aria-labelledby={`${id}-t`} data-breakdown-version={breakdown.breakdownVersion}>
      <div className="ec-bd-entry">
        <div className="ec-bd-entry-text">
          <h2 id={`${id}-t`} className="ec-bd-kicker">CLASH BREAKDOWN</h2>
          {!open && <p className="ec-bd-teaser">{teaser}</p>}
        </div>
        <button type="button" className="ec-bd-btn" aria-expanded={open} aria-controls={`${id}-body`} onClick={toggle}>{open ? "CLOSE" : "OPEN BREAKDOWN"}</button>
      </div>

      {open && (
        <div id={`${id}-body`} className="ec-bd-body">
          <div className="ec-bd-block" data-block="differences">
            <h3 className="ec-bd-h">{SECTION_TITLE}</h3>
            <p className="ec-bd-note">{DESCRIPTIVE_NOTE}</p>
            {diffs.length === 0 ? <p className="ec-bd-balanced">{breakdown.balancedLine}</p> : (
              <ol className="ec-bd-diffs">
                {diffs.map((d) => (
                  <li key={d.id} className="ec-bd-diff" data-insight={d.id} data-favours={d.favours}>
                    <div className="ec-bd-diff-title">{d.title}</div>
                    <div className="ec-bd-diff-values">{d.values}</div>
                    <div className="ec-bd-diff-summary">{d.summary}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="ec-bd-block" data-block="comparison">
            <button type="button" className="ec-bd-btn ec-bd-btn--quiet" aria-expanded={compare} aria-controls={`${id}-cmp`} onClick={toggleCompare}>{compare ? "HIDE TEAM COMPARISON" : "TEAM COMPARISON"}</button>
            {compare && (
              <div id={`${id}-cmp`} className="ec-bd-cmp" role="table" aria-label="Team comparison">
                <div className="ec-bd-cmp-row ec-bd-cmp-head" role="row">
                  <span role="columnheader">STAT</span><span role="columnheader" className="ec-bd-gold">GOLD</span><span role="columnheader" className="ec-bd-blue">BLUE</span>
                </div>
                {teamComparison.map((m) => (
                  <div key={m.key} className="ec-bd-cmp-row" role="row" data-metric={m.key} data-stronger={m.stronger || "none"} data-direction={m.direction}>
                    <span role="rowheader" className="ec-bd-cmp-label">{m.label}{DIRECTION_NOTE[m.direction] && <small className="ec-bd-dir">{DIRECTION_NOTE[m.direction]}</small>}</span>
                    <span role="cell" className={m.stronger === "gold" ? "ec-bd-strong" : undefined}>{m.gold}{m.stronger === "gold" && <span className="ec-cr-sr"> (stronger)</span>}</span>
                    <span role="cell" className={m.stronger === "blue" ? "ec-bd-strong" : undefined}>{m.blue}{m.stronger === "blue" && <span className="ec-cr-sr"> (stronger)</span>}</span>
                  </div>
                ))}
                <p className="ec-bd-note">Bold marks the stronger figure where one direction is clearly better. Splits and possessions are not scored.</p>
              </div>
            )}
          </div>

          <div className="ec-bd-block" data-block="performances">
            <h3 className="ec-bd-h">Key performances</h3>
            <div className="ec-bd-perf-grid">
              {["gold", "blue"].map((side) => (
                <div key={side} className="ec-bd-perf-team" data-team={side}>
                  <div className={`ec-bd-team ec-bd-${side}`}>TEAM {TEAM[side].toUpperCase()}</div>
                  <ul className="ec-bd-perf-list">
                    {perf[side].map((p) => (
                      <li key={p.name} className="ec-bd-perf">
                        <div className="ec-bd-perf-label">{p.label}</div>
                        <div className="ec-bd-perf-name">{p.name}{p.pos ? <span className="ec-bd-pos"> · {p.pos}</span> : null}</div>
                        <div className="ec-bd-perf-line">{p.stats}</div>
                        <div className="ec-bd-perf-shoot">{p.shooting}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {flow && (
            <div className="ec-bd-block" data-block="flow">
              <h3 className="ec-bd-h">Game flow</h3>
              <ol className="ec-bd-flow" aria-label="Score by period">
                {flow.periods.map((r, i) => (
                  <li key={r.label} className="ec-bd-flow-row" data-leader={r.leader}>
                    <span className="ec-bd-flow-p">{r.label}{i === flow.periods.length - 1 ? " · FINAL" : i === 1 ? " · HALF" : ""}</span>
                    <span className="ec-bd-flow-q">{r.gold}–{r.blue}</span>
                    <span className="ec-bd-flow-t">Gold {r.goldTotal} – Blue {r.blueTotal}</span>
                  </li>
                ))}
              </ol>
              <ul className="ec-bd-facts">{flow.facts.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
          <p className="ec-bd-foot">Breakdown {breakdown.breakdownVersion} · from this Clash's recorded box score. Lead changes, runs and bench scoring are not recorded yet.</p>
        </div>
      )}
    </section>
  );
}
