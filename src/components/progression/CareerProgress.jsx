// ── CAREER PROGRESS — the postgame module ───────────────────────────────────
// Phase 9D. Appears AFTER the result has established the score, the winner and
// the MVP; never a modal, never a claim button, never a blocker. XP is
// automatic and was decided by the server when the result was saved. The
// module only says what happened: the delta and its lines, the level and its
// bar, a restrained LEVEL UP when a threshold was crossed, and the achievements
// unlocked (one list, not a chain of popups).
//
// A guest sees one line — sign in to preserve your career — because XP attaches
// to an account. A reload shows the same delta from browser memory and asks
// the server for nothing.
import { useEffect, useRef } from "react";
import { PROGRESSION_EVENTS, announceProgress } from "../../progression/contract.js";
import { formatXp } from "../../progression/client.js";
import { track } from "../../analytics.js";

const cap = (s) => String(s || "").toUpperCase();

export function LevelBar({ level, compact = false }) {
  if (!level) return null;
  const pct = level.maxLevel ? 100 : Math.round((level.progress || 0) * 100);
  return (
    <div className="ec-prog-level" data-compact={compact ? "true" : "false"}>
      <div className="ec-prog-level-row">
        <span className="ec-prog-level-k">{level.maxLevel ? "MAX LEVEL" : `LEVEL ${level.level}`}</span>
        <span className="ec-prog-level-v">{level.maxLevel ? `${formatXp(level.totalXp)} XP` : `${formatXp(level.xpIntoLevel)} / ${formatXp(level.xpForLevel)} XP`}</span>
      </div>
      <div className="ec-prog-bar" role="progressbar" aria-label={level.maxLevel ? "Max level reached" : `Level ${level.level} progress`}
        aria-valuemin={0} aria-valuemax={level.maxLevel ? 100 : level.xpForLevel} aria-valuenow={level.maxLevel ? 100 : level.xpIntoLevel}
        aria-valuetext={level.maxLevel ? "Max level" : `${level.xpIntoLevel} of ${level.xpForLevel} XP`}>
        <span className="ec-prog-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {!level.maxLevel && <div className="ec-prog-next">{formatXp(level.xpToNext)} XP TO LEVEL {level.level + 1}</div>}
    </div>
  );
}

export default function CareerProgress({
  outcome = null, pending = false, signedIn = false, previous = false, mode = null,
  surface = "dark", resultId = null, onViewAchievements = null, onSignIn = null,
}) {
  const announced = useRef(null);
  const ok = outcome?.status === "ok";
  // Telemetry once per result: the delta, a level-up, the unlocks. Never a name or an id of the result.
  useEffect(() => {
    if (!ok || previous || announced.current === resultId) return;
    announced.current = resultId;
    track(PROGRESSION_EVENTS.XP_SHOWN, { xpDelta: outcome.xpDelta, level: outcome.after?.level, mode: mode || null });
    if (outcome.levelUp) track(PROGRESSION_EVENTS.LEVEL_UP_SHOWN, { level: outcome.after?.level });
    if (outcome.unlocked?.length) track(PROGRESSION_EVENTS.UNLOCK_SHOWN, { unlockCount: outcome.unlocked.length, achievementId: outcome.unlocked[0].id, achievementCategory: outcome.unlocked[0].category });
  }, [ok, previous, resultId, outcome, mode]);

  if (previous && !ok) return null;

  if (!signedIn) {
    return (
      <section className="ec-prog" data-surface={surface} data-state="guest" aria-labelledby="ec-prog-title">
        <h2 id="ec-prog-title" className="ec-prog-kicker">CAREER PROGRESS</h2>
        <p className="ec-prog-body">Sign in to preserve your career. XP, levels and achievements attach to a free EraClash account.</p>
        {onSignIn && <button type="button" className="ec-prog-btn" onClick={onSignIn}>SIGN IN TO KEEP THIS</button>}
      </section>
    );
  }
  if (!ok) {
    const failed = outcome && outcome.status !== "ok";
    return (
      <section className="ec-prog" data-surface={surface} data-state={pending && !failed ? "pending" : "unavailable"} aria-labelledby="ec-prog-title">
        <h2 id="ec-prog-title" className="ec-prog-kicker">CAREER PROGRESS</h2>
        <p className="ec-prog-body" role="status" aria-live="polite">
          {pending && !failed ? "Adding this Clash to your career…" : "Career progress will catch up the next time you open My EraClash."}
        </p>
      </section>
    );
  }

  const d = outcome;
  const level = d.after;
  const lines = (d.awarded || []).filter((a) => a.category !== "achievement:unlock");
  const achievementXp = (d.awarded || []).filter((a) => a.category === "achievement:unlock").reduce((s, a) => s + (a.xpDelta || 0), 0);
  return (
    <section className="ec-prog" data-surface={surface} data-state="earned" data-level-up={d.levelUp ? "true" : "false"} data-xp-delta={d.xpDelta} aria-labelledby="ec-prog-title">
      <div className="ec-prog-head">
        <h2 id="ec-prog-title" className="ec-prog-kicker">{previous ? "CAREER PROGRESS · THIS CLASH EARNED" : "CAREER PROGRESS"}</h2>
        <output className="ec-prog-sr" aria-live="polite">{previous ? "" : announceProgress(d)}</output>
      </div>
      <div className="ec-prog-delta" aria-hidden="true">{d.xpDelta > 0 ? `+${formatXp(d.xpDelta)} XP` : "NO NEW XP"}</div>
      {d.xpDelta > 0 ? (
        <ul className="ec-prog-lines" aria-label="XP earned">
          {lines.map((a, i) => <li key={i}><span>{a.label}</span><b>+{a.xpDelta}</b></li>)}
          {achievementXp > 0 && <li><span>Achievements</span><b>+{achievementXp}</b></li>}
        </ul>
      ) : (
        <p className="ec-prog-body">This Clash is already in your career. Nothing was awarded twice.</p>
      )}
      <LevelBar level={level} />
      {d.levelUp && (
        <div className="ec-prog-levelup" role="status" aria-live="polite">
          <div className="ec-prog-levelup-k">LEVEL UP</div>
          <div className="ec-prog-levelup-v">LEVEL {level.level} REACHED</div>
          <div className="ec-prog-body">Your EraClash career keeps growing.</div>
        </div>
      )}
      {d.unlocked?.length > 0 && (
        <div className="ec-prog-unlocks">
          <div className="ec-prog-unlocks-k" role="status" aria-live="polite">
            {d.unlocked.length === 1 ? "ACHIEVEMENT UNLOCKED" : `ACHIEVEMENTS UNLOCKED · ${d.unlocked.length}`}
            <span className="ec-prog-sr">{d.unlocked.map((u) => ` Achievement unlocked: ${u.name}.`).join("")}</span>
          </div>
          <ul className="ec-prog-unlock-list">
            {d.unlocked.map((u) => <li key={u.id} data-category={u.category}>{cap(u.name)}</li>)}
          </ul>
          {onViewAchievements && <button type="button" className="ec-prog-btn ec-prog-btn--quiet" onClick={onViewAchievements}>VIEW ACHIEVEMENTS</button>}
        </div>
      )}
    </section>
  );
}
