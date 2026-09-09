// ── My EraClash → Overview → career progression ─────────────────────────────
// Phase 9D. A strong but restrained module: the level, the XP and the bar, then
// the career counts that progression recognises. It supplements the
// basketball history on the same page; it never replaces it, and it never
// shows a rank, a percentile or anyone else's numbers.
import { useEffect, useRef } from "react";
import { PROGRESSION_EVENTS } from "../../progression/contract.js";
import { formatXp } from "../../progression/client.js";
import { LevelBar } from "./CareerProgress.jsx";
import { track } from "../../analytics.js";

export default function ProgressionHero({ progression, displayName = "Coach", loading = false, onOpenAchievements }) {
  const seen = useRef(false);
  const ok = progression?.status === "ok";
  useEffect(() => {
    if (!ok || seen.current) return;
    seen.current = true;
    track(PROGRESSION_EVENTS.VIEWED, { level: progression.profile?.level });
    const r = progression.repaired;
    if (r && (r.awards > 0 || r.unlocks > 0)) track(PROGRESSION_EVENTS.RECONCILED, { xpDelta: Math.min(progression.delta?.xpDelta || 0, 99_999), unlockCount: r.unlocks, success: true });
  }, [ok, progression]);

  if (loading) return <section className="ec-prog-hero" aria-labelledby="ec-prog-hero-title"><h2 id="ec-prog-hero-title" className="ec-prog-hero-k">CAREER PROGRESSION</h2><p className="ec-prog-hero-muted">Loading your progression…</p></section>;
  if (!ok) return <section className="ec-prog-hero" aria-labelledby="ec-prog-hero-title"><h2 id="ec-prog-hero-title" className="ec-prog-hero-k">CAREER PROGRESSION</h2><p className="ec-prog-hero-muted">Your progression could not be loaded just now. It is safe on the server and will show on your next visit.</p></section>;

  const p = progression.profile, f = progression.facts || {}, s = progression.summary || { total: 0, unlocked: 0 };
  return (
    <section className="ec-prog-hero" aria-labelledby="ec-prog-hero-title" data-level={p.level}>
      <h2 id="ec-prog-hero-title" className="ec-prog-hero-k">CAREER PROGRESSION</h2>
      <div className="ec-prog-hero-top">
        <div className="ec-prog-hero-name">{displayName}</div>
        <div className="ec-prog-hero-level">{p.maxLevel ? "MAX LEVEL" : `LEVEL ${p.level}`}</div>
        <div className="ec-prog-hero-xp">{formatXp(p.totalXp)} XP</div>
      </div>
      <LevelBar level={p} compact />
      <dl className="ec-prog-hero-stats">
        <div><dt>CLASHES</dt><dd>{f.clashes ?? 0}</dd></div>
        <div><dt>WINS</dt><dd>{f.wins ?? 0}</dd></div>
        <div><dt>ERAS</dt><dd>{Array.isArray(f.erasCompleted) ? f.erasCompleted.length : 0}</dd></div>
        <div><dt>CHALLENGES</dt><dd>{f.challengesCompleted ?? 0}</dd></div>
        <div><dt>ACHIEVEMENTS</dt><dd>{s.unlocked} <span className="ec-prog-hero-of">/ {s.total}</span></dd></div>
      </dl>
      {onOpenAchievements && <button type="button" className="ec-prog-btn ec-prog-btn--light" onClick={onOpenAchievements}>OPEN ACHIEVEMENTS</button>}
    </section>
  );
}
