// ── The invitation a link opens to ───────────────────────────────────────────
// Phase 9C. Who challenged you (display name only), the mode, the headline
// result and the era; one dominant action. Unknown, expired and revoked codes
// are honest, generic states. A guest may accept within the ordinary run
// budget and is told the run will be spent; an account keeps the response.
import { useEffect, useState } from "react";
import { viewChallengeRequest, acceptChallengeRequest, anyChallengeRun } from "../../challenges/client.js";
import { CHALLENGE_EVENTS } from "../../challenges/contract.js";
import { track } from "../../analytics.js";

const ERA_LABEL = (v) => (v ? `${v}` : "—");

export default function ChallengeInvite({ code, accessToken, tier = "GUEST", signedIn = false, onAccepted, onSignIn, onBack, onViewMine }) {
  const [view, setView] = useState({ step: "loading" });
  const [accepting, setAccepting] = useState(false);
  const [err, setErr] = useState("");
  const authState = signedIn ? "account" : "guest";

  useEffect(() => {
    let alive = true;
    setView({ step: "loading" });
    viewChallengeRequest({ code, accessToken }).then((v) => {
      if (!alive) return;
      setView({ step: "ready", data: v });
      track(CHALLENGE_EVENTS.OPENED, { challengeVersion: v.challengeVersion || "1.0.0", authState, status: v.status || "unavailable", mode: "chaos" });
      if (v.status === "expired") track(CHALLENGE_EVENTS.EXPIRED_VIEWED, { challengeVersion: v.challengeVersion || "1.0.0", authState });
    }).catch(() => { if (alive) setView({ step: "ready", data: { status: "unavailable" } }); });
    return () => { alive = false; };
  }, [code, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    setAccepting(true); setErr("");
    track(CHALLENGE_EVENTS.ACCEPT_STARTED, { challengeVersion: "1.0.0", authState, entryPoint: "invitation" });
    try {
      const r = await acceptChallengeRequest({ code, accessToken, tier });
      if (r.status === "started" || r.status === "resumed") {
        track(CHALLENGE_EVENTS.ATTEMPT_STARTED, { challengeVersion: "1.0.0", authState, success: true, status: r.status });
        onAccepted?.({ chaosRunId: r.chaosRunId, code, creatorName: r.creatorName || view.data?.creatorName || "" , resumed: r.status === "resumed" });
        return;
      }
      track(CHALLENGE_EVENTS.ATTEMPT_STARTED, { challengeVersion: "1.0.0", authState, success: false, failureCode: r.status || "network" });
      if (r.gated) { setErr("You have used your free Chaos runs. Create a free account to accept this challenge."); }
      else setErr(acceptCopy(r.status));
      if (["expired", "revoked", "unavailable", "already_attempted"].includes(r.status)) setView((v) => ({ ...v, data: { ...v.data, status: r.status === "already_attempted" ? v.data.status : r.status } }));
    } catch { setErr("The challenge could not be started. Nothing was spent — try again."); }
    setAccepting(false);
  };

  const d = view.data;
  const status = d?.status;
  const attempt = d?.viewer?.attempt || null;
  const isCreator = !!d?.viewer?.isCreator;
  const activeRun = anyChallengeRun();

  return (
    <main className="ec-chal-invite" aria-labelledby="ec-chal-invite-title">
      <div className="ec-chal-kicker">ERACLASH CHALLENGE</div>
      {view.step === "loading" && <p className="ec-chal-body" role="status">Opening the challenge…</p>}

      {view.step === "ready" && status === "unavailable" && (
        <>
          <h1 id="ec-chal-invite-title" className="ec-chal-h1">This challenge is not available</h1>
          <p className="ec-chal-body">The link may be wrong, or the challenge is no longer offered. Nothing about anyone is shown here.</p>
          <div className="ec-chal-actions"><button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={onBack}>PLAY CHAOS CLASH</button></div>
        </>
      )}
      {view.step === "ready" && (status === "expired" || status === "revoked") && (
        <>
          <h1 id="ec-chal-invite-title" className="ec-chal-h1">{status === "expired" ? "This challenge has expired" : "This challenge was withdrawn"}</h1>
          <p className="ec-chal-body" role="status">{d.creatorName}'s Clash — {d.creatorScore.gold}–{d.creatorScore.blue}, era {ERA_LABEL(d.era)}. {status === "expired" ? "Challenges stay open for 30 days." : "The creator withdrew it."} {attempt?.status === "completed" ? "Your completed attempt is kept in My EraClash." : "No new attempt can start."}</p>
          <div className="ec-chal-actions"><button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={onBack}>PLAY CHAOS CLASH</button></div>
        </>
      )}

      {view.step === "ready" && status === "open" && (
        <>
          <h1 id="ec-chal-invite-title" className="ec-chal-h1"><span className="ec-chal-avatar" aria-hidden="true">{d.creatorInitials}</span>{d.creatorName} challenged you to beat their Chaos Clash.</h1>
          <dl className="ec-chal-facts">
            <div><dt>CREATOR RESULT</dt><dd><b className="ec-chal-score">{d.creatorScore.gold}–{d.creatorScore.blue}</b> <span>{outcomeWord(d.creatorOutcome)}</span></dd></div>
            <div><dt>ERA</dt><dd>{ERA_LABEL(d.era)}{d.eraCustom ? " · CUSTOM" : ""}</dd></div>
            <div><dt>MODE</dt><dd>Chaos Clash · same opening rolls, your decisions</dd></div>
            <div><dt>STATUS</dt><dd>Open until {dateOf(d.expiresAt)} · {d.responses} {d.responses === 1 ? "response" : "responses"}</dd></div>
          </dl>
          <p className="ec-chal-body">You get the same starting five on both sides and the same rules. Hold who you want, adapt to the era, choose a coach, run the Clash — then the two results are compared: win or loss first, margin as the tie-break.</p>

          {isCreator ? (
            <div className="ec-chal-actions">
              <p className="ec-chal-body">This is your challenge. Responses appear in My EraClash → Challenges.</p>
              <button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={onViewMine}>OPEN MY CHALLENGES</button>
            </div>
          ) : attempt?.status === "completed" ? (
            <div className="ec-chal-actions">
              <p className="ec-chal-body" role="status">You have completed this challenge: {attempt.score.gold}–{attempt.score.blue} ({outcomeWord(attempt.outcome)}), {challengeWord(attempt.challengeOutcome, d.creatorName)}.</p>
              <button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={onViewMine}>VIEW IN MY ERACLASH</button>
            </div>
          ) : (
            <>
              {!signedIn && (
                <p className="ec-chal-note">Playing as a guest spends one of your free Chaos runs. Sign in or create a free account to keep your response in your career.</p>
              )}
              {activeRun && activeRun.code !== code && <p className="ec-chal-note">Accepting replaces the Chaos Clash you have in progress.</p>}
              <div className="ec-chal-actions">
                <button type="button" className="ec-chal-btn ec-chal-btn--primary ec-chal-btn--big" onClick={accept} disabled={accepting}>
                  {accepting ? "STARTING…" : attempt?.status === "started" ? "CONTINUE CHALLENGE" : "ACCEPT CHALLENGE"}
                </button>
                {!signedIn && <button type="button" className="ec-chal-btn" onClick={onSignIn}>CREATE FREE ACCOUNT / SIGN IN</button>}
              </div>
              <output className="ec-chal-feedback" aria-live="polite">{err}</output>
            </>
          )}
        </>
      )}
    </main>
  );
}
const outcomeWord = (o) => ({ win: "Team Gold victory", loss: "Team Gold loss", tie: "tie" }[o] || "");
const challengeWord = (o, name) => ({ recipient: `you beat ${name}'s Clash`, creator: `${name}'s Clash holds`, tie: "a tie" }[o] || "");
const dateOf = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };
const acceptCopy = (s) => ({
  unavailable: "This challenge is not available.", expired: "This challenge has expired.", revoked: "This challenge was withdrawn.",
  already_attempted: "You have already made your official attempt at this challenge.", own_challenge: "You cannot accept your own challenge.",
  not_configured: "Challenges are not available on this build.",
}[s] || "The challenge could not be started. Nothing was spent — try again.");
