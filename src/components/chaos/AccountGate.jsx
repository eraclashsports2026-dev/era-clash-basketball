// ── Free-account gate ────────────────────────────────────────────────────────
// Shown when a mode needs an account. It explains the mode, offers to create a
// free account, and always offers a way back to Chaos Clash so a signed-out
// user is never stranded.
import { useState } from "react";
import { T, R } from "../../theme.js";
import { createFreeAccount } from "../../account.js";

export default function AccountGate({ title, blurb, onCreated, onBack }) {
  const [name, setName] = useState("");
  return (
    <div style={{
      maxWidth: 460, margin: "0 auto", padding: 22, borderRadius: R.lg,
      border: `1px solid ${T.border}`, background: T.bgCard, textAlign: "center",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>FREE ACCOUNT REQUIRED</div>
      <h2 style={{ margin: "8px 0 6px", fontSize: 22 }}>{title}</h2>
      <p style={{ color: T.textDim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px" }}>{blurb}</p>
      <label htmlFor="ec-acct-name" style={{ display: "block", textAlign: "left", fontSize: 12, fontWeight: 700, color: T.textDim, marginBottom: 5 }}>
        Pick a name
      </label>
      <input id="ec-acct-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24}
        placeholder="Coach" style={{
          width: "100%", minHeight: 46, borderRadius: R.sm, padding: "0 12px", fontSize: 14,
          border: `1px solid ${T.border}`, background: T.bg, color: T.text, marginBottom: 10,
        }} />
      <button onClick={() => onCreated?.(createFreeAccount(name || "Coach"))} style={{
        width: "100%", minHeight: 48, borderRadius: R.sm, cursor: "pointer",
        fontWeight: 900, fontSize: 14, letterSpacing: 0.8,
        border: `1px solid ${T.goldBorder}`, background: T.gold, color: "#fff",
      }}>CREATE FREE ACCOUNT</button>
      <button onClick={onBack} style={{
        width: "100%", minHeight: 44, marginTop: 8, borderRadius: R.sm, cursor: "pointer",
        fontWeight: 800, fontSize: 13, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim,
      }}>BACK TO CHAOS CLASH</button>
      <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 10, lineHeight: 1.5 }}>
        No email, no payment. Your account lives on this device.
      </div>
    </div>
  );
}
