import React from 'react';
const scoreOf = result => result?.core || result?.result?.core || {};
export default function ResultSummary({ record, tag, onOpen, children }) {
  if (!record?.result) return null;
  const core = scoreOf(record.result);
  const gold = core.finalScore?.gold ?? core.goldScore ?? core.scoreGold ?? core.gold?.score ?? record.result?.v3?.goldScore;
  const blue = core.finalScore?.blue ?? core.blueScore ?? core.scoreBlue ?? core.blue?.score ?? record.result?.v3?.blueScore;
  return <section className="loop-result" aria-live="polite" aria-label="Authoritative game result">
    <p className="loop-eyebrow">{record.loop?.tag || tag} · Server result</p>
    <h2>{Number.isFinite(Number(gold)) && Number.isFinite(Number(blue)) ? `Gold ${gold} — Blue ${blue}` : core.winner ? `${core.winner} wins` : 'Game complete'}</h2>
    <p>Ran this five through a real possession sim.</p>
    <p className="loop-fine">{record.records?.persisted ? 'Result saved by the server.' : 'Cloud persistence is unavailable for this result.'}</p>
    <button type="button" className="loop-primary" onClick={() => onOpen?.(record)}>Open result card & Breakdown</button>{children}
  </section>;
}
