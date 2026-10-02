import React, { useEffect, useState } from 'react';
import FiveBuilder from '../components/FiveBuilder.jsx';
import ResultSummary from '../components/ResultSummary.jsx';
import useLoopAction from '../components/useLoopAction.js';
import PublicRecapNotice from '../components/PublicRecapNotice.jsx';
import { assignFive, validateFive, GAUNTLET_ERAS, BY_ID } from '../draft/model.js';
import { readHint, writeHint, userScope } from '../daily/storage.js';

export default function GauntletMode({ api, user, onResult }) {
  const scope = userScope(user), [ids, setIds] = useState(Array(5).fill(null)), [run, setRun] = useState(null), [record, setRecord] = useState(null);
  const { act, busy, error } = useLoopAction(api);
  const hint = readHint('gauntlet', scope, 'active');
  useEffect(() => { setRun(null); setRecord(null); setIds(Array(5).fill(null)); }, [scope]);
  const accept = data => {
    const next = data.gauntlet || data.state || (data.gauntletToken ? data : null);
    if (next) { const merged = { ...next, gauntletToken: data.gauntletToken || next.gauntletToken || run?.gauntletToken }; setRun(merged); if (next.goldIds) setIds(next.goldIds); writeHint('gauntlet', scope, 'active', { gauntletToken: merged.gauntletToken }); }
    if (data.result) { setRecord(data); onResult?.(data, { mode: 'gauntlet', stayInMode: true, continueRoute: '/clash/gauntlet' }); }
  };
  const validation = validateFive(ids, { kind: 'gauntlet' });
  const start = () => { setRecord(null); return act({ op: 'gauntlet-start', goldIds: assignFive(ids) || ids }, accept); };
  const eras = run?.eraIds || GAUNTLET_ERAS, stage = Number(run?.stage ?? 0), survived = Number(run?.victories ?? run?.survived ?? run?.wins ?? (run?.won ? stage : Math.max(0, stage - (run?.done ? 1 : 0))));
  return <><h1>Era Gauntlet</h1><p>Lock one five. Face seven era opponents in order, from the 1960s through the 2020s. Each win opens the next game; a loss ends the run.</p><p className="loop-fine">The 1950s roster is intentionally limited to the anniversary selection. This seven-stage contract starts in the 1960s.</p>
    {!run ? <><FiveBuilder kind="gauntlet" value={ids} onChange={setIds} disabled={busy} /><div className="loop-actions"><button type="button" className="loop-primary" disabled={busy || !validation.ok} onClick={start}>{busy ? 'Locking the five…' : 'Start the Gauntlet'}</button>{hint?.gauntletToken && <button type="button" className="loop-secondary" disabled={busy} onClick={() => act({ op: 'gauntlet-start', gauntletToken: hint.gauntletToken }, accept)}>Resume saved Gauntlet</button>}</div></> : <section className="loop-panel"><h2>{run.done ? `${survived} of 7 eras survived` : `Stage ${Math.min(stage + 1, 7)} of 7 · ${eras[stage] || eras.at(-1)}`}</h2><div className="loop-progress" aria-label="Gauntlet stages">{eras.map((era, index) => <span key={era} className={index < survived ? 'is-complete' : index === stage && !run.done ? 'is-current' : ''}>{era}{index < survived ? ' ✓' : ''}</span>)}</div><ul className="loop-roster">{ids.map((id, i) => <li key={id || i}><span><strong>{BY_ID.get(id)?.name || 'Locked player'}</strong><small>{BY_ID.get(id)?.decade}</small></span></li>)}</ul>
      {!run.done && <><PublicRecapNotice /><button type="button" className="loop-primary" disabled={busy} onClick={() => act({ op: 'gauntlet-play', gauntletToken: run.gauntletToken, stage: run.stage }, accept)}>{busy ? 'Running the era game…' : record ? 'Continue to the next era' : 'Play this era'}</button></>}
      {run.done && <button type="button" className="loop-secondary" disabled={busy} onClick={() => { setRun(null); setRecord(null); }}>Build a new Gauntlet five</button>}
      <p className="loop-fine">Progress is checked by the server. {scope === 'guest' ? 'This device can resume its server-owned run; sign in to save account progress when available.' : 'Account resume requires the configured account provider.'}</p>
    </section>}
    {error && <p role="alert" className="loop-error">{error}</p>}<ResultSummary record={record} tag="GAUNTLET" onOpen={data => onResult?.(data, { mode: 'gauntlet' })}>{run?.done && <p><strong>{survived} of 7 eras.</strong> The fixed five played every recorded stage.</p>}</ResultSummary>
  </>;
}
