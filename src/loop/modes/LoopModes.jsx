import React, { useCallback, useEffect, useState } from 'react';
import { loopApi } from '../client.js';
import DailyMode from '../daily/DailyMode.jsx';
const FranchiseMode = React.lazy(() => import('./FranchiseMode.jsx'));
import '../components/loop.css';
import { loopEvent } from '../events.js';
import { newYorkDay, nextNewYorkMidnight } from '../daily/clock.js';

function deferredMode(load, message) {
  const Mode = React.lazy(load);
  return function DeferredMode(props) {
    return <React.Suspense fallback={<p role="status" aria-busy="true">{message}</p>}><Mode {...props} /></React.Suspense>;
  };
}
const TeamModes = deferredMode(() => import("./TeamModes.jsx"), "Loading the team builder…");
const SpinMode = deferredMode(() => import("./SpinMode.jsx"), "Loading Chaos Spin…");
const GauntletMode = deferredMode(() => import("./GauntletMode.jsx"), "Loading the Gauntlet…");

export const LOOP_MODE_LINKS = Object.freeze([
  { title: 'Chaos Clash', href: '/play/chaos', copy: 'Three player-and-coach rolls, an era reveal, and the game.', tag: 'CHAOS' },
  { title: 'Clash Any Five', href: '/clash/any-five', copy: 'Choose five people whose cards cover the five positions.', tag: 'ANY_FIVE' },
  { title: 'Daily Clash', href: '/clash/daily', copy: 'One shared draft each New York day. One completed attempt.', tag: 'DAILY' },
  { title: 'Franchise Clash', href: '/clash/franchise', copy: 'Play curated all-time franchise fives or Tonight’s Clash.', tag: 'FRANCHISE' },
  { title: 'Tonight’s Clash', href: '/clash/tonight', copy: 'Load a pairing from the sourced schedule and play the all-time fives.', tag: 'TONIGHT' },
  { title: 'Chaos Spin', href: '/clash/spin', copy: 'Random franchise-and-era picks, with one skip of each kind.', tag: 'SPIN' },
  { title: 'Constraint filters', href: '/clash/filters', copy: 'One Franchise, One Per Era, or No MVPs.', tag: 'FILTERS' },
  { title: 'Era Gauntlet', href: '/clash/gauntlet', copy: 'Keep one team and survive seven era opponents.', tag: 'GAUNTLET' },
  { title: 'What-If Lab', href: '/clash/lab', copy: 'Explore an imagined move under existing rules environments.', tag: 'LAB' },
  { title: 'Private rooms', href: '/clash/rooms', copy: 'Invite friends to a server-owned room and Challenge feed.', tag: 'ROOMS' },
  { title: 'Challenges', href: '/challenges', copy: 'Play the same draft contract as another human.', tag: 'CHALLENGE' },
  { title: 'Dream Clash', href: '/play/dream', copy: 'Use the full existing team builder with coaches and era choice.', tag: 'DREAM' },
  { title: 'Best of 7', href: '/play/best-of-7', copy: 'See an existing matchup unfold across a seven-game series.', tag: 'SERIES' },
  { title: 'Win 82', href: '/play/win-82', copy: 'Play an existing simulated 82-game schedule.', tag: 'SEASON' },
  { title: 'Tournament', href: '/play/tournament', copy: 'Enter the existing eight-team simulation bracket.', tag: 'TOURNAMENT' },
  { title: 'EraClash Fantasy', href: '/fantasy/eraclash', copy: 'See the existing simulated fantasy format and availability.', tag: 'FORMAT INFO' },
  { title: 'EraClash Live', href: '/fantasy/live', copy: 'See the existing real-game fantasy proposal and availability.', tag: 'FORMAT INFO' },
]);
export function loopModeFromPath(route) { const path = typeof route === 'string' ? route : route?.path || route?.pathname || '/clash/modes'; return path.replace(/\/$/, '').split('/')[2] || 'modes'; }
function Link({ href, onNavigate, children, className }) { return <a href={href} className={className} onClick={event => { if (onNavigate && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); onNavigate(href); } }}>{children}</a>; }
function ModesHub({ onNavigate }) { return <><h1>Find your next Clash</h1><p className="loop-intro">Pick a five, roll a constraint, or come back for the Daily. They tell you the record. EraClash shows you the game.</p><div className="loop-grid">{LOOP_MODE_LINKS.map(mode => <article key={mode.href} className="loop-mode-card"><p className="loop-eyebrow">{mode.tag}</p><h2>{mode.title}</h2><p>{mode.copy}</p><Link href={mode.href} onNavigate={onNavigate}>{mode.tag === 'FORMAT INFO' ? 'View format' : `Open ${mode.title}`} →</Link></article>)}</div></>; }
function FiltersHub({ onNavigate }) { return <><h1>Choose a constraint</h1><p>Every variant keeps the existing possession simulation. Each has a separate tag; casual results do not create competitive human rating.</p><div className="loop-grid">{[{ key: 'one-franchise', title: 'One Franchise', copy: 'Five cards from one documented franchise pool.' }, { key: 'one-per-era', title: 'One Per Era', copy: 'Five people, five different decades.' }, { key: 'no-mvps', title: 'No MVPs', copy: 'Exclude everyone with an MVP credited on any current card.' }].map(filter => <article className="loop-mode-card" key={filter.key}><h2>{filter.title}</h2><p>{filter.copy}</p><Link href={`/clash/${filter.key}`} onNavigate={onNavigate}>Play {filter.title} →</Link></article>)}<article className="loop-mode-card"><h2>Salary Cap</h2><p>A defensible, comparable salary dataset is not present. This mode is unavailable until sourced salary and normalization contracts exist.</p><span className="loop-fine">Data required · no fabricated prices</span></article></div></>; }
export function LoopModes({ route, user, onResult, onNavigate, api = loopApi }) {
  const mode = loopModeFromPath(route), [config, setConfig] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [calendarDay, setCalendarDay] = useState(newYorkDay);
  const signedIn = !!(user?.signedIn || user?.session?.userId || user?.userId || user?.id);
  const trackedApi = useCallback(body => {
    if (['play', 'daily-play', 'gauntlet-play'].includes(body.op)) {
      const eventMode = body.mode || mode;
      if (!signedIn) loopEvent('guest_play_started', { mode: eventMode, source: 'direct' });
      if (body.op === 'daily-play') loopEvent('daily_attempted', { mode: 'daily' });
    }
    return api(body);
  }, [api, mode, signedIn]);
  useEffect(() => { if (!['modes', 'filters'].includes(mode)) loopEvent('mode_started', { mode }); }, [mode]);
  useEffect(() => {
    const refreshDay = () => setCalendarDay(newYorkDay());
    const timeout = setTimeout(refreshDay, Math.max(1, new Date(nextNewYorkMidnight()).getTime() - Date.now() + 20));
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    return () => { clearTimeout(timeout); window.removeEventListener('focus', refreshDay); document.removeEventListener('visibilitychange', refreshDay); };
  }, [calendarDay]);
  useEffect(() => {
    if (['modes', 'filters'].includes(mode)) return;
    let alive = true; setError('');
    // A Daily date transition starts a new draft. Refreshing its default-opponent
    // data must not discard a guest's in-progress five in another mode.
    if (mode === 'daily') setConfig(null);
    api({ op: 'config' }).then(data => { if (alive) setConfig(data.config || data); }).catch(failure => { if (alive) setError(failure?.message || 'The mode configuration is unavailable.'); });
    return () => { alive = false; };
  }, [mode, api, retry, calendarDay]);
  let content;
  if (mode === 'modes') content = <ModesHub onNavigate={onNavigate} />;
  else if (mode === 'filters') content = <FiltersHub onNavigate={onNavigate} />;
  else if (!config) content = error ? <><h1>Mode configuration unavailable</h1><p className="loop-error" role="alert">{error}</p><button type="button" className="loop-primary" onClick={() => setRetry(value => value + 1)}>Retry configuration</button></> : <p role="status">Loading the server’s mode configuration…</p>;
  else if (['any-five', 'one-franchise', 'one-per-era', 'no-mvps', 'lab'].includes(mode)) content = <TeamModes key={mode} kind={mode} api={trackedApi} config={config} onResult={onResult} />;
  else if (mode === 'spin') content = <SpinMode api={trackedApi} config={config} onResult={onResult} />;
  else if (mode === 'daily') content = <DailyMode api={trackedApi} config={config} user={user} onResult={onResult} />;
  else if (mode === 'gauntlet') content = <GauntletMode api={trackedApi} user={user} onResult={onResult} />;
  else if (['franchise', 'all-time', 'tonight'].includes(mode)) content = <React.Suspense fallback={<p role="status">Loading the franchise matchup…</p>}><FranchiseMode key={mode} api={trackedApi} route={route} onResult={onResult} /></React.Suspense>;
  else content = <><h1>That mode is not available here</h1><p>Choose a mode from the hub to continue.</p></>;
  return <main className="loop-court" data-testid="loop-court"><div className="loop-top"><p className="loop-eyebrow">EraClash Basketball · Light Court</p><Link href="/clash/modes" onNavigate={onNavigate} className="loop-header-link">Modes hub</Link></div>{error && config && <div className="loop-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry configuration</button></div>}{content}</main>;
}
export default LoopModes;
