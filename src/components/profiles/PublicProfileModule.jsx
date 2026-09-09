// ── PUBLIC PROFILE — the owner's control, on My EraClash ─────────────────────
// Phase 9F. A restrained module, not a settings matrix: one state, one primary
// decision. Private by default, reversible in one press, and the owner can
// preview the real card while still private — the preview is the same component
// the public route renders, from the server's own projection, so it cannot
// drift from the truth and cannot make anything public by being opened.
//
// When the two visibility settings disagree, one plain sentence says what that
// means. There is no second toggle here for the leaderboard: that setting lives
// where Phase 9E put it.
import { useState } from "react";
import { MAX_FEATURED_ACHIEVEMENTS, PROFILE_EVENTS, profilePath } from "../../profiles/contract.js";
import { shareProfile } from "../../profiles/client.js";
import { track } from "../../analytics.js";
import PlayerCard from "./PlayerCard.jsx";
import FeaturedPicker from "./FeaturedPicker.jsx";

export default function PublicProfileModule({
  me, loading = false, busy = false, onVisibility, onFeatured, onOpenProfile = null,
}) {
  const [previewing, setPreviewing] = useState(false);
  const [note, setNote] = useState(null);
  const [editing, setEditing] = useState(false);

  if (loading) return <section className="ec-pp-mod" aria-busy="true"><div className="ec-pp-section">PUBLIC PROFILE</div><p className="ec-pp-muted">Loading…</p></section>;
  if (!me || me.status !== "ok" || !me.found) {
    return (
      <section className="ec-pp-mod">
        <div className="ec-pp-section">PUBLIC PROFILE</div>
        <p className="ec-pp-muted">Your public profile could not be loaded just now.</p>
      </section>
    );
  }

  const isPublic = me.profileVisibility === "public";
  const path = profilePath(me.slug);
  const differs = isPublic !== (me.leaderboardVisibility === "public");

  const preview = () => {
    setPreviewing((v) => !v);
    if (!previewing) track(PROFILE_EVENTS.PREVIEWED, { visibility: me.profileVisibility, state: me.state });
  };
  const change = async (v) => {
    const ok = await onVisibility?.(v);
    track(PROFILE_EVENTS.VISIBILITY_CHANGED, { visibility: v, success: ok !== false });
  };
  const share = async () => {
    const r = await shareProfile({ slug: me.slug, displayName: me.displayName });
    track(PROFILE_EVENTS.SHARED, { shareMethod: r.method, success: r.ok });
    setNote(r.ok && r.method === "clipboard" ? "Link copied." : r.ok ? "Shared." : r.method === "manual" ? r.url : null);
  };

  return (
    <section className="ec-pp-mod" data-visibility={me.profileVisibility} aria-labelledby="ec-pp-mod-title">
      <div className="ec-pp-mod-head">
        <div id="ec-pp-mod-title" className="ec-pp-section">PUBLIC PROFILE</div>
        <span className="ec-pp-badge" data-state={isPublic ? "public" : "private"}>{isPublic ? "PUBLIC" : "PRIVATE"}</span>
      </div>

      <p className="ec-pp-mod-copy">
        {isPublic
          ? "Your EraClash profile can be viewed by anyone with your share link."
          : "Your competitive profile is visible only to you."}
      </p>

      {differs && (
        <p className="ec-pp-muted" data-role="divergence">
          {isPublic
            ? "Your profile is public, and you are not on the public leaderboard — your rating is shared by link only."
            : "You appear on the public leaderboard, and your profile stays private — your row will not link anywhere."}
        </p>
      )}

      <div className="ec-pp-mod-actions">
        <button type="button" className="ec-pp-btn" onClick={preview} aria-expanded={previewing}>
          {previewing ? "HIDE PREVIEW" : "PREVIEW PROFILE"}
        </button>
        {isPublic ? (
          <>
            {onOpenProfile && <button type="button" className="ec-pp-btn" onClick={() => onOpenProfile(path)}>VIEW PROFILE</button>}
            <button type="button" className="ec-pp-btn" onClick={share}>COPY LINK</button>
            <button type="button" className="ec-pp-btn" disabled={busy} onClick={() => change("private")}>MAKE PRIVATE</button>
          </>
        ) : (
          <button type="button" className="ec-pp-btn" data-primary="true" disabled={busy} onClick={() => change("public")}>MAKE PUBLIC</button>
        )}
      </div>

      {note && <p className="ec-pp-note" role="status">{note}</p>}

      {previewing && (
        <div className="ec-pp-preview" data-fixture-part="owner-preview">
          <div className="ec-pp-preview-k" role="status">
            {isPublic ? "THIS IS YOUR PUBLIC PROFILE" : "PRIVATE PREVIEW · NOT VISIBLE TO ANYONE ELSE"}
          </div>
          <div className="ec-editorial ec-pp-preview-surface">
            <PlayerCard profile={me.preview} variant="preview" />
          </div>
        </div>
      )}

      <div className="ec-pp-mod-featured">
        <button type="button" className="ec-pp-btn" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          {editing ? "DONE" : `FEATURED ACHIEVEMENTS · ${me.featured.length} / ${MAX_FEATURED_ACHIEVEMENTS}`}
        </button>
        {editing && (
          <FeaturedPicker
            featured={me.featured} unlockable={me.unlockable} max={me.maxFeatured ?? MAX_FEATURED_ACHIEVEMENTS} busy={busy}
            onChange={async (ids) => {
              const r = await onFeatured?.(ids);
              track(PROFILE_EVENTS.FEATURED_UPDATED, { featuredCount: ids.length, success: r !== false, ...(r === false ? { failureCode: "refused" } : {}) });
              return r;
            }}
          />
        )}
      </div>
    </section>
  );
}
