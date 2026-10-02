import React, { useState } from 'react';
import FiveBuilder from '../components/FiveBuilder.jsx';
import ResultSummary from '../components/ResultSummary.jsx';
import useLoopAction from '../components/useLoopAction.js';
import PublicRecapNotice from '../components/PublicRecapNotice.jsx';
import { validateFive } from '../draft/model.js';
import { franchiseLabel } from '../components/franchiseLabel.js';
export default function SpinMode({ api, config, onResult }) {
  const [spin, setSpin] = useState(null), [ids, setIds] = useState(Array(5).fill(null)), [hiddenStats, setHiddenStats] = useState(false), [record, setRecord] = useState(null);
  const { act, busy, error } = useLoopAction(api);
  const acceptSpin = data => { const next = data.spin || data; setSpin(next); if (next.slots) setIds(old => old.map((id, i) => next.slots[i]?.poolIds?.includes(id) ? id : null)); };
  const validation = validateFive(ids, { kind: 'spin', slots: spin?.slots });
  const start = () => act({ op: 'spin-start', mode: 'spin' }, data => { setIds(Array(5).fill(null)); setRecord(null); acceptSpin(data); });
  const skip = (index, axis) => act({ op: 'spin-skip', spinReceipt: spin.spinReceipt, index, axis }, acceptSpin);
  const run = () => act({ op: 'play', mode: 'spin', goldIds: ids, spinReceipt: spin.spinReceipt, hiddenStats, eraId: config?.daily?.eraId || config?.eraId || '2020s' }, data => { setRecord(data); onResult?.(data, { mode: 'spin' }); });
  return <><h1>Chaos Spin</h1><p>Every position gets a random franchise and decade. Pick a real card from that pool; save your one franchise skip and one era skip for when they matter.</p><p className="loop-fine">Franchise pools use documented historical affiliations. Each decade belongs to the existing card; its statistics can cover more than one team.</p><label className="loop-check"><input type="checkbox" checked={hiddenStats} onChange={event => setHiddenStats(event.target.checked)} />Hidden stats · choose from basketball knowledge</label>
    {!spin ? <button type="button" className="loop-primary" disabled={busy} onClick={start}>{busy ? 'Spinning…' : 'Spin the draft'}</button> : <><p className="loop-notice">Franchise skips left: {spin.franchiseSkips ?? 1} · Era skips left: {spin.eraSkips ?? 1}. The server signs and enforces these constraints.</p><FiveBuilder value={ids} onChange={setIds} kind="spin" slots={spin.slots} hiddenStats={hiddenStats} disabled={busy} />
      <div className="loop-grid">{spin.slots?.map((slot, index) => <div key={slot.position} className="loop-panel"><strong>{slot.position}: {franchiseLabel(slot.franchise, slot.era)}</strong><div className="loop-skip-row"><button type="button" disabled={busy || (spin.franchiseSkips ?? 1) < 1} onClick={() => skip(index, 'franchise')}>Skip franchise for {slot.position}</button><button type="button" disabled={busy || (spin.eraSkips ?? 1) < 1} onClick={() => skip(index, 'era')}>Skip era for {slot.position}</button></div></div>)}</div>
      <PublicRecapNotice /><div className="loop-actions"><button type="button" className="loop-primary" disabled={busy || !validation.ok} onClick={run}>{busy ? 'Working…' : 'Run the Spin five'}</button><button type="button" disabled={busy} onClick={start}>Start a new Spin</button></div>{!validation.ok && ids.every(Boolean) && <p className="loop-error" role="status">{validation.error}</p>}</>}
    {error && <p role="alert" className="loop-error">{error}</p>}<ResultSummary record={record} tag="SPIN" onOpen={data => onResult?.(data, { mode: 'spin' })} />
  </>;
}
