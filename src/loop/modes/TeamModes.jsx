import React, { useEffect, useMemo, useState } from 'react';
import { getEra, ERA_STYLES } from '../../v3/eraStyles.js';
import { COACHES } from '../../v3/coaches.js';
import FiveBuilder from '../components/FiveBuilder.jsx';
import ResultSummary from '../components/ResultSummary.jsx';
import useLoopAction from '../components/useLoopAction.js';
import PublicRecapNotice from '../components/PublicRecapNotice.jsx';
import { leagueCopy } from '../rights.js';
import { franchiseLabel } from '../components/franchiseLabel.js';
import { FRANCHISES, getFranchise } from '../franchises.js';
import { assignFive, validateFive, MODE_TAGS, BY_ID, legalFive } from '../draft/model.js';

const emptyFive = () => Array(5).fill(null);
const labels = { 'any-five': 'Clash Any Five', 'one-franchise': 'One Franchise', 'one-per-era': 'One Per Era', 'no-mvps': 'No MVPs', lab: 'What-If Lab' };
export default function TeamModes({ kind = 'any-five', api, config, onResult }) {
  const [ids, setIds] = useState(emptyFive), [franchise, setFranchise] = useState('la-lakers'), [opponent, setOpponent] = useState('daily'), [opponentFranchise, setOpponentFranchise] = useState('boston'), [eraId, setEraId] = useState('2020s'), [coachId, setCoachId] = useState('neutral'), [record, setRecord] = useState(null), [scenarioPlayer, setScenarioPlayer] = useState(0), [scenarioTeam, setScenarioTeam] = useState('');
  const { act, busy, error, setError } = useLoopAction(api);
  const [rematchIds, setRematchIds] = useState(null), [rematchError, setRematchError] = useState('');
  useEffect(() => {
    const shareId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('rematch') : null;
    if (!shareId || kind !== 'any-five') return;
    let alive = true;
    fetch(`/api/result?id=${encodeURIComponent(shareId)}`).then(async response => { if (!response.ok) throw new Error('That public recap is unavailable. Choose another opponent to keep playing.'); return response.json(); }).then(snapshot => {
      if (!validateFive(snapshot.teamIds).ok) throw new Error('The public recap has no playable five. Choose another opponent.');
      if (alive) { setRematchIds(snapshot.teamIds); setOpponent('rematch'); }
    }).catch(failure => { if (alive) setRematchError(failure.message); });
    return () => { alive = false; };
  }, [kind]);
  const playableFranchises = useMemo(() => FRANCHISES.filter(f => !!legalFive({ franchise: f.id, seed: 'franchise-coverage' })), []);
  const placement = assignFive(ids), submittedIds = ['any-five', 'lab'].includes(kind) ? placement || ids : ids;
  const validation = validateFive(submittedIds, { kind, franchise, allowOutOfPosition: false });
  const daily = config?.daily || config || {};
  const run = async event => {
    event.preventDefault(); if (!validation.ok) { setError(validation.error); return; }
    const blueIds = opponent === 'rematch' ? rematchIds : opponent === 'daily' ? daily.opponentIds : opponent === 'franchise' ? getFranchise(opponentFranchise)?.playerIds : legalFive({ seed: `opponent-${Date.now()}` });
    if (!blueIds?.length) { setError('The opponent configuration is unavailable. Retry the server configuration.'); return; }
    const body = { op: 'play', mode: kind, goldIds: submittedIds, blueIds, eraId: kind === 'lab' ? eraId : daily.eraId || '2020s', coachGoldId: coachId, coachBlueId: 'neutral', ...(kind === 'one-franchise' ? { franchise } : {}), constraint: kind === 'one-franchise' ? { kind, franchise } : { kind }, ...(kind === 'lab' ? { scenario: { playerId: ids[scenarioPlayer], teamLabel: scenarioTeam.trim().slice(0, 60), eraId } } : {}) };
    await act(body, data => { setRecord(data); onResult?.(data, { mode: kind }); });
  };
  return <>
    <div className="loop-intro"><h1>{labels[kind]}</h1><p>{kind === 'lab' ? 'Explore a five under another existing era’s rules. A team move changes the scenario label; no invented team bonus is added.' : kind === 'one-franchise' ? 'Build a five from one documented franchise pool.' : kind === 'one-per-era' ? 'Build five different people from five different decades.' : kind === 'no-mvps' ? 'Build without anyone credited with an MVP on the current roster.' : 'Pick five people, choose their decade cards, and see the possessions decide it.'}</p></div>
    {kind === 'lab' && <p className="loop-notice">Exploration · excluded from leaderboards. Era rules affect the game through the existing simulation. Team labels do not change a player’s capabilities.</p>}
    {rematchIds && <p className="loop-notice">Run it back against the shared five: {rematchIds.map(id => BY_ID.get(id)?.name).join(', ')}. Build your own five below; guest play is open.</p>}
    {rematchError && <p className="loop-error" role="status">{rematchError}</p>}
    <form className="loop-form" onSubmit={run}>
      {kind === 'one-franchise' && <label>Franchise<select aria-label="Franchise" value={franchise} onChange={event => { setFranchise(event.target.value); setIds(emptyFive()); }}>{playableFranchises.map(f => <option key={f.id} value={f.id}>{franchiseLabel(f.id)}</option>)}</select><span className="loop-fine">Membership uses the documented franchise catalog. Its conservative card pool does not claim every team in a player’s career.</span></label>}
      <FiveBuilder value={ids} onChange={setIds} kind={kind} franchise={kind === 'one-franchise' ? franchise : ''} disabled={busy} />
      {ids.every(Boolean) && ['any-five', 'lab'].includes(kind) && <p className="loop-notice">{placement ? 'The five will be arranged into eligible PG / SG / SF / PF / C positions automatically.' : 'This five cannot cover PG / SG / SF / PF / C. Each position needs a player eligible at that position. Choose a different combination to play.'}</p>}
      <div className="loop-toolbar"><label>Opponent<select aria-label="Opponent" value={opponent} onChange={event => setOpponent(event.target.value)} disabled={busy}>{rematchIds && <option value="rematch">The shared five</option>}<option value="daily">Today’s Daily initial opponent</option><option value="random">Random all-era five</option><option value="franchise">All-time franchise cards</option></select></label>{opponent === 'franchise' && <label>Opponent franchise<select aria-label="Opponent franchise" value={opponentFranchise} onChange={event => setOpponentFranchise(event.target.value)} disabled={busy}>{playableFranchises.map(f => <option key={f.id} value={f.id}>{franchiseLabel(f.id)}</option>)}</select></label>}</div>
      {kind === 'lab' && <div className="loop-panel"><h2>Scenario</h2><div className="loop-toolbar"><label>Player to move<select aria-label="Player to move" value={scenarioPlayer} onChange={event => setScenarioPlayer(Number(event.target.value))}>{ids.map((id, i) => <option key={i} value={i}>{BY_ID.get(id)?.name || `Player ${i + 1}`}</option>)}</select></label><label>Imagined team label<input aria-label="Imagined team label" value={scenarioTeam} maxLength={60} onChange={event => setScenarioTeam(event.target.value)} placeholder="Optional scenario label" /></label><label>Rules environment<select aria-label="Rules environment" value={eraId} onChange={event => setEraId(event.target.value)}>{ERA_STYLES.map(e => <option key={e.id}>{e.id}</option>)}</select></label></div><p>{leagueCopy(getEra(eraId)?.styleSummary?.[0])}</p><p className="loop-fine">Only the simulation’s existing eight rules environments are available. Player-decade statistics remain unchanged.</p></div>}
      <details><summary>Take control of coaching</summary><label>Your coach<select aria-label="Your coach" value={coachId} onChange={event => setCoachId(event.target.value)} disabled={busy}><option value="neutral">League-Average Staff · automatic default</option>{COACHES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><p className="loop-fine">Coaching changes the game plan through the existing engine; it does not add a flat power bonus.</p></details>
      {error && <p role="alert" className="loop-error">{error}</p>}
      <PublicRecapNotice />
      <div className="loop-actions"><button type="submit" className="loop-primary" disabled={busy || !validation.ok}>{busy ? 'Running the matchup…' : 'Run this five'}</button><span className="loop-fine">{kind === 'lab' ? 'Exploration' : MODE_TAGS[kind]} · guest play · sign in only to save</span></div>
      {!validation.ok && ids.every(Boolean) && <p role="status" className="loop-error">{validation.error}</p>}
    </form>
    <ResultSummary record={record} tag={MODE_TAGS[kind]} onOpen={data => onResult?.(data, { mode: kind })} />
  </>;
}
