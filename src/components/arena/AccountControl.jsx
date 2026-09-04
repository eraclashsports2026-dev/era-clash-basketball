// ── Account and membership control ───────────────────────────────────────────
// Everything here comes from real state. The concept mockup shows a named
// account on a "Legend Tier"; neither is hard-coded, because this build has no
// authentication backend and the honest description of a local account is that
// it lives on this device.
import { useEffect, useRef, useState } from "react";
import { hasAccount, getAccount, currentTier, signOut } from "../../account.js";
import { membershipHref } from "../../navigation.js";
import { useCompact, ACCOUNT_COMPACT_MAX } from "../../ui/useCompact.js";
import { provider as accountProvider } from "../../accounts/provider.js";
import { initialsOf } from "../../accounts/accountState.js";

const TIER_LABEL = { GUEST: "Guest", FREE: "Free account", PLUS: "EraClash+", COMMISSIONER: "Commissioner" };

export default function AccountControl({ onCreateAccount, onNavigate, onChanged, account = null, onSignIn, onSignOutAccount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const localAccount = hasAccount() && !accountProvider() ? getAccount() : null;
  const tier = currentTier();
  // On a phone the chip is the avatar. The name and tier are one tap away in
  // the menu, and the accessible name still carries both.
  const compact = useCompact(ACCOUNT_COMPACT_MAX);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

  // Phase 9B.1: a real provider session, when cloud accounts are configured.
  const cloud = !!accountProvider();
  const cloudUser = cloud && account?.session?.userId ? account : null;

  if (cloud && !cloudUser) {
    // Guest, with real accounts available: the CTA creates one, and Sign in
    // sits beside it rather than being hidden behind the same word.
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {!compact && (
          <button onClick={onSignIn} style={{
            minHeight: 44, padding: "0 12px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 12.5,
            border: "1px solid var(--ec-a-border, rgba(157,178,209,0.20))", background: "transparent",
            color: "var(--ec-a-text-secondary, #c3cddd)",
          }}>Sign in</button>
        )}
        <button onClick={onCreateAccount} style={{
          minHeight: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 13,
          border: "1px solid var(--ec-a-gold-line, rgba(242,181,29,0.45))",
          background: "var(--ec-a-gold-soft, rgba(242,181,29,0.14))", color: "var(--ec-a-gold, #f2b51d)",
        }}>{compact ? "Create account" : "Create free account"}</button>
      </div>
    );
  }

  if (cloudUser) {
    const name = cloudUser.profile?.display_name || "Coach";
    return (
      <div style={{ position: "relative" }}>
        <button ref={triggerRef} onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}
          aria-label={`Account menu for ${name}, free account`} data-account-menu="true" style={{
            minHeight: 44, minWidth: 44, padding: compact ? "0 6px" : "0 10px 0 6px", borderRadius: 10, cursor: "pointer",
            border: "1px solid var(--ec-a-border, rgba(157,178,209,0.20))",
            background: "var(--ec-a-panel-raised, #0d1a2b)",
            display: "inline-flex", alignItems: "center", gap: 9,
          }}>
          <span aria-hidden="true" style={{
            width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
            background: "var(--ec-a-gold-soft, rgba(242,181,29,0.14))",
            color: "var(--ec-a-gold, #f2b51d)", fontWeight: 900, fontSize: 12,
          }}>{initialsOf(name)}</span>
          {!compact && (
            <span style={{ textAlign: "left", lineHeight: 1.2 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 12.5, color: "var(--ec-a-text, #f5f7fb)" }}>{name}</span>
              <span style={{ display: "block", fontSize: 10.5, color: "var(--ec-a-text-muted, #93a0b5)" }}>Free account</span>
            </span>
          )}
        </button>
        {open && (
          <div ref={ref} role="menu" className="ec-menu-panel" style={{ left: "auto", right: 0, minWidth: 240 }}>
            <div style={{ padding: "8px 10px 10px" }}>
              <div style={{ fontWeight: 900, fontSize: 13, color: "var(--ec-a-text, #f5f7fb)" }}>{name}</div>
              {/* The email is a private account detail, not a public identity. */}
              <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted, #93a0b5)", marginTop: 2 }}>Free account · saved to your EraClash account</div>
            </div>
            <button role="menuitem" onClick={() => { setOpen(false); onNavigate?.("/my-eraclash"); }} style={rowStyle}>My EraClash</button>
            <button role="menuitem" onClick={() => { setOpen(false); onNavigate?.("/my-eraclash"); }} style={rowStyle}>Account settings</button>
            <button role="menuitem" onClick={async () => { setOpen(false); await onSignOutAccount?.(); onChanged?.(); }}
              style={{ ...rowStyle, color: "var(--ec-a-text-muted, #93a0b5)" }}>Sign out</button>
          </div>
        )}
      </div>
    );
  }

  // The flag-off path, unchanged since Phase 8A: a device-scoped local identity.
  if (!localAccount) {
    return (
      <button onClick={onCreateAccount} style={{
        minHeight: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
        fontWeight: 800, fontSize: 13,
        border: "1px solid var(--ec-a-gold-line, rgba(242,181,29,0.45))",
        background: "var(--ec-a-gold-soft, rgba(242,181,29,0.14))",
        color: "var(--ec-a-gold, #f2b51d)",
      }}>{compact ? "Create account" : "Create free account"}</button>
    );
  }

  const initials = String(localAccount.name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ position: "relative" }}>
      <button ref={triggerRef} onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}
        aria-label={`Account menu for ${localAccount.name}, ${TIER_LABEL[tier]}`} style={{
          minHeight: 44, minWidth: 44, padding: compact ? "0 6px" : "0 10px 0 6px", borderRadius: 10, cursor: "pointer",
          border: "1px solid var(--ec-a-border, rgba(157,178,209,0.20))",
          background: "var(--ec-a-panel-raised, #0d1a2b)",
          display: "inline-flex", alignItems: "center", gap: 9,
        }}>
        <span aria-hidden="true" style={{
          width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
          background: "var(--ec-a-gold-soft, rgba(242,181,29,0.14))",
          color: "var(--ec-a-gold, #f2b51d)", fontWeight: 900, fontSize: 12,
        }}>{initials}</span>
        {!compact && (
          <span style={{ textAlign: "left", lineHeight: 1.2 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 12.5, color: "var(--ec-a-text, #f5f7fb)" }}>{localAccount.name}</span>
            <span style={{ display: "block", fontSize: 10.5, color: "var(--ec-a-text-muted, #93a0b5)" }}>{TIER_LABEL[tier]}</span>
          </span>
        )}
      </button>
      {open && (
        <div ref={ref} role="menu" className="ec-menu-panel" style={{ left: "auto", right: 0, minWidth: 260 }}>
          <div style={{ padding: "8px 10px 10px" }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: "var(--ec-a-text, #f5f7fb)" }}>{localAccount.name}</div>
            {/* Honest about what this account actually is. */}
            <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted, #93a0b5)", marginTop: 2 }}>
              {TIER_LABEL[tier]} · saved on this device
            </div>
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); onNavigate?.(membershipHref({ from: "/play" })); }} style={rowStyle}>
            Explore membership
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); onNavigate?.("nav:Profile"); }} style={rowStyle}>
            My EraClash
          </button>
          <button role="menuitem" onClick={() => { signOut(); setOpen(false); onChanged?.(); }} style={{ ...rowStyle, color: "var(--ec-a-text-muted, #93a0b5)" }}>
            Sign out of this device
          </button>
        </div>
      )}
    </div>
  );
}

const rowStyle = {
  display: "block", width: "100%", textAlign: "left", minHeight: 44,
  padding: "0 10px", borderRadius: 9, cursor: "pointer", border: "none",
  background: "transparent", color: "var(--ec-a-text-secondary, #c3cddd)",
  fontSize: 13, fontWeight: 700,
};
