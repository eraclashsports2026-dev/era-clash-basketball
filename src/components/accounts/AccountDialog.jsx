// ── Sign in / create a free account ─────────────────────────────────────────
// One dialog, two real routes to an account: Google, or an email one-time code.
// No password field exists anywhere in this product, so there is no password to
// store, leak or reset. The email is used to authenticate and is never shown as
// a public identity.
//
// A guest is never sent here to play Chaos Clash. The dialog is opened from the
// header, from the Dream Matchup gate, and from the postgame Save This Clash
// panel — and it always remembers where the visitor was.
import { useEffect, useRef, useState } from "react";
import { T, R } from "../../theme.js";
import { withProvider, provider } from "../../accounts/provider.js";
import { cloudAccountsStatus, safeReturnPath } from "../../accounts/config.js";
import { adopt } from "../../accounts/accountState.js";
import { track } from "../../analytics.js";

const MESSAGE = {
  RATE_LIMITED: "Too many attempts just now. Try again in a minute.",
  CODE_INVALID_OR_EXPIRED: "That code is not valid any more. Ask for a new one.",
  EMAIL_INVALID: "That email address does not look right.",
  NOT_PERMITTED: "That is not available on this account.",
  NETWORK: "The network dropped out. Try again.",
  PROVIDER_ERROR: "Sign-in is unavailable for a moment. Try again.",
  CLOUD_ACCOUNTS_DISABLED: "Accounts are not switched on in this build yet.",
  LINK_OPENED_ELSEWHERE: "That link has to be opened in this browser. Enter the code from the email instead — that works anywhere.",
};

