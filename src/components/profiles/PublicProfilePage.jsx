// ── /player/<slug> — a public EraClash competitive profile ───────────────────
// Phase 9F. One fetch, by slug, of the server's safe projection. Readable
// signed out. A private profile, an unknown slug, a malformed slug and a
// deleted account all land in the SAME state — "not available" — because the
// server answers them identically; this page cannot tell them apart and must
// not try to.
import { useCallback, useEffect, useRef, useState } from "react";
import { publicProfileRequest } from "../../profiles/client.js";
import { PROFILE_EVENTS, isSlug } from "../../profiles/contract.js";
import PlayerCard from "./PlayerCard.jsx";
import { track } from "../../analytics.js";

export function PublicProfileView({ state = "ok", profile = null, onPlay = null, onLeaderboard = null, onRetry = null }) {
  return (
    <main className="ec-pp-page" aria-labelledby={state === "ok" && profile ? "ec-pp-name" : "ec-pp-title"}>
      {state === "loading" && <p className="ec-pp-muted" role="status">Loading the profile…</p>}

      {state === "error" && (
        <section className="ec-pp-empty">
          <h1 id="ec-pp-title" className="ec-pp-empty-k">THIS PROFILE COULD NOT BE LOADED</h1>
          <p className="ec-pp-muted">Something went wrong on our side, not yours.</p>
          {onRetry && <button type="button" className="ec-pp-btn" onClick={onRetry}>TRY AGAIN</button>}
        </section>
      )}

      {/* Deliberately one state for private, unknown, malformed and deleted. */}
      {state === "missing" && (
        <section className="ec-pp-empty">
          <h1 id="ec-pp-title" className="ec-pp-empty-k">THIS PROFILE IS NOT AVAILABLE</h1>
          <p className="ec-pp-muted">The link may be wrong, or this player keeps their EraClash profile private.</p>
          <div className="ec-pp-empty-actions">
            {onPlay && <button type="button" className="ec-pp-btn" onClick={onPlay}>PLAY ERACLASH</button>}
            {onLeaderboard && <button type="button" className="ec-pp-btn" onClick={onLeaderboard}>VIEW THE LEADERBOARD</button>}
          </div>
        </section>
      )}

      {state === "ok" && profile && (
        <>
          <PlayerCard profile={profile} variant="public" />
          <div className="ec-pp-page-actions">
            {onPlay && <button type="button" className="ec-pp-btn" onClick={onPlay}>PLAY ERACLASH</button>}
            {onLeaderboard && <button type="button" className="ec-pp-btn" onClick={onLeaderboard}>VIEW THE LEADERBOARD</button>}
          </div>
        </>
      )}
    </main>
  );
}

export default function PublicProfilePage({ slug, accessToken = null, onPlay, onLeaderboard }) {
  const [state, setState] = useState("loading");
  const [profile, setProfile] = useState(null);
  const tracked = useRef(false);

  const load = useCallback(async () => {
    if (!isSlug(slug)) { setState("missing"); return; }
    setState("loading");
    try {
      const r = await publicProfileRequest({ slug, accessToken });
      if (r.status === "ok" && r.found) { setProfile(r.profile); setState("ok"); }
      else if (r.status === "ok") { setProfile(null); setState("missing"); }
      else setState("error");
    } catch { setState("error"); }
  }, [slug, accessToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (state === "loading" || tracked.current) return;
    tracked.current = true;
    // categories and counts only — never the slug, the name or the viewer
    track(PROFILE_EVENTS.PUBLIC_VIEWED, {
      success: state === "ok",
      ...(state === "ok" && profile ? { state: profile.state, hasRank: !!profile.rank, featuredCount: (profile.featured || []).length } : { failureCode: state }),
      viewer: accessToken ? "account" : "guest",
    });
  }, [state, profile, accessToken]);

  return <PublicProfileView state={state} profile={profile} onPlay={onPlay} onLeaderboard={onLeaderboard} onRetry={load} />;
}
