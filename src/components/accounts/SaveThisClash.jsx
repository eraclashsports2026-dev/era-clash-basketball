// ── "Save this Clash" ───────────────────────────────────────────────────────
// The postgame conversion panel, and the one place a guest is invited to make
// an account. Rules it obeys:
//
//   · it never covers the result — it sits under it, in the flow
//   · it is never a forced full-screen modal on a first postgame view
//   · dismissing it silences it for THIS result, not with a nag on the next paint
//   · a signed-in visitor sees the save state instead of an invitation
//
// When the visitor signs in from here, the App claims the result that is on
// screen: the game that convinced them is the first thing in their career.
import { useEffect, useRef, useState } from "react";
import { T, R } from "../../theme.js";
import { track } from "../../analytics.js";

const KEPT = ["Your roster", "Your coach", "Your era", "Your final result", "Your full game report", "Your EraClash career"];

export default function SaveThisClash({
  resultId, signedIn, saveState = "idle", accountsAvailable = true, onSignIn, onSaveAgain, onViewCareer,
}) {
  const [dismissed, setDismissed] = useState(false);
  const shownFor = useRef(null);

  // A new result re-opens the invitation once; the same result never nags again.
  useEffect(() => {
    if (!resultId || shownFor.current === resultId) return;
    shownFor.current = resultId;
    setDismissed(false);
  }, [resultId]);

  if (!resultId || dismissed) return null;

  if (signedIn) {
    const label = {
      saving: "SAVING…",
      saved: "SAVED TO MY ERACLASH",
      already_saved: "SAVED TO MY ERACLASH",
      failed: "SAVE FAILED — TRY AGAIN",
      idle: "SAVING…",
    }[saveState] || "SAVING…";
    const failed = saveState === "failed";
    return (
      <section aria-labelledby="ec-save-title" data-save-panel="signed-in" data-save-state={saveState} style={panel}>
        <div style={{ minWidth: 0 }}>
          <h2 id="ec-save-title" style={{ margin: 0, fontSize: 13, fontWeight: 900, letterSpacing: 1.4, color: failed ? "var(--ec-a-red, #e06060)" : T.gold }}>
            {label}
          </h2>
          <p role="status" aria-live="polite" style={{ margin: "4px 0 0", fontSize: 12.5, color: T.textDim, lineHeight: 1.5 }}>
            {failed
              ? "Your result is safe on screen. Nothing was simulated again — the save can simply be retried."
              : saveState === "saved" || saveState === "already_saved"
                ? "This Clash is in your career on every device you sign in on."
                : "Adding this Clash to your career."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {failed && <button onClick={onSaveAgain} style={primaryBtn}>TRY AGAIN</button>}
          {(saveState === "saved" || saveState === "already_saved") && (
            <button onClick={onViewCareer} style={secondaryBtn}>VIEW YOUR CAREER</button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="ec-save-title" data-save-panel="guest" style={{ ...panel, display: "block" }}>
      <h2 id="ec-save-title" style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: 1.2, color: T.gold }}>SAVE THIS CLASH</h2>
      <p style={{ margin: "6px 0 10px", fontSize: 13, color: T.textDim, lineHeight: 1.6 }}>
        {accountsAvailable
          ? "Create your free EraClash account to preserve:"
          : "Accounts are not switched on in this build yet. This result stays on screen, and Chaos Clash stays open to everyone."}
      </p>
      {accountsAvailable && (
        <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 12.5, color: T.textDim, lineHeight: 1.7, columns: 2, columnGap: 18 }}>
          {KEPT.map((k) => <li key={k}>{k}</li>)}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {accountsAvailable && (
          <button onClick={() => { track("account_gate_shown", { entryPoint: "postgame", resultPresent: true }); onSignIn?.(); }} style={primaryBtn}>
            SAVE THIS CLASH
          </button>
        )}
        <button onClick={() => setDismissed(true)} style={secondaryBtn}>NOT NOW</button>
      </div>
    </section>
  );
}

const panel = {
  display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
  margin: "14px 0", padding: "14px 16px", borderRadius: R.lg,
  border: `1px solid ${T.goldBorder}`, background: T.bgCard,
};
const primaryBtn = {
  minHeight: 48, padding: "0 18px", borderRadius: R.sm, cursor: "pointer",
  fontWeight: 900, fontSize: 13.5, letterSpacing: 0.8,
  border: `1px solid ${T.goldBorder}`, background: T.gold, color: T.onGold,
};
const secondaryBtn = {
  minHeight: 48, padding: "0 16px", borderRadius: R.sm, cursor: "pointer",
  fontWeight: 800, fontSize: 12.5, border: `1.5px solid ${T.border}`, background: "transparent", color: T.text,
};
