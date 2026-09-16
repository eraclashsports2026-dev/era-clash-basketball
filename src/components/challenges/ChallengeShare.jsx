// ── CHALLENGE THIS CHAOS → the share sheet ───────────────────────────────────
// Phase 9C. On a finished Chaos Clash a signed-in creator turns the result into
// a governed challenge: one press creates it (or returns the one already made
// for this result), then a clean sheet offers COPY LINK, the code and SHARE.
// A guest sees the same button and is offered an account: a challenge binds to
// a career, and a guest has none to bind to. The link carries the code only.
import { useEffect, useState } from "react";
import { createChallengeRequest, challengeLink, shareText, copyText, canNativeShare } from "../../challenges/client.js";
import { CHALLENGE_EVENTS } from "../../challenges/contract.js";
import { track } from "../../analytics.js";
// Clash Cards + Rivalries V1: the compact card composer rides this surface (no
// second large postgame action), and a Rivalry's CHALLENGE AGAIN labels the step.
import CardComposer from "../cards/CardComposer.jsx";
import { rivalryContext } from "../../rivalries/client.js";

export default function ChallengeShare({ chaosRunId, accessToken, onNeedAccount, entryPoint = "result", socialEnabled = false }) {
  const [state, setState] = useState({ step: "idle" });   // idle | creating | created | error
  const [copied, setCopied] = useState("");
  const [composer, setComposer] = useState(false);
  useEffect(() => { setState({ step: "idle" }); setCopied(""); setComposer(false); }, [chaosRunId]);
  if (!chaosRunId) return null;
  const rivalry = socialEnabled ? rivalryContext() : null;
  const cardButton = socialEnabled
    ? <button type="button" className="ec-chal-btn ec-chal-btn--quiet" aria-expanded={composer} onClick={() => setComposer((v) => !v)}>{composer ? "HIDE CARD" : "SHARE A CARD"}</button>
    : null;
  const composerEl = socialEnabled && composer
    ? <CardComposer chaosRunId={chaosRunId} accessToken={accessToken} challengeCode={state.step === "created" ? state.code : null} challengeUrl={state.step === "created" ? state.url : null} onClose={() => setComposer(false)} entryPoint={entryPoint} />
    : null;

  const create = async () => {
    if (!accessToken) { track(CHALLENGE_EVENTS.CREATED, { challengeVersion: "1.0.0", authState: "guest", entryPoint, success: false, failureCode: "not_signed_in" }); onNeedAccount?.(); return; }
    setState({ step: "creating" });
    try {
      const r = await createChallengeRequest({ chaosRunId, accessToken });
      const ok = r.status === "created" || r.status === "already_created";
      track(CHALLENGE_EVENTS.CREATED, { challengeVersion: "1.0.0", authState: "account", entryPoint, success: ok, ...(ok ? {} : { failureCode: r.status || "network" }) });
      setState(ok ? { step: "created", code: r.code, url: challengeLink(r.code), existing: r.status === "already_created" } : { step: "error", code: r.status });
    } catch {
      track(CHALLENGE_EVENTS.CREATED, { challengeVersion: "1.0.0", authState: "account", entryPoint, success: false, failureCode: "network" });
      setState({ step: "error", code: "network" });
    }
  };
  const copy = async () => {
    const ok = await copyText(state.url);
    track(CHALLENGE_EVENTS.LINK_COPIED, { challengeVersion: "1.0.0", success: ok });
    setCopied(ok ? "Link copied." : "Copy failed — select the link and copy it.");
  };
  const share = async () => {
    track(CHALLENGE_EVENTS.SHARE_INVOKED, { challengeVersion: "1.0.0", success: canNativeShare() });
    if (!canNativeShare()) { await copy(); return; }
    try { await navigator.share({ title: "EraClash challenge", text: shareText(), url: state.url }); } catch { /* the user dismissed the sheet */ }
  };

  if (state.step === "created") {
    return (
      <section className="ec-chal-share" aria-labelledby="ec-chal-share-title">
        <div className="ec-chal-kicker">{state.existing ? "CHALLENGE READY" : "CHALLENGE CREATED"}</div>
        <h3 id="ec-chal-share-title" className="ec-chal-title">{rivalry?.opponentName ? `For your Rivalry with ${rivalry.opponentName}` : "Think you can beat this Clash?"}</h3>
        {rivalry && <p className="ec-chal-body">Send this link to {rivalry.opponentName || "your rival"}. Once they complete it, the comparison counts in your Rivalry record. It works like any Challenge link — issuing it is your call.</p>}
        <p className="ec-chal-body">Anyone with the link gets the same opening rolls and rules, makes their own decisions, and is compared against this result.</p>
        <div className="ec-chal-code" aria-label={`Challenge code ${state.code}`}><span className="ec-chal-code-k">CODE</span><span className="ec-chal-code-v">{state.code}</span></div>
        <div className="ec-chal-actions">
          <button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={copy}>COPY LINK</button>
          <button type="button" className="ec-chal-btn" onClick={share}>{canNativeShare() ? "SHARE" : "SHARE (COPIES LINK)"}</button>
          {cardButton}
        </div>
        <output className="ec-chal-feedback" aria-live="polite">{copied}</output>
        <div className="ec-chal-link" aria-hidden="true">{state.url}</div>
        {composerEl}
      </section>
    );
  }
  return (
    <div className="ec-chal-cta-row">
      {rivalry?.opponentName && <div className="ec-chal-kicker">FOR YOUR RIVALRY WITH {String(rivalry.opponentName).toUpperCase()}</div>}
      <div className="ec-chal-actions" style={{ justifyContent: "center", marginTop: 0 }}>
        <button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={create} disabled={state.step === "creating"}>
          {state.step === "creating" ? "CREATING…" : "CHALLENGE THIS CHAOS"}
        </button>
        {cardButton}
      </div>
      {!accessToken && <span className="ec-chal-hint">Sign in to challenge a friend — the challenge lives in your career.</span>}
      {state.step === "error" && <output className="ec-chal-feedback" aria-live="polite">{errorCopy(state.code)}</output>}
      {composerEl}
    </div>
  );
}
const errorCopy = (code) => ({
  not_eligible: "Only a finished Chaos Clash can be challenged.",
  not_simulated: "Run the Clash first — a challenge needs a result.",
  not_your_result: "This result was played in another browser; challenges come from your own.",
  not_found: "This Clash has aged out and can no longer be challenged.",
  not_configured: "Challenges are not available on this build.",
}[code] || "The challenge could not be created. Nothing else changed — try again.");
