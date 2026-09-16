// ── SHARE A CARD — the compact composer on the postgame sharing surface ──────
// One reusable card system, two uses the owner chooses between explicitly:
// RESULT CARD (a recap of this Clash) and CHALLENGE INVITATION (attached to
// the governed Challenge already created for this result). A preview is shown
// before anything leaves; attribution defaults to a neutral label and the
// owner may add their display name for THIS export. Share uses the native
// sheet when the browser can share files, else saves the PNG; the Challenge
// link has its own copy. Nothing here mints a Challenge — that is the
// existing idempotent CHALLENGE THIS CHAOS step — and nothing here reports
// "sent": a share sheet opening proves nothing about the friend.
import { useEffect, useRef, useState } from "react";
import { resultCardRequest, invitationCardRequest, canvasToPngFile, shareFile, saveFile, canShareFile } from "../../cards/client.js";
import { resultCardModel, invitationCardModel, cardAltText, shareTextFor, CARD_KINDS, CARD_EVENTS, CARD_WIDTH, CARD_HEIGHT } from "../../cards/contract.js";
import { renderCard } from "../../cards/render.js";
import { copyText } from "../../challenges/client.js";
import { track } from "../../analytics.js";

const ERR = {
  not_found: "This Clash has aged out and cannot be drawn.", not_your_result: "This result was played in another browser.",
  not_simulated: "Run the Clash first — a card needs a result.", unavailable: "That Challenge is no longer available.",
  expired: "That Challenge has expired; its invitation cannot be drawn.", revoked: "That Challenge was withdrawn; its invitation cannot be drawn.",
  not_yours: "Only the Challenge's creator can draw its invitation.", export_failed: "The image could not be exported. Nothing else changed — try again.",
};

