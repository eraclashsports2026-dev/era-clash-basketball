// ── /auth/callback ──────────────────────────────────────────────────────────
// Where the provider returns after Google or an email link. It does three
// things and nothing else:
//
//   1. exchange the PKCE code for a session (the code, not a token, is what
//      travelled through the URL)
//   2. scrub the address bar immediately, so no code or token is left in
//      history, in a bookmark or in a screenshot
//   3. send the visitor back to exactly where they were — but only to a
//      same-origin path this product owns
//
// An active Chaos run and a result waiting to be saved both survive, because
// neither is touched here: they live in localStorage and in the App's state,
// and this route hands control back to the App rather than reloading it.
import { useEffect, useRef, useState } from "react";
import { T, R } from "../../theme.js";
import { withProvider, provider } from "../../accounts/provider.js";
import { safeReturnPath } from "../../accounts/config.js";
import { adopt } from "../../accounts/accountState.js";
import { track } from "../../analytics.js";

export default function AuthCallback({ onDone }) {
  const [state, setState] = useState("working");   // working | failed
  const [failure, setFailure] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const url = window.location.href;
    const params = new URLSearchParams(window.location.search);
    const next = safeReturnPath(params.get("next"), "/play");
    // The address bar is cleaned BEFORE the exchange, so the code cannot be
    // re-shared even if the exchange is slow or fails.
    try { window.history.replaceState({}, "", next); } catch { /* ignore */ }

    const providerError = params.get("error") || params.get("error_description");
    if (providerError) {
      setFailure("PROVIDER_ERROR"); setState("failed");
      track("account_signin_completed", { success: false, failureCode: "PROVIDER_ERROR" });
      return;
    }
    if (!provider()) { setFailure("CLOUD_ACCOUNTS_DISABLED"); setState("failed"); return; }

    // A link can arrive carrying either proof, and they behave differently:
    //   token_hash — self-contained, so it signs you in in ANY browser
    //   code       — PKCE, so it only completes in the browser that asked
    // Prefer the token hash when it is there, because it is the one that
    // survives forwarding the email to a phone.
    const tokenHash = params.get("token_hash") || params.get("token");
    const otpType = params.get("type");

    (async () => {
      try {
        const session = tokenHash
          ? await withProvider((p) => p.verifyTokenHash(tokenHash, otpType))
          : await withProvider((p) => p.exchangeCodeForSession(url));
        if (!session) throw Object.assign(new Error("CODE_INVALID_OR_EXPIRED"), { code: "CODE_INVALID_OR_EXPIRED" });
        await adopt(session);
        track("account_signin_completed", { success: true, authMethod: session.authMethod });
        onDone?.({ session, next });
      } catch (e) {
        setFailure(e?.code || "PROVIDER_ERROR");
        setState("failed");
        track("account_signin_completed", { success: false, failureCode: e?.code || "PROVIDER_ERROR" });
      }
    })();
  }, [onDone]);

  return (
    <main aria-labelledby="ec-auth-cb-title" style={{ maxWidth: 460, margin: "0 auto", padding: "48px 16px" }}>
      <div style={{ padding: 22, borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.bgCard, textAlign: "center" }}>
        <h1 id="ec-auth-cb-title" style={{ margin: "0 0 8px", fontSize: 20 }}>
          {state === "working" ? "Signing you in…" : "That sign-in did not finish"}
        </h1>
        <div role="status" aria-live="polite" style={{ fontSize: 13.5, color: T.textDim, lineHeight: 1.6 }}>
          {state === "working"
            ? "One moment. Your Clash and your place in the game are being kept."
            : failure === "CLOUD_ACCOUNTS_DISABLED"
              ? "Accounts are not switched on in this build yet. Guest play is unaffected."
              : failure === "LINK_OPENED_ELSEWHERE"
                ? "This link only works in the browser that asked for it. Your account is fine — go back, enter your email again, and type the code from the message instead. A code works on any device."
                : "The sign-in link was already used or has expired. Nothing was lost — try again from the header."}
        </div>
        {state === "failed" && (
          <button onClick={() => onDone?.({ session: null, next: "/play" })} style={{
            width: "100%", minHeight: 48, marginTop: 16, borderRadius: R.sm, cursor: "pointer",
            fontWeight: 900, fontSize: 14, border: `1px solid ${T.goldBorder}`, background: T.gold, color: T.onGold,
          }}>BACK TO THE LOBBY</button>
        )}
      </div>
    </main>
  );
}
