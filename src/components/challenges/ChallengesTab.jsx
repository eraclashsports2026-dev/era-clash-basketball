// ── My EraClash → Challenges ──────────────────────────────────────────────────
// Phase 9C. CREATED (with every response), ACCEPTED (in progress) and COMPLETED
// (the comparison), all read through the server for the verified account. Not
// a feed: rows, dates, outcomes, one REVOKE and one COPY LINK per challenge.
import { useCallback, useEffect, useState } from "react";
import { listChallengesRequest, revokeChallengeRequest, challengeLink, copyText } from "../../challenges/client.js";
import { CHALLENGE_EVENTS } from "../../challenges/contract.js";
import { track } from "../../analytics.js";

const signed = (n) => (n == null ? "—" : n > 0 ? `+${n}` : String(n));
const dateOf = (iso) => { try { return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"; } catch { return "—"; } };
const OUT = { win: "Won", loss: "Lost", tie: "Tied" };
const CHAL = (o, name) => ({ recipient: `beat ${name}'s Clash`, creator: `${name}'s Clash holds`, tie: "tie" }[o] || "—");
const STATUS_WORD = { open: "Open", expired: "Expired", revoked: "Withdrawn", unavailable: "Unavailable" };

export default function ChallengesTab({ accessToken, displayName = "You", onOpenResult }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!accessToken) { setLoading(false); return; }
    setLoading(true);
    try { const r = await listChallengesRequest({ accessToken }); setData(r.status === "ok" ? r : null); if (r.status !== "ok") setNotice("Challenges could not be loaded just now."); }
    catch { setNotice("Challenges could not be loaded just now."); }
    setLoading(false);
  }, [accessToken]);
  useEffect(() => { load(); }, [load]);

  const copy = async (code) => { const ok = await copyText(challengeLink(code)); track(CHALLENGE_EVENTS.LINK_COPIED, { challengeVersion: "1.0.0", success: ok, entryPoint: "my_eraclash" }); setNotice(ok ? `Link for ${code} copied.` : "Copy failed."); };
  const revoke = async (code) => {
    if (!window.confirm(`Withdraw challenge ${code}? No one new can start it. Completed attempts stay in history.`)) return;
    try {
      const r = await revokeChallengeRequest({ code, accessToken });
      track(CHALLENGE_EVENTS.REVOKED, { challengeVersion: "1.0.0", success: r.status === "revoked" || r.status === "already_revoked", ...(r.status === "revoked" ? {} : { failureCode: r.status }) });
      setNotice(r.status === "revoked" ? `Challenge ${code} withdrawn.` : r.status === "already_revoked" ? "Already withdrawn." : "The challenge could not be withdrawn.");
      load();
    } catch { setNotice("The challenge could not be withdrawn."); }
  };

  if (loading) return <div className="ec-me-card"><p className="ec-me-muted">Loading challenges…</p></div>;
  const created = data?.created || [], accepted = data?.accepted || [];
  const completed = accepted.filter((a) => a.status === "completed");
  const inProgress = accepted.filter((a) => a.status !== "completed");

  return (
    <div className="ec-chal-tab">
      <output className="ec-chal-feedback" aria-live="polite">{notice}</output>

      <section className="ec-me-card" aria-labelledby="ec-chal-created">
        <h2 id="ec-chal-created" className="ec-me-section">Created</h2>
        {created.length === 0 ? <p className="ec-me-muted">No challenges yet. Finish a Chaos Clash and press CHALLENGE THIS CHAOS.</p> : (
          <ul className="ec-chal-list">
            {created.map((c) => (
              <li key={c.code} className="ec-chal-row" data-status={c.status}>
                <div className="ec-chal-row-head">
                  <div><b className="ec-chal-code-v">{c.code}</b> <span className="ec-chal-status" data-status={c.status}>{STATUS_WORD[c.status] || c.status}</span></div>
                  <div className="ec-me-muted">Created {dateOf(c.createdAt)} · {c.status === "open" ? `open until ${dateOf(c.expiresAt)}` : c.status === "revoked" ? `withdrawn ${dateOf(c.revokedAt)}` : `expired ${dateOf(c.expiresAt)}`}</div>
                </div>
                <div className="ec-chal-row-line">Your result <b>{c.creatorScore.gold}–{c.creatorScore.blue}</b> · {OUT[c.creatorOutcome]} · performance {signed(c.creatorPerformance)}{c.era ? ` · era ${c.era}` : ""}</div>
                <div className="ec-chal-row-line"><b>{c.responses.length}</b> {c.responses.length === 1 ? "response" : "responses"}</div>
                {c.responses.length > 0 && (
                  <ul className="ec-chal-responses" aria-label={`Responses to ${c.code}`}>
                    {c.responses.map((r, i) => (
                      <li key={i} className="ec-chal-response">
                        <span className="ec-chal-resp-name">{r.name}</span>
                        {r.status === "completed" ? (
                          <span>{r.score.gold}–{r.score.blue} · {OUT[r.outcome]} · {signed(r.performance)} · <b data-outcome={r.challengeOutcome}>{r.challengeOutcome === "recipient" ? "they won the challenge" : r.challengeOutcome === "creator" ? "your Clash holds" : "tie"}</b> · {dateOf(r.completedAt)}</span>
                        ) : <span className="ec-me-muted">{r.status === "started" ? "in progress" : r.status} · {dateOf(r.startedAt)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="ec-chal-row-actions">
                  {c.status === "open" && <button type="button" className="ec-chal-btn" onClick={() => copy(c.code)}>COPY LINK</button>}
                  {c.status === "open" && <button type="button" className="ec-chal-btn ec-chal-btn--quiet" onClick={() => revoke(c.code)}>REVOKE CHALLENGE</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ec-me-card" aria-labelledby="ec-chal-accepted">
        <h2 id="ec-chal-accepted" className="ec-me-section">Accepted</h2>
        {inProgress.length === 0 ? <p className="ec-me-muted">No challenge in progress.</p> : (
          <ul className="ec-chal-list">
            {inProgress.map((a, i) => (
              <li key={i} className="ec-chal-row">
                <div className="ec-chal-row-head"><div><b>{a.creatorName}</b> · {a.code || "—"} <span className="ec-chal-status" data-status={a.challengeStatus}>{STATUS_WORD[a.challengeStatus] || a.challengeStatus}</span></div><div className="ec-me-muted">Started {dateOf(a.startedAt)}</div></div>
                <div className="ec-chal-row-line">Their result <b>{a.creatorScore ? `${a.creatorScore.gold}–${a.creatorScore.blue}` : "—"}</b>{a.era ? ` · era ${a.era}` : ""} · your attempt {a.status}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ec-me-card" aria-labelledby="ec-chal-completed">
        <h2 id="ec-chal-completed" className="ec-me-section">Completed</h2>
        {completed.length === 0 ? <p className="ec-me-muted">No completed challenges yet. Open a friend's link to accept one.</p> : (
          <ul className="ec-chal-list">
            {completed.map((a, i) => (
              <li key={i} className="ec-chal-row" data-outcome={a.challengeOutcome}>
                <div className="ec-chal-row-head"><div><b>{a.creatorName}</b> · {a.code || "—"}</div><div className="ec-me-muted">Completed {dateOf(a.completedAt)}</div></div>
                <div className="ec-chal-row-line">Their result <b>{a.creatorScore.gold}–{a.creatorScore.blue}</b> ({OUT[a.creatorOutcome]}, {signed(a.original?.creatorPerformance)}) · your result <b>{a.yourScore.gold}–{a.yourScore.blue}</b> ({OUT[a.yourOutcome]}, {signed(a.yourPerformance)})</div>
                <div className="ec-chal-row-line"><b className="ec-chal-outcome" data-outcome={a.challengeOutcome}>{a.challengeOutcome === "recipient" ? `You ${CHAL("recipient", a.creatorName)}` : a.challengeOutcome === "creator" ? CHAL("creator", a.creatorName) : "Tie"}</b>{a.era ? ` · era ${a.era}` : ""}</div>
                {a.original?.creatorRoster?.length > 0 && <div className="ec-me-muted">Their five: {a.original.creatorRoster.map((p) => p.name || p.id).join(" · ")}{a.original.creatorCoach?.name ? ` · coach ${a.original.creatorCoach.name}` : ""}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
