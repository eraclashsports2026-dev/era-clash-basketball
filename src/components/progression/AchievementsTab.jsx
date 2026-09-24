// ── My EraClash → Achievements ───────────────────────────────────────────────
// Phase 9D. The career record book: every achievement in the versioned catalog
// with truthful progress derived from the account's own records. Filters are
// buttons (keyboard-accessible, aria-pressed); state is never colour alone —
// every card says LOCKED, UNLOCKED or SECRET in words. Night Court editorial
// styling on the reading surface; no glowing locks.
import { useEffect, useMemo, useRef, useState } from "react";
import { ACHIEVEMENT_FILTERS, ACHIEVEMENT_TONES, PROGRESSION_EVENTS } from "../../progression/contract.js";
import AchievementIcon from "./AchievementIcon.jsx";
import { track } from "../../analytics.js";

const dateOf = (iso) => { try { return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : ""; } catch { return ""; } };

export default function AchievementsTab({ progression, loading = false }) {
  const [filter, setFilter] = useState("all");
  const seen = useRef(false);
  const ok = progression?.status === "ok";
  const all = ok ? progression.achievements : [];
  const summary = ok ? progression.summary : { total: 0, unlocked: 0 };
  useEffect(() => { if (ok && !seen.current) { seen.current = true; track(PROGRESSION_EVENTS.ACHIEVEMENTS_VIEWED, { unlockCount: summary.unlocked }); } }, [ok, summary.unlocked]);

  const def = ACHIEVEMENT_FILTERS.find((f) => f.id === filter) || ACHIEVEMENT_FILTERS[0];
  const shown = useMemo(() => all.filter((a) => def.categories.includes(a.category)), [all, def]);
  const pick = (id) => { if (id === filter) return; setFilter(id); track(PROGRESSION_EVENTS.FILTER_CHANGED, { filter: id }); };

  if (loading) return <div className="ec-me-card"><p className="ec-me-muted">Loading achievements…</p></div>;
  if (!ok) return <div className="ec-ach-card-wrap"><section className="ec-ach-head"><h2 className="ec-ach-title">Achievements</h2><p className="ec-ach-muted">Your achievements could not be loaded just now.</p></section></div>;

  return (
    <div className="ec-ach">
      <section className="ec-ach-head" aria-labelledby="ec-ach-title">
        <h2 id="ec-ach-title" className="ec-ach-title">Achievements</h2>
        <div className="ec-ach-count" data-unlocked={summary.unlocked} data-total={summary.total}>{summary.unlocked} / {summary.total} UNLOCKED</div>
        <div className="ec-ach-filters" role="group" aria-label="Filter achievements">
          {ACHIEVEMENT_FILTERS.map((f) => (
            <button key={f.id} type="button" className="ec-ach-filter" aria-pressed={filter === f.id} onClick={() => pick(f.id)}>{f.label.toUpperCase()}</button>
          ))}
        </div>
      </section>
      <ul className="ec-ach-grid" aria-label={`${def.label} achievements`}>
        {shown.map((a) => {
          const state = a.unlocked ? "unlocked" : a.display.secret ? "secret" : "locked";
          const tone = ACHIEVEMENT_TONES[a.category] || "gold";
          return (
            <li key={a.id} className="ec-ach-card" data-state={state} data-tone={tone} data-achievement={a.id} data-category={a.category}>
              <div className="ec-ach-card-top">
                <AchievementIcon icon={a.icon} tone={tone} locked={!a.unlocked} />
                <span className="ec-ach-state">{state === "unlocked" ? "UNLOCKED" : state === "secret" ? "SECRET" : "LOCKED"}</span>
              </div>
              <h3 className="ec-ach-name">{a.display.name}</h3>
              <p className="ec-ach-desc">{a.display.description}</p>
              {a.unlocked ? (
                <div className="ec-ach-foot"><span>UNLOCKED {dateOf(a.unlockedAt).toUpperCase() || "NOW"}</span><b>+{a.xp} XP</b></div>
              ) : a.display.secret ? (
                <div className="ec-ach-foot"><span>?</span><b>+? XP</b></div>
              ) : (
                <div className="ec-ach-foot">
                  {a.progressType === "count" ? (
                    <span className="ec-ach-progress">
                      <span className="ec-ach-progress-n">{a.current} / {a.target}</span>
                      <span className="ec-ach-progress-bar" role="progressbar" aria-label={`${a.name} progress`} aria-valuemin={0} aria-valuemax={a.target} aria-valuenow={a.current}><span style={{ width: `${Math.round((a.current / a.target) * 100)}%` }} /></span>
                    </span>
                  ) : <span>NOT YET</span>}
                  <b>+{a.xp} XP</b>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="ec-ach-note">Achievements recognise what you have done. They never change a roll, a draft, an era, a coach or a score.</p>
    </div>
  );
}
