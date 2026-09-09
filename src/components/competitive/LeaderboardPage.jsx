// ── /leaderboard — Challenge Rating ──────────────────────────────────────────
// Phase 9E. Premium sports standings on the reading surface: LEADERBOARD ·
// Challenge Rating · "Built from official EraClash Challenges." · the Top 100
// (public AND placed accounts, display names only), a personal module for a
// signed-in visitor (no rated matches · provisional · placed private · placed
// public with rank) and AROUND ME for a placed, public account. Readable signed
// out. Nothing here ranks: the server's projection already did, deterministically.
import { useCallback, useEffect, useRef, useState } from "react";
import { leaderboardRequest, competitiveMeRequest, aroundMeRequest, setLeaderboardVisibility } from "../../competitive/client.js";
import { COMPETITIVE_EVENTS, LEADERBOARD_LIMIT, announceRow, fmt, rankBucket } from "../../competitive/contract.js";
import VisibilitySetting from "./VisibilitySetting.jsx";
import { track } from "../../analytics.js";

const COLS = [["rank", "RANK"], ["player", "PLAYER"], ["rating", "RATING"], ["record", "RECORD"], ["winPct", "WIN %"], ["matches", "MATCHES"], ["streak", "STREAK"]];

/** The standings, as a real table with explicit roles so phone layouts keep their semantics. */
export function StandingsTable({ rows, meRank = null, caption = "Top players by Challenge Rating" }) {
  return (
    <table className="ec-cr-table" role="table">
      <caption className="ec-cr-sr">{caption}</caption>
      <thead role="rowgroup"><tr role="row">{COLS.map(([id, label]) => <th key={id} role="columnheader" scope="col" data-col={id}>{label}</th>)}</tr></thead>
      <tbody role="rowgroup">
        {rows.map((r) => (
          <tr key={r.rank} role="row" data-rank={r.rank} data-podium={r.rank <= 3 ? r.rank : undefined} data-me={meRank === r.rank ? "true" : undefined} aria-label={announceRow(r)}>
            <td role="cell" data-col="rank"><span className="ec-cr-rank">{r.rank}</span></td>
            <td role="cell" data-col="player"><span className="ec-cr-avatar" aria-hidden="true">{r.initials}</span><span className="ec-cr-name">{r.displayName}</span>{r.level != null && <span className="ec-cr-level">LEVEL {r.level}</span>}</td>
            <td role="cell" data-col="rating"><span className="ec-cr-rating">{fmt(r.rating)}</span></td>
            <td role="cell" data-col="record">{r.wins}–{r.losses}–{r.ties}</td>
            <td role="cell" data-col="winPct">{r.winPct == null ? "—" : `${r.winPct}%`}</td>
            <td role="cell" data-col="matches">{r.matches}</td>
            <td role="cell" data-col="streak">{r.streak || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Pure presentation, so the fixture and the gates can render every state without a server. */
export function LeaderboardView({ state = "ok", rows = [], signedIn = false, me = null, around = null, visibility = "private", onVisibility = null, busy = false, onSignIn = null, onRetry = null }) {
  const placedPublic = me?.status === "ok" && !me.provisional && me.visibility === "public";
  return (
    <main className="ec-cr-page" aria-labelledby="ec-cr-title">
      <header className="ec-cr-hero">
        <div className="ec-cr-kicker">LEADERBOARD</div>
        <h1 id="ec-cr-title" className="ec-cr-h1">Challenge Rating</h1>
        <p className="ec-cr-sub">Built from official EraClash Challenges between accounts. Career XP and levels do not rank anyone here.</p>
      </header>

      {signedIn ? (
        <section className="ec-cr-card ec-cr-me" aria-labelledby="ec-cr-me-title" data-state={me?.status !== "ok" ? "unavailable" : me.record.matches === 0 ? "none" : me.provisional ? "provisional" : me.visibility === "public" ? "public" : "private"}>
          <h2 id="ec-cr-me-title" className="ec-cr-section">YOUR COMPETITIVE RATING</h2>
          {me?.status !== "ok" ? <p className="ec-cr-muted">Your rating could not be loaded just now.</p> : (
            <>
              <div className="ec-cr-me-top">
                <div className="ec-cr-me-rating">{fmt(me.rating)}</div>
                <div className="ec-cr-me-side">
                  <div className="ec-cr-me-status">{me.record.matches === 0 ? "NO RATED CHALLENGES YET" : me.provisional ? "PROVISIONAL" : me.visibility === "public" && me.rank ? `#${me.rank} GLOBAL` : me.visibility === "public" ? "PLACED" : "PRIVATE"}</div>
                  <div className="ec-cr-me-record">{me.record.wins}–{me.record.losses}–{me.record.ties}{me.streak ? ` · ${me.streak}` : ""}</div>
                </div>
              </div>
              {me.record.matches === 0 && <p className="ec-cr-muted">Complete an official Challenge against another account to begin. Everyone starts at {fmt(1000)}.</p>}
              {me.provisional && me.record.matches > 0 && (
                <div className="ec-cr-prov" role="status">
                  <div><b>{me.placement.matches} / {me.placement.matchesTarget}</b> RATED MATCHES</div>
                  <div><b>{me.placement.opponents} / {me.placement.opponentsTarget}</b> UNIQUE OPPONENTS</div>
                  <p className="ec-cr-muted">Your rating is private until you are placed. A public rank appears only after placement, and only if you choose public visibility.</p>
                </div>
              )}
              {!me.provisional && me.visibility !== "public" && <p className="ec-cr-muted">Your rating: {fmt(me.rating)}. Enable leaderboard visibility to appear publicly.</p>}
              {onVisibility && <VisibilitySetting visibility={visibility} onChange={onVisibility} busy={busy} compact />}
            </>
          )}
        </section>
      ) : (
        <section className="ec-cr-card ec-cr-me" data-state="signed-out">
          <h2 className="ec-cr-section">YOUR COMPETITIVE RATING</h2>
          <p className="ec-cr-muted">Sign in to see your own rating, record and placement. The public rankings below are open to everyone.</p>
          {onSignIn && <button type="button" className="ec-cr-btn" onClick={onSignIn}>SIGN IN</button>}
        </section>
      )}

      {placedPublic && around?.available && (
        <section className="ec-cr-card" aria-labelledby="ec-cr-around-title" data-fixture-part="around-me">
          <h2 id="ec-cr-around-title" className="ec-cr-section">AROUND ME</h2>
          <ul className="ec-cr-around">
            {around.rows.map((r) => (
              <li key={r.rank} data-me={r.isMe ? "true" : undefined} aria-label={announceRow(r)}>
                <span className="ec-cr-rank">#{r.rank}</span><span className="ec-cr-name">{r.displayName}{r.isMe ? " (you)" : ""}</span><span className="ec-cr-rating">{fmt(r.rating)}</span><span className="ec-cr-record">{r.wins}–{r.losses}–{r.ties}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ec-cr-card ec-cr-board" aria-labelledby="ec-cr-top-title" data-state={state} data-rows={rows.length}>
        <h2 id="ec-cr-top-title" className="ec-cr-section">TOP PLAYERS <span className="ec-cr-muted-inline">· TOP {LEADERBOARD_LIMIT} · PUBLIC, PLACED ACCOUNTS</span></h2>
        {state === "loading" && <p className="ec-cr-muted" role="status">Loading the rankings…</p>}
        {state === "error" && <div><p className="ec-cr-muted" role="status">The leaderboard could not be loaded just now.</p>{onRetry && <button type="button" className="ec-cr-btn" onClick={onRetry}>TRY AGAIN</button>}</div>}
        {state === "ok" && rows.length === 0 && (
          <div className="ec-cr-empty">
            <div className="ec-cr-empty-k">THE FIRST RANKINGS ARE FORMING</div>
            <p className="ec-cr-muted">Complete official Challenges to establish your Competitive Rating. A player appears here after placement — five rated matches against three different opponents — and only by choosing public visibility.</p>
          </div>
        )}
        {state === "ok" && rows.length > 0 && <StandingsTable rows={rows} meRank={placedPublic ? me.rank : null} />}
      </section>
      <p className="ec-cr-foot">Ranked by Challenge Rating, then rated wins, then fewer losses, then who reached the rating first. Win % is rated wins over rated matches. Rating never changes a roll, a draft, an era, a coach or a score.</p>
    </main>
  );
}

export default function LeaderboardPage({ signedIn = false, accessToken = null, onSignIn }) {
  const [board, setBoard] = useState({ state: "loading", rows: [] });
  const [me, setMe] = useState(null);
  const [around, setAround] = useState(null);
  const [busy, setBusy] = useState(false);
  const viewed = useRef(false);
  const load = useCallback(async () => {
    setBoard((b) => ({ ...b, state: "loading" }));
    try { const r = await leaderboardRequest({ accessToken }); setBoard(r.status === "ok" ? { state: "ok", rows: r.rows || [] } : { state: "error", rows: [] }); }
    catch { setBoard({ state: "error", rows: [] }); }
    if (signedIn && accessToken) {
      try { const m = await competitiveMeRequest({ accessToken }); setMe(m); if (m.status === "ok" && !m.provisional && m.visibility === "public") { const a = await aroundMeRequest({ accessToken }); setAround(a.status === "ok" ? a : null); if (a.available) track(COMPETITIVE_EVENTS.AROUND_ME_VIEWED, { rankBucket: rankBucket(m.rank) }); } else setAround(null); if (m.status === "ok" && m.provisional && m.record.matches > 0) track(COMPETITIVE_EVENTS.PROVISIONAL_VIEWED, { ratedMatchCount: m.record.matches }); }
      catch { setMe({ status: "failed" }); }
    }
  }, [accessToken, signedIn]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!viewed.current) { viewed.current = true; track(COMPETITIVE_EVENTS.LEADERBOARD_VIEWED, { authState: signedIn ? "account" : "guest" }); } }, [signedIn]);
  const onVisibility = async (v) => {
    setBusy(true);
    try { await setLeaderboardVisibility(v); await load(); return true; } catch { return false; } finally { setBusy(false); }
  };
  return <LeaderboardView state={board.state} rows={board.rows} signedIn={signedIn} me={me} around={around} visibility={me?.visibility || "private"} onVisibility={signedIn ? onVisibility : null} busy={busy} onSignIn={onSignIn} onRetry={load} />;
}
