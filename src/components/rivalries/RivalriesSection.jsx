// ── My EraClash → Challenges → Rivalries ─────────────────────────────────────
// A Rivalries subsection of the existing Challenges destination (no new tab,
// no new global navigation). Compact rows: the opponent's permitted identity,
// the state, YOUR RIVALRY RECORD for the current period. A row expands to the
// detail: periods with their records, recent Challenge comparisons, pending
// Challenges, CHALLENGE AGAIN, END RIVALRY. Requests: ACCEPT · DECLINE · BLOCK
// for the recipient, CANCEL for the sender. Everything is read through the
// server for the verified account; nothing here decides a record.
import { useCallback, useEffect, useState } from "react";
import { listRivalriesRequest, respondRivalryRequest, rivalryDetailRequest, rememberRivalryContext } from "../../rivalries/client.js";
import { recordLine, allowedActions, ACTIONS, RIVALRY_EVENTS, HISTORY_PAGE_SIZE } from "../../rivalries/contract.js";
import { challengeLink, copyText } from "../../challenges/client.js";
import { track } from "../../analytics.js";

const dateOf = (iso) => { try { return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"; } catch { return "—"; } };
const OUT = { win: "WIN", loss: "LOSS", tie: "TIE" };
const CLOSED = { declined: "Declined", canceled: "Request withdrawn", expired: "Request expired", ended: "Ended", blocked: "Blocked", account_deleted: "Account deleted" };
const RESPOND_COPY = { accepted: "Rivalry started. Comparisons from now on count.", declined: "Request declined.", blocked: "Blocked. No further Rivalry requests from this account.", unblocked: "Unblocked.", canceled: "Request withdrawn.", ended: "Rivalry ended. The record is kept as history; nothing was cancelled.", not_pending: "That request is no longer pending.", not_active: "That Rivalry is not active.", expired: "That request has expired.", unavailable: "That account is not available for a Rivalry.", not_yours: "That Rivalry could not be found." };

export default function RivalriesSection({ accessToken, onChallengeAgain, onOpenProfile, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(null);         // rivalryId expanded
  const [detail, setDetail] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(null);

  const load = useCallback(async () => {
    if (!accessToken) { setLoading(false); return; }
    setLoading(true);
    try { const r = await listRivalriesRequest({ accessToken }); setData(r.status === "ok" ? r : null); if (r.status === "ok") track(RIVALRY_EVENTS.VIEWED, { contractVersion: r.contractVersion, count: r.rivalries.length }); else if (r.httpStatus !== 404 && r.error !== "FEATURE_DISABLED") setNotice("Rivalries could not be loaded just now."); }
    catch { setNotice("Rivalries could not be loaded just now."); }
    setLoading(false);
  }, [accessToken]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const loadDetail = useCallback(async (rivalryId) => {
    setDetail(null);
    try { const r = await rivalryDetailRequest({ rivalryId, accessToken, limit: HISTORY_PAGE_SIZE }); setDetail(r.status === "ok" ? r.rivalry : { error: true }); }
    catch { setDetail({ error: true }); }
  }, [accessToken]);
  const toggle = (id) => { if (open === id) { setOpen(null); setDetail(null); } else { setOpen(id); loadDetail(id); } };

  const respond = async (rivalryId, action) => {
    try {
      const r = await respondRivalryRequest({ rivalryId, rivalryAction: action, accessToken });
      const ok = ["accepted", "declined", "blocked", "unblocked", "canceled", "ended"].includes(r.status);
      track(action === ACTIONS.END ? RIVALRY_EVENTS.ENDED : RIVALRY_EVENTS.RESPONDED, { contractVersion: "1.0.0", action, status: r.status, success: ok, ...(ok ? {} : { failureCode: r.status || "network" }) });
      setNotice(RESPOND_COPY[r.status] || "That could not be done. Nothing else changed — try again.");
      setConfirmEnd(null);
      await load(); if (open === rivalryId) loadDetail(rivalryId);
    } catch { setNotice("That could not be done. Nothing else changed — try again."); }
  };
  const challengeAgain = (row) => {
    rememberRivalryContext({ rivalryId: row.rivalryId, opponentName: row.opponent?.name });
    track(RIVALRY_EVENTS.CHALLENGE_AGAIN, { contractVersion: "1.0.0", success: true });
    onChallengeAgain?.(row);
  };
  const copy = async (code) => { const ok = await copyText(challengeLink(code)); setNotice(ok ? `Link for ${code} copied.` : "Copy failed."); };

  if (!accessToken) return null;
  if (loading && !data) return <section className="ec-me-card" aria-labelledby="ec-riv-title"><h2 id="ec-riv-title" className="ec-me-section">Rivalries</h2><p className="ec-me-muted">Loading rivalries…</p></section>;
  const rows = data?.rivalries || [];
  const incoming = rows.filter((r) => r.state === "pending" && !r.pendingFromMe);
  const outgoing = rows.filter((r) => r.state === "pending" && r.pendingFromMe);
  const active = rows.filter((r) => r.state === "active");
  const past = rows.filter((r) => r.state === "idle");

  const row = (r) => {
    const actions = allowedActions({ state: r.state, pendingFromMe: r.pendingFromMe, blockedByMe: r.blockedByMe });
    const expanded = open === r.rivalryId;
    return (
      <li key={r.rivalryId} className="ec-chal-row ec-riv-row" data-state={r.state} data-rivalry-row>
        <div className="ec-chal-row-head">
          <div><b>{r.opponent?.name || "Coach"}</b>
            <span className="ec-chal-status" data-status={r.state === "active" ? "open" : r.state}>{r.state === "active" ? "ACTIVE" : r.state === "pending" ? (r.pendingFromMe ? "REQUEST SENT" : "REQUEST RECEIVED") : (CLOSED[r.lastClosedReason] || "PAST").toUpperCase()}</span></div>
          <div className="ec-me-muted">{r.state === "pending" ? `expires ${dateOf(r.pendingExpiresAt)}` : r.period ? `since ${dateOf(r.period.startedAt)}` : r.lastClosedAt ? dateOf(r.lastClosedAt) : ""}</div>
        </div>
        {r.state === "active" && r.period && (
          <div className="ec-riv-record" data-record={`${r.period.record.wins}-${r.period.record.losses}-${r.period.record.ties}`}>
            <span className="ec-chal-col-k">YOUR RIVALRY RECORD</span>
            <b className="ec-riv-record-line">{recordLine(r.period.record)}</b>
            <span className="ec-me-muted">{r.period.record.wins}–{r.period.record.losses}–{r.period.record.ties} · {r.period.record.ties === 1 ? "1 tie" : `${r.period.record.ties} ties`} · Challenge-comparison history since this Rivalry began</span>
          </div>
        )}
        <div className="ec-chal-row-actions">
          {actions.includes(ACTIONS.ACCEPT) && <button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={() => respond(r.rivalryId, ACTIONS.ACCEPT)}>ACCEPT</button>}
          {actions.includes(ACTIONS.DECLINE) && <button type="button" className="ec-chal-btn" onClick={() => respond(r.rivalryId, ACTIONS.DECLINE)}>DECLINE</button>}
          {actions.includes(ACTIONS.CANCEL) && <button type="button" className="ec-chal-btn" onClick={() => respond(r.rivalryId, ACTIONS.CANCEL)}>CANCEL REQUEST</button>}
          {r.state === "active" && <button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={() => challengeAgain(r)}>CHALLENGE AGAIN</button>}
          {(r.state === "active" || r.periods > 0) && <button type="button" className="ec-chal-btn ec-chal-btn--quiet" aria-expanded={expanded} aria-controls={`ec-riv-detail-${r.rivalryId}`} onClick={() => toggle(r.rivalryId)}>{expanded ? "HIDE HISTORY" : "HISTORY"}</button>}
          {actions.includes(ACTIONS.BLOCK) && <button type="button" className="ec-chal-btn ec-chal-btn--quiet" onClick={() => respond(r.rivalryId, ACTIONS.BLOCK)}>BLOCK REQUESTS</button>}
          {actions.includes(ACTIONS.UNBLOCK) && <button type="button" className="ec-chal-btn ec-chal-btn--quiet" onClick={() => respond(r.rivalryId, ACTIONS.UNBLOCK)}>UNBLOCK</button>}
          {r.opponent?.publicSlug && onOpenProfile && <button type="button" className="ec-chal-btn ec-chal-btn--quiet ec-riv-link" onClick={() => onOpenProfile(`/player/${r.opponent.publicSlug}`)}>PUBLIC PROFILE</button>}
        </div>
        {expanded && (
          <div id={`ec-riv-detail-${r.rivalryId}`} className="ec-riv-detail">
            {!detail ? <p className="ec-me-muted">Loading history…</p> : detail.error ? <p className="ec-me-muted">History could not be loaded just now.</p> : (
              <>
                {detail.periods.map((p) => (
                  <div key={p.periodId} className="ec-riv-period" data-period={p.periodNo}>
                    <div className="ec-chal-col-k">{p.endedAt ? `PERIOD ${p.periodNo} · ${dateOf(p.startedAt)} – ${dateOf(p.endedAt)}` : `SINCE THIS RIVALRY BEGAN · ${dateOf(p.startedAt)}`}</div>
                    <div className="ec-chal-row-line"><b>{recordLine(p.record)}</b> · {p.record.wins}–{p.record.losses}–{p.record.ties}{p.streak > 1 ? ` · ${p.streak} wins in a row` : ""}{p.endedAt ? ` · ${p.endReason === "account_deleted" ? "account deleted" : p.endReason === "blocked" ? "blocked" : p.endedByMe ? "ended by you" : "ended by them"}` : ""}</div>
                  </div>
                ))}
                {detail.pendingChallenges?.length > 0 && (
                  <div className="ec-riv-pending">
                    <div className="ec-chal-col-k">PENDING CHALLENGES</div>
                    <ul className="ec-chal-list">
                      {detail.pendingChallenges.map((c) => (
                        <li key={c.code} className="ec-chal-response"><span className="ec-chal-resp-name">{c.code}</span><span className="ec-me-muted">{c.mine ? (c.started ? "they are playing it" : "waiting for them") : (c.started ? "you started it" : "your turn")} · open until {dateOf(c.expiresAt)}</span>{c.mine && <button type="button" className="ec-chal-btn ec-chal-btn--quiet" onClick={() => copy(c.code)}>COPY LINK</button>}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="ec-chal-col-k">RECENT COMPARISONS</div>
                {detail.events.length === 0 ? <p className="ec-me-muted">No comparisons since this Rivalry began. Only official Challenges started after acceptance count.</p> : (
                  <ul className="ec-chal-list" aria-label="Recent Challenge comparisons">
                    {detail.events.map((e) => (
                      <li key={e.eventId} className="ec-chal-response ec-riv-event" data-outcome={e.outcome} data-rated={e.rated}>
                        <span className={`ec-chal-tag ec-chal-tag--${e.outcome}`}>{OUT[e.outcome]}</span>
                        <span>your result <b>{e.myScore.gold}–{e.myScore.blue}</b> · theirs <b>{e.theirScore.gold}–{e.theirScore.blue}</b>{e.era ? ` · era ${e.era}` : ""} · {e.rated ? "rated" : "unrated"} · {dateOf(e.completedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {detail.eventCount > detail.events.length && <p className="ec-me-muted">Showing the {detail.events.length} most recent of {detail.eventCount}.</p>}
                {r.state === "active" && (confirmEnd === r.rivalryId
                  ? <div className="ec-chal-row-actions"><span className="ec-me-muted">End this Rivalry? The record stays as history, open Challenges are not cancelled, and starting again needs both of you to agree.</span><button type="button" className="ec-chal-btn" onClick={() => respond(r.rivalryId, ACTIONS.END)}>END RIVALRY</button><button type="button" className="ec-chal-btn ec-chal-btn--quiet" onClick={() => setConfirmEnd(null)}>KEEP IT</button></div>
                  : <div className="ec-chal-row-actions"><button type="button" className="ec-chal-btn ec-chal-btn--quiet" onClick={() => setConfirmEnd(r.rivalryId)}>END RIVALRY…</button></div>)}
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="ec-me-card ec-riv" aria-labelledby="ec-riv-title" data-rivalries={rows.length}>
      <h2 id="ec-riv-title" className="ec-me-section">Rivalries</h2>
      <p className="ec-me-muted">Private, between two accounts who both agreed. A Rivalry tracks your Challenge comparisons from the moment you both accept — nothing is public, and nothing here changes a rating.</p>
      <output className="ec-chal-feedback" aria-live="polite">{notice}</output>
      {rows.length === 0 && <p className="ec-me-muted">No Rivalries yet. After a completed Challenge with another account, press START A RIVALRY on that comparison.</p>}
      {incoming.length > 0 && <><h3 className="ec-riv-sub">Requests for you</h3><ul className="ec-chal-list">{incoming.map(row)}</ul></>}
      {active.length > 0 && <><h3 className="ec-riv-sub">Active</h3><ul className="ec-chal-list">{active.map(row)}</ul></>}
      {outgoing.length > 0 && <><h3 className="ec-riv-sub">Requests you sent</h3><ul className="ec-chal-list">{outgoing.map(row)}</ul></>}
      {past.length > 0 && <><h3 className="ec-riv-sub">Past</h3><ul className="ec-chal-list">{past.map(row)}</ul></>}
    </section>
  );
}