export default function AccountDialog({ open, entryPoint = "header", returnTo = "/play", intent = "signup", onClose, onSignedIn }) {
  const [stage, setStage] = useState("choose");   // choose | code | working
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState(null);
  // Only offer a method the project actually has switched on. A dead
  // "Continue with Google" is worse than no Google at all.
  const [methods, setMethods] = useState({ google: false, email: true });
  const dialogRef = useRef(null);
  const firstRef = useRef(null);
  const status = cloudAccountsStatus();
  const available = !!provider();

  useEffect(() => {
    if (!open) { setStage("choose"); setCode(""); setFailure(null); return undefined; }
    track("account_gate_shown", { entryPoint, intent });
    let alive = true;
    withProvider((p) => p.capabilities?.() ?? { google: false, email: true }, { google: false, email: true })
      .then((c) => { if (alive) setMethods({ google: !!c?.google, email: c?.email !== false }); })
      .catch(() => { /* email stays available: it is the floor */ });
    firstRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab") return;
      // A modal keeps focus inside itself.
      const stops = dialogRef.current?.querySelectorAll("button, input, a[href]");
      if (!stops?.length) return;
      const list = [...stops].filter((el) => !el.disabled);
      const i = list.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [open, entryPoint, intent, onClose]);

  if (!open) return null;
  const dest = safeReturnPath(returnTo);
  const fail = (e) => { setFailure(e?.code || "PROVIDER_ERROR"); setStage(stage === "code" ? "code" : "choose"); };

  const google = async () => {
    setFailure(null); setStage("working");
    track("account_signup_started", { authMethod: "google", entryPoint });
    try { await withProvider((p) => p.signInWithGoogle(dest)); } catch (e) { fail(e); }
  };
  const sendCode = async () => {
    setFailure(null); setStage("working");
    track("account_signup_started", { authMethod: "email", entryPoint });
    try { await withProvider((p) => p.sendEmailCode(email, dest)); setStage("code"); } catch (e) { fail(e); }
  };
  const verify = async () => {
    setFailure(null);
    try {
      const session = await withProvider((p) => p.verifyEmailCode(email, code));
      if (!session) throw Object.assign(new Error("CODE_INVALID_OR_EXPIRED"), { code: "CODE_INVALID_OR_EXPIRED" });
      await adopt(session);
      track("account_signin_completed", { authMethod: "email", entryPoint });
      onSignedIn?.(session);
    } catch (e) { fail(e); }
  };

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{
      position: "fixed", inset: 0, zIndex: 120, display: "grid", placeItems: "center",
      background: "var(--ec-a-scrim, rgba(3,6,11,0.86))", padding: 16,
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ec-auth-title" data-account-dialog="true" style={{
        width: "min(420px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 22, borderRadius: R.lg,
        border: `1px solid ${T.border}`, background: T.bgCard, color: T.text,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>
          {intent === "signin" ? "SIGN IN" : "FREE ACCOUNT"}
        </div>
        <h2 id="ec-auth-title" style={{ margin: "8px 0 6px", fontSize: 21 }}>
          {intent === "signin" ? "Sign in to EraClash" : "Create your free EraClash account"}
        </h2>
        <p style={{ color: T.textDim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px" }}>
          Keep your Clashes, your rosters and your career across every device. No payment, ever, for a free account.
        </p>

        {!available && (
          <div role="status" style={{ padding: 12, borderRadius: R.sm, border: `1px solid ${T.border}`, background: T.bg, fontSize: 13, lineHeight: 1.55, color: T.textDim }}>
            {status.reason === "ANON_KEY_MALFORMED"
              ? "Accounts are configured but the provider key is not valid, so sign-in is switched off rather than shown as broken. Chaos Clash and the Daily are open to everyone."
              : "Accounts are not switched on in this build yet. Chaos Clash and the Daily are open to everyone in the meantime."}
            <div style={{ fontSize: 11.5, marginTop: 6, color: T.textMuted }}>Status: {status.reason}</div>
          </div>
        )}

        {available && stage !== "code" && (
          <>
            {methods.google && (
              <>
                <button ref={firstRef} onClick={google} disabled={stage === "working"} style={primary}>
                  CONTINUE WITH GOOGLE
                </button>
                <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0", color: T.textMuted, fontSize: 11 }}>
                  <span style={{ flex: 1, height: 1, background: T.border }} />OR<span style={{ flex: 1, height: 1, background: T.border }} />
                </div>
              </>
            )}
            <label htmlFor="ec-auth-email" style={label}>Email address</label>
            <input id="ec-auth-email" ref={methods.google ? undefined : firstRef} type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
              aria-describedby={failure ? "ec-auth-error" : undefined} style={input} />
            <button onClick={sendCode} disabled={stage === "working" || !/.+@.+\..+/.test(email)} style={methods.google ? secondary : primary}>
              {stage === "working" ? "SENDING…" : "CONTINUE WITH EMAIL"}
            </button>
          </>
        )}

        {available && stage === "code" && (
          <>
            <p style={{ fontSize: 13, color: T.textDim, margin: "0 0 12px", lineHeight: 1.55 }}>
              We sent a one-time code to <b>{email}</b>. Enter it here — that works on any device.
              The link in the same message only works in this browser.
            </p>
            <label htmlFor="ec-auth-code" style={label}>One-time code</label>
            <input id="ec-auth-code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={8}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-describedby={failure ? "ec-auth-error" : undefined} style={input} />
            <button onClick={verify} disabled={code.length < 6} style={primary}>SIGN IN</button>
            <button onClick={() => { setStage("choose"); setCode(""); }} style={quiet}>USE A DIFFERENT ADDRESS</button>
          </>
        )}

        <div aria-live="polite" style={{ minHeight: 18 }}>
          {failure && (
            <p id="ec-auth-error" role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ec-a-red, #e06060)" }}>
              {MESSAGE[failure] || MESSAGE.PROVIDER_ERROR}
            </p>
          )}
        </div>

        <button onClick={onClose} style={quiet}>NOT NOW</button>
        <p style={{ fontSize: 11.5, color: T.textMuted, marginTop: 12, lineHeight: 1.5 }}>
          Your email is only used to sign you in. It is never shown to other players.
        </p>
      </div>
    </div>
  );
}

const primary = {
  width: "100%", minHeight: 48, borderRadius: R.sm, cursor: "pointer", marginTop: 4,
  fontWeight: 900, fontSize: 14, letterSpacing: 0.8,
  border: `1px solid ${T.goldBorder}`, background: T.gold, color: T.onGold,
};
const secondary = {
  width: "100%", minHeight: 48, borderRadius: R.sm, cursor: "pointer", marginTop: 8,
  fontWeight: 800, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text,
};
const quiet = {
  width: "100%", minHeight: 44, marginTop: 8, borderRadius: R.sm, cursor: "pointer",
  fontWeight: 800, fontSize: 12.5, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim,
};
const label = { display: "block", textAlign: "left", fontSize: 12, fontWeight: 700, color: T.textDim, marginBottom: 5 };
const input = {
  width: "100%", boxSizing: "border-box", minHeight: 46, borderRadius: R.sm, padding: "0 12px", fontSize: 15,
  border: `1px solid ${T.border}`, background: T.bg, color: T.text, marginBottom: 10,
};
