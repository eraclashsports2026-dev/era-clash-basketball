import React, { useEffect, useState } from 'react';
import { POSITIONS } from '../../players.js';
import ResultSummary from '../components/ResultSummary.jsx';
import useLoopAction from '../components/useLoopAction.js';
import PublicRecapNotice from '../components/PublicRecapNotice.jsx';
import { BY_ID } from '../draft/model.js';
import { newYorkDay } from './calendar.js';
import { readHint, writeHint, userScope } from './storage.js';
import { loopEvent } from '../events.js';
import { teamDisplayName, leagueCopy } from '../rights.js';

const displayDay = day => { const [y, m, d] = String(day || '').split('-'); return y && m && d ? `${m}-${d}-${y}` : day; };
const countdown = (reset, now) => { const seconds = Math.max(0, Math.floor((new Date(reset).getTime() - now) / 1000)); if (!Number.isFinite(seconds)) return ''; return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`; };
export default function DailyMode({ api, config, user, onResult }) {
  const dailyConfig = config?.daily || config || {}, day = dailyConfig.day || newYorkDay(), scope = userScope(user);
  const [draft, setDraft] = useState(null), [token, setToken] = useState(null), [held, setHeld] = useState([]), [coachHeld, setCoachHeld] = useState([]), [record, setRecord] = useState(null), [now, setNow] = useState(Date.now()), [copied, setCopied] = useState('');
  const { act, busy, error } = useLoopAction(api);
  const [cardUrl, setCardUrl] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setDraft(null); setToken(null); setHeld([]); setCoachHeld([]); setRecord(null); setCardUrl(''); setCopied(''); }, [day, scope]);
  const accept = data => {
    const state = data.state || data.run || data.view;
    if (state) { setDraft(state); setHeld(state.gold?.heldSlots || []); setCoachHeld(state.coachDraft?.heldRoles || []); }
    const nextToken = data.dailyToken || token;
    if (nextToken) { setToken(nextToken); writeHint('daily', scope, day, { dailyToken: nextToken, day }); }
    if (data.result) { setRecord(data); Promise.resolve(onResult?.(data, { mode: 'daily' })).then(url => { if (typeof url === 'string') setCardUrl(url); }).catch(() => {}); }
  };
  const start = () => act({ op: 'daily-start', dailyToken: readHint('daily', scope, day)?.dailyToken || undefined }, accept);
  const toggle = (value, setter) => setter(previous => previous.includes(value) ? previous.filter(x => x !== value) : [...previous, value]);
  const phase = draft?.phase, rolling = ['ROLL_1_REVEALED', 'ROLL_2_REVEALED'].includes(phase), selecting = phase === 'ROLL_3_REVEALED' || phase === 'COACH_SELECTION', ready = phase === 'READY';
  const roster = (draft?.gold?.roster || draft?.rosterIds || []).map(p => typeof p === 'string' ? BY_ID.get(p) : p);
  const offers = draft?.coachDraft?.offers || draft?.coachOffers || [];
  const resultWinner = record?.result?.core?.winner;
  const grid = resultWinner ? `⬜⬜⬜${resultWinner === 'Gold' ? '🟨' : '🟦'}` : '';
  const sampleCount = record?.daily?.sample ?? dailyConfig.sampleCount;
  const winPercent = record?.daily?.winPercent ?? (Number.isFinite(Number(dailyConfig.winRate)) ? Number(dailyConfig.winRate) * 100 : null);
  const streak = record?.streak?.account ? record.streak.count : dailyConfig.streak;
  return <><h1>Daily Clash</h1><p>One shared challenge. Three synchronized player-and-coach rolls, then the era reveal and the game. Everyone starts with the same draft.</p>
    <p className="loop-notice">DAILY · {displayDay(day)} · resets at midnight in New York{dailyConfig.nextResetAt && ` · ${countdown(dailyConfig.nextResetAt, now)} to go`}</p>
    {!draft && !record && <div className="loop-actions"><button type="button" className="loop-primary" disabled={busy} onClick={start}>{busy ? 'Loading today’s draft…' : 'Open today’s draft'}</button><span className="loop-fine">One completed attempt per server identity per day. Browser storage only helps you resume.</span></div>}
    {draft && <section className="loop-panel"><div className="loop-top"><h2>{ready ? 'The era is revealed' : selecting ? 'Hire your coach' : `Roll ${draft.roll || 1} of ${draft.totalRolls || 3}`}</h2><span className="loop-eyebrow">{draft.status || 'ACTIVE'}</span></div>
      <ul className="loop-roster">{roster.map((p, index) => p && <li key={POSITIONS[index]}><span><strong>{POSITIONS[index]} · {p.name}</strong><small>{p.decade} · {teamDisplayName(p.team, p.decade)}</small></span>{rolling && <button type="button" className="loop-hold" aria-pressed={held.includes(POSITIONS[index])} disabled={busy} onClick={() => toggle(POSITIONS[index], setHeld)}>{held.includes(POSITIONS[index]) ? 'Held' : 'Hold'}</button>}</li>)}</ul>
      {offers.length > 0 && <><h2>Coach board</h2><div className="loop-coaches">{offers.map(offer => offer && <div key={offer.coachId || offer.role} className="loop-panel loop-coach"><strong>{offer.name}</strong><small>{String(offer.role || '').replaceAll('_', ' ')}</small>{rolling && <button type="button" className="loop-hold" aria-pressed={coachHeld.includes(offer.role)} disabled={busy} onClick={() => toggle(offer.role, setCoachHeld)}>{coachHeld.includes(offer.role) ? 'Coach held' : 'Hold coach'}</button>}{selecting && <button type="button" className="loop-primary" disabled={busy} onClick={() => act({ op: 'daily-roll', dailyToken: token, coachId: offer.coachId || offer.id }, accept)}>Hire {offer.name}</button>}</div>)}</div></>}
      {rolling && <div className="loop-actions"><button type="button" className="loop-primary" disabled={busy} onClick={() => act({ op: 'daily-roll', dailyToken: token, holdSlots: held, holdRoles: coachHeld }, accept)}>{busy ? 'Committing the roll…' : `Roll ${Number(draft.roll || 1) + 1} · keep held picks`}</button><p className="loop-fine">Player holds and coach holds are submitted together. Unheld cards are rerolled by the server.</p></div>}
      {ready && <><p className="loop-notice">{draft.era?.eraId || draft.eraState?.eraStyleId || draft.eraContext?.eraId} · {leagueCopy(draft.era?.threePoint || draft.eraContext?.highlights?.[0])}</p><ul>{(draft.eraContext?.highlights || []).slice(1).map(fact => <li key={fact}>{leagueCopy(fact)}</li>)}</ul>{!record && <><PublicRecapNotice /><button type="button" className="loop-primary" disabled={busy} onClick={() => act({ op: 'daily-play', dailyToken: token }, accept)}>{busy ? 'Running the Daily…' : 'Play today’s Daily'}</button></>}</>}
      {phase === 'SIMULATED' && !record && <p role="status">This Daily is complete. Reopen today’s draft to retrieve its result.</p>}
    </section>}
    {error && <p role="alert" className="loop-error">{error}</p>}
    <ResultSummary record={record} tag="DAILY" onOpen={data => onResult?.(data, { mode: 'daily' })}>{grid && <><p aria-label={resultWinner === 'Gold' ? 'Daily win grid' : 'Daily loss grid'} className="loop-share-grid">{grid}</p><button type="button" className="loop-secondary" disabled={!cardUrl} onClick={async () => { try { await navigator.clipboard.writeText(`EraClash Daily ${displayDay(day)}\n${grid}\nThey tell you the record. EraClash shows you the game.\n${cardUrl}`); setCopied('Daily grid copied.'); loopEvent('daily_shared', { mode: 'daily', channel: 'copy' }); loopEvent('card_shared', { mode: 'daily', channel: 'copy' }); } catch { setCopied('Copy is unavailable in this browser. Select the grid above to copy it.'); } }}>Copy Daily grid</button><span role="status">{copied || (!cardUrl ? 'Open the result card below to publish its share link.' : '')}</span></>}</ResultSummary>
    {grid && <p className="loop-fine">Grid: three completed draft rolls, then yellow for your win or blue for the opponent’s win.</p>}
    {Number(sampleCount) >= Number(dailyConfig.minimumSample || 20) && winPercent !== null && Number.isFinite(Number(winPercent)) && <p>Today’s win rate: {Math.round(Number(winPercent))}% from {sampleCount} completed attempts.</p>}
    {typeof streak === 'number' && scope !== 'guest' ? <p>Your saved Daily streak: {streak}</p> : <p className="loop-fine">Account streaks require a working account provider and server persistence. A local draft is never presented as a saved streak.</p>}
  </>;
}
