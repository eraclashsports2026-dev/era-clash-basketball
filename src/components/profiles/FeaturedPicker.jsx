// ── Choose up to three featured achievements ─────────────────────────────────
// Phase 9F. The picker offers ONLY achievements the account has already
// unlocked — the server sends that list, so a locked one cannot be offered and
// cannot be chosen. Selecting past the maximum is refused here for immediacy
// and again by the database, which is the authority. Clearing is allowed and is
// idempotent.
import { useState } from "react";
import { ACHIEVEMENTS } from "../../progression/contract.js";
import AchievementIcon from "../progression/AchievementIcon.jsx";

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export default function FeaturedPicker({ featured = [], unlockable = [], max = 3, busy = false, onChange }) {
  const [picked, setPicked] = useState(featured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const options = unlockable.map((id) => byId.get(id)).filter(Boolean);
  const atMax = picked.length >= max;

  const toggle = (id) => {
    setError(null);
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= max) { setError(`You can feature ${max}. Remove one first.`); return cur; }
      return [...cur, id];
    });
  };
  const save = async () => {
    setSaving(true); setError(null);
    try { const r = await onChange?.(picked); if (r === false) setError("That selection could not be saved."); }
    finally { setSaving(false); }
  };

  if (options.length === 0) {
    return <p className="ec-pp-muted">Unlock an achievement and you can feature it here.</p>;
  }

  return (
    <div className="ec-pp-picker">
      <p className="ec-pp-muted" id="ec-pp-picker-help">Choose up to {max}. Only achievements you have unlocked can be featured.</p>
      <ul className="ec-pp-picker-list" aria-describedby="ec-pp-picker-help">
        {options.map((a) => {
          const on = picked.includes(a.id);
          return (
            <li key={a.id}>
              <button
                type="button" className="ec-pp-picker-opt" aria-pressed={on}
                disabled={busy || saving || (!on && atMax)}
                onClick={() => toggle(a.id)}
              >
                <AchievementIcon icon={a.icon} size={22} />
                <span className="ec-pp-picker-name">{a.name}</span>
                <span className="ec-pp-sr">{on ? "featured" : atMax ? "cannot feature, maximum reached" : "not featured"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ec-pp-picker-foot">
        <span className="ec-pp-picker-count" role="status">{picked.length} / {max} featured</span>
        <button type="button" className="ec-pp-btn" data-primary="true" disabled={busy || saving} onClick={save}>SAVE FEATURED</button>
        {picked.length > 0 && <button type="button" className="ec-pp-btn" disabled={busy || saving} onClick={() => { setPicked([]); setError(null); }}>CLEAR</button>}
      </div>
      {error && <p className="ec-pp-error" role="alert">{error}</p>}
    </div>
  );
}
