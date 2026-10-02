import { useState } from 'react';
import ClashBreakdown from '../components/breakdown/ClashBreakdown.jsx';
import { T, card } from '../theme.js';
import { loopEvent } from './events.js';
import { leagueCopy } from './rights.js';
const action = { minHeight: 44, padding: '12px 18px', borderRadius: 8, border: `1px solid ${T.goldBorder}`, background: T.gold, color: T.onGold, cursor: 'pointer', fontWeight: 800 };
export default function LoopResult({ record, url, mode, onSave, onPublish, roomStatus, signedIn }) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  if (!record?.core) return null;
  const final = record.core.finalScore;
  const box = record.v3?.fullBox;
  return <section aria-label="Completed Clash" style={{ ...card, maxWidth: 1100, margin: '24px auto', padding: 20, scrollMarginTop: 72 }}>
    <h2>{mode === 'any-five' ? 'Entered team' : record.loop?.tag || 'Clash'} · {final?.gold}–{final?.blue}</h2>
    {record.loop?.gauntlet ? <p>{record.loop.gauntlet.victories} of7 eras survived{record.loop.gauntlet.finished ? ' · completed run' : ' · run in progress'}</p> : null}
    <p>{leagueCopy(record.core.headline || record.story?.headline || 'A completed possession simulation.')}</p>
    <p>{record.candidate ? `${record.candidate.candidateId} · calibration ${record.candidate.possessionCalibrationVersion}` : 'Current production engine'} · {record.eraId}</p>
    <p>They tell you the record. EraClash shows you the game.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {url ? <><a href={url} style={{ ...action, textDecoration: 'none' }}>Open result card</a><button style={action} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setShareError(''); loopEvent('card_shared', { mode, channel: 'copy' }); if (mode === 'daily') loopEvent('daily_shared', { mode, channel: 'copy' }); } catch { setCopied(false); setShareError('Copy is unavailable in this browser. Open the result card and copy its address.'); } }}>{copied ? 'Link copied' : 'Copy card link'}</button></> : <button disabled={sharing} style={action} onClick={async () => { setSharing(true); setShareError(''); try { if (!await onPublish?.(record)) setShareError('Sharing is unavailable. Your completed game is preserved; try again shortly.'); } finally { setSharing(false); } }}>{sharing ? 'Preparing card…' : 'Create result card'}</button>}
      {signedIn && onSave ? <button style={action} onClick={() => onSave(record.id)}>Save to My EraClash</button> : <a href="/my-eraclash" style={{ ...action, textDecoration: 'none', background: T.bgCard, color: T.text }}>Sign in to save</a>}
      <a href="/clash/any-five" style={{ ...action, textDecoration: 'none', background: T.bgCard, color: T.text }}>Run it back with your five</a>
    </div>
    {shareError ? <p role="alert">{shareError}</p> : null}
    {roomStatus ? <p role="status">{roomStatus}</p> : null}
    <ClashBreakdown result={record} surface="loop" />
    {box ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 20, marginTop: 20 }}>{['gold', 'blue'].map(side => <div key={side}><h3 style={{ color: side === 'blue' ? T.blue : T.gold }}>Team {side === 'gold' ? 'Gold' : 'Blue'}</h3><table style={{ width: '100%', textAlign: 'left' }}><caption className="sr-only">{side} player statistics</caption><thead><tr><th scope="col">Player</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th></tr></thead><tbody>{box[side]?.map(p => <tr key={p.id}><th scope="row" style={{ fontWeight: 600 }}>{p.name}</th><td>{p.pts}</td><td>{(p.oreb || 0) + (p.dreb || 0)}</td><td>{p.ast}</td></tr>)}</tbody></table></div>)}</div> : null}
    <p><a href="/privacy" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 6px' }}>Privacy</a> · <a href="/terms" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 6px' }}>Terms</a></p>
  </section>;
}