export default function CardComposer({ chaosRunId, accessToken = null, challengeCode = null, challengeUrl = null, onClose, entryPoint = "result" }) {
  const [kind, setKind] = useState(CARD_KINDS.RESULT);
  const [withName, setWithName] = useState(false);
  const [payloads, setPayloads] = useState({});      // kind → server payload
  const [state, setState] = useState({ step: "loading" });   // loading | ready | error
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const fileSupport = useRef(null);
  const authState = accessToken ? "account" : "guest";

  useEffect(() => { track(CARD_EVENTS.OPENED, { cardVersion: "1.0.0", authState, kind: CARD_KINDS.RESULT }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the payload for the chosen kind, once per kind. The server builds it
  // from the authoritative record; the browser only draws it.
  useEffect(() => {
    let live = true;
    if (payloads[kind]) { setState({ step: "ready" }); return; }
    setState({ step: "loading" });
    const req = kind === CARD_KINDS.INVITATION ? invitationCardRequest({ code: challengeCode, accessToken }) : resultCardRequest({ chaosRunId, accessToken });
    req.then((r) => { if (!live) return; if (r.status === "ok" && r.card) { setPayloads((p) => ({ ...p, [kind]: r.card })); setState({ step: "ready" }); } else setState({ step: "error", code: r.status || "network" }); })
      .catch(() => live && setState({ step: "error", code: "network" }));
    return () => { live = false; };
  }, [kind, chaosRunId, challengeCode, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = payloads[kind];
  const model = payload ? (kind === CARD_KINDS.INVITATION ? invitationCardModel(payload, { includeName: withName }) : resultCardModel(payload, { includeName: withName })) : null;

  // Redraw the preview whenever the model changes (deterministic).
  useEffect(() => { if (model && canvasRef.current) renderCard(canvasRef.current, model); }, [model?.kind, model?.attribution, model?.score?.gold, model?.score?.blue, model?.code, model?.era]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportFile = async () => {
    if (!model || !canvasRef.current) throw new Error("export_failed");
    await renderCard(canvasRef.current, model);
    return canvasToPngFile(canvasRef.current, kind);
  };
  const share = async () => {
    setBusy(true); setNotice("");
    try {
      const file = await exportFile();
      const method = canShareFile(file) ? "native" : "save";
      track(CARD_EVENTS.SHARED, { cardVersion: "1.0.0", kind, method, withName, authState });
      if (method === "native") {
        const out = await shareFile(file, { text: shareTextFor(model), ...(kind === CARD_KINDS.INVITATION && model.url ? { url: model.url } : {}) });
        setNotice(out === "shared" ? "Share sheet closed. The image is only sent if you completed the share." : out === "cancelled" ? "Share cancelled. Nothing was sent." : out === "unsupported" ? "This browser cannot share images. Use SAVE IMAGE." : "Sharing failed. Nothing was sent — try SAVE IMAGE.");
        track(CARD_EVENTS.EXPORTED, { cardVersion: "1.0.0", kind, method, withName, success: out === "shared" });
      } else {
        const ok = saveFile(file);
        setNotice(ok ? "Image saved to your downloads." : ERR.export_failed);
        track(CARD_EVENTS.EXPORTED, { cardVersion: "1.0.0", kind, method: "save", withName, success: ok });
      }
    } catch { setNotice(ERR.export_failed); track(CARD_EVENTS.FAILED, { cardVersion: "1.0.0", kind, failureCode: "export_failed" }); }
    setBusy(false);
  };
  const save = async () => {
    setBusy(true); setNotice("");
    try { const ok = saveFile(await exportFile()); setNotice(ok ? "Image saved to your downloads." : ERR.export_failed); track(CARD_EVENTS.EXPORTED, { cardVersion: "1.0.0", kind, method: "save", withName, success: ok }); }
    catch { setNotice(ERR.export_failed); track(CARD_EVENTS.FAILED, { cardVersion: "1.0.0", kind, failureCode: "export_failed" }); }
    setBusy(false);
  };
  const copyLink = async () => { const ok = await copyText(challengeUrl || model?.url || ""); setNotice(ok ? "Challenge link copied." : "Copy failed — select the link and copy it."); };

  const nativeFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  const canInvite = !!challengeCode && !!accessToken;
  const nameAvailable = !!accessToken && !!(payload?.displayName || payload?.creatorName);

  return (
    <section className="ec-card-composer" aria-labelledby="ec-card-title" data-kind={kind}>
      <div className="ec-chal-row-head">
        <div><div className="ec-chal-kicker">SHARE A CARD</div><h3 id="ec-card-title" className="ec-card-title">Preview before anything leaves</h3></div>
        {onClose && <button type="button" className="ec-chal-btn ec-chal-btn--quiet" onClick={onClose} aria-label="Close the card composer">CLOSE</button>}
      </div>
      <div className="ec-card-kinds" role="tablist" aria-label="Card type">
        <button type="button" role="tab" className="ec-card-kind" aria-selected={kind === CARD_KINDS.RESULT} onClick={() => setKind(CARD_KINDS.RESULT)}>RESULT CARD</button>
        <button type="button" role="tab" className="ec-card-kind" aria-selected={kind === CARD_KINDS.INVITATION} disabled={!canInvite} onClick={() => canInvite && setKind(CARD_KINDS.INVITATION)}
          title={canInvite ? undefined : "Create the Challenge first — the invitation is attached to it."}>CHALLENGE INVITATION</button>
      </div>
      <p className="ec-card-help">{kind === CARD_KINDS.INVITATION
        ? "A spoiler-safe invitation: your score line, the era and the code. Never your five, your coach or the hidden rolls."
        : "A recap of this Clash: the score line, the outcome and the era. Rating, XP, rank and your five stay private."}</p>
      <div className="ec-card-preview-wrap">
        {state.step === "error" ? <p className="ec-chal-feedback" role="alert">{ERR[state.code] || "The card could not be prepared. Nothing else changed — try again."}</p> : null}
        <canvas ref={canvasRef} className="ec-card-preview" width={CARD_WIDTH} height={CARD_HEIGHT} role="img" aria-label={cardAltText(model)} data-ready={!!model} />
        {state.step === "loading" && <div className="ec-card-loading" aria-live="polite">Preparing your card…</div>}
      </div>
      {nameAvailable && (
        <label className="ec-card-toggle">
          <input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} />
          <span>Include my display name on this export</span>
        </label>
      )}
      <div className="ec-chal-actions">
        <button type="button" className="ec-chal-btn ec-chal-btn--primary" onClick={share} disabled={!model || busy}>{nativeFiles ? "SHARE IMAGE" : "SAVE IMAGE"}</button>
        {nativeFiles && <button type="button" className="ec-chal-btn" onClick={save} disabled={!model || busy}>SAVE IMAGE</button>}
        {kind === CARD_KINDS.INVITATION && <button type="button" className="ec-chal-btn" onClick={copyLink} disabled={!model}>COPY CHALLENGE LINK</button>}
      </div>
      <output className="ec-chal-feedback" aria-live="polite">{notice}</output>
      <p className="ec-card-fine">A saved image cannot be recalled once shared outside EraClash. Withdrawing a Challenge disables its link, not the picture. Official results stay on the server.</p>
    </section>
  );
}
