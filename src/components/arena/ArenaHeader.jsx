// ── Global header ────────────────────────────────────────────────────────────
// Play and Fantasy are both first-class menus driven by the ONE navigation
// registry, so a mode can never appear in the menu but not on the shelf.
import NavMenu from "./NavMenu.jsx";
import AccountControl from "./AccountControl.jsx";
import {
  PLAY_MODES, FANTASY_DESTINATIONS, FANTASY_STATUS_LABEL, TOP_NAV,
  resolveModeAction, STATUS_LABEL, MODE_STATUS,
} from "../../navigation.js";
import { useCompact, NAV_COMPACT_MAX, MOBILE_MAX } from "../../ui/useCompact.js";
import { useEffect, useRef, useState } from "react";
import { hasAccount, getAccount, signOut } from "../../account.js";
import { membershipHref } from "../../navigation.js";
import { provider as accountProvider } from "../../accounts/provider.js";

const statusTone = (status) => {
  switch (status) {
    case MODE_STATUS.AVAILABLE: return { fg: "var(--ec-a-green, #4ade80)", bg: "rgba(74,222,128,0.12)" };
    case MODE_STATUS.COMING_SOON: return { fg: "var(--ec-a-text-muted, #93a0b5)", bg: "rgba(147,160,181,0.12)" };
    case MODE_STATUS.DISABLED_FOR_PREVIEW: return { fg: "var(--ec-a-text-muted, #93a0b5)", bg: "rgba(147,160,181,0.12)" };
    default: return { fg: "var(--ec-a-gold, #f2b51d)", bg: "var(--ec-a-gold-soft, rgba(242,181,29,0.14))" };
  }
};

function MenuRow({ icon, title, subtitle, badge, badgeTone, onClick, disabled }) {
  return (
    <button role="menuitem" onClick={onClick} disabled={disabled} style={{
      display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 10, alignItems: "center",
      width: "100%", textAlign: "left", minHeight: 56, padding: "8px 10px", borderRadius: 10,
      border: "none", background: "transparent", cursor: disabled ? "default" : "pointer",
    }}>
      <span aria-hidden="true" style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 800, fontSize: 13.5, color: "var(--ec-a-text, #f5f7fb)" }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--ec-a-text-muted, #93a0b5)", lineHeight: 1.45 }}>{subtitle}</span>
      </span>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999,
          color: badgeTone.fg, background: badgeTone.bg, whiteSpace: "nowrap",
        }}>{badge}</span>
      )}
    </button>
  );
}

/**
 * The phone menu: one sheet with every destination the desktop header offers
 * (game modes, fantasy, the rest of EraClash) plus the account actions that
 * the compact header's single icon cannot carry. A dialog: focus moves in,
 * Escape and the scrim close it, focus returns to the menu button, and the
 * page behind it does not scroll while it is open.
 */
function MobileMenu({ onClose, returnTo, nav, onNav, tier, activeModeId, onModeAction, onNavigate, onCreateAccount, onHowModes, onAccountChanged, previewCandidateActive, account, onSignIn, onSignOutAccount }) {
  const panelRef = useRef(null);
  const plainNav = TOP_NAV.filter((t) => t.kind === "nav");
  const cloud = !!accountProvider();
  const cloudUser = cloud && account?.session?.userId ? account : null;
  const localAccount = hasAccount() && !cloud ? getAccount() : null;
  const close = () => { onClose(); requestAnimationFrame(() => returnTo?.current?.focus?.()); };
  const go = (fn) => () => { close(); fn(); };
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector("button");
    first?.focus?.();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      // keep focus inside the sheet
      const items = [...(panelRef.current?.querySelectorAll("button:not([disabled])") || [])];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, []); // eslint-disable-line
  return (
    <div className="ec-mobile-menu" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panelRef} className="ec-mobile-menu-panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="ec-mobile-menu-top">
          <span className="ec-mobile-menu-title">MENU</span>
          <button className="ec-mobile-menu-close" onClick={close} aria-label="Close menu">✕</button>
        </div>
        <div role="menu" aria-label="Game modes">
          <div style={menuHeading}>GAME MODES</div>
          {PLAY_MODES.map((m) => {
            const action = resolveModeAction(m, tier, { from: "/play", previewCandidateActive });
            return (
              <MenuRow key={m.id} icon={m.icon} title={m.label} subtitle={m.tagline}
                badge={m.id === activeModeId ? "Playing" : STATUS_LABEL[action.status]}
                badgeTone={m.id === activeModeId ? statusTone(MODE_STATUS.AVAILABLE) : statusTone(action.status)}
                onClick={go(() => onModeAction(action))} />
            );
          })}
          <MenuRow icon="❔" title="How modes work" subtitle="What each mode is, and what it needs." onClick={go(() => onHowModes())} />
        </div>
        <div role="menu" aria-label="Fantasy">
          <div style={menuHeading}>FANTASY</div>
          {FANTASY_DESTINATIONS.map((f) => (
            <MenuRow key={f.id} icon={f.icon} title={f.label} subtitle={f.tagline}
              badge={FANTASY_STATUS_LABEL[f.status]} badgeTone={statusTone(MODE_STATUS.COMING_SOON)}
              onClick={go(() => onNavigate(f.route))} />
          ))}
        </div>
        <div role="menu" aria-label="The rest of EraClash">
          <div style={menuHeading}>THE REST OF ERACLASH</div>
          {plainNav.map((t) => (
            <MenuRow key={t.id} icon={t.icon || "→"} title={t.label} subtitle={t.tagline || ""}
              badge={t.nav === nav ? "Here" : undefined} badgeTone={statusTone(MODE_STATUS.AVAILABLE)}
              onClick={go(() => onNav(t.nav))} />
          ))}
        </div>
        <div role="menu" aria-label="Account">
          <div style={menuHeading}>ACCOUNT</div>
          {cloud && !cloudUser && (
            <>
              <MenuRow icon="★" title="Create free account" subtitle="Keep your Clashes, rosters and career across devices." onClick={go(() => onCreateAccount())} />
              <MenuRow icon="→" title="Sign in" subtitle="Already have an account? Sign in by email." onClick={go(() => onSignIn?.())} />
            </>
          )}
          {cloudUser && (
            <>
              <MenuRow icon="👤" title={cloudUser.profile?.display_name || "Coach"} subtitle="Free account · My EraClash, record and settings." onClick={go(() => onNavigate?.("/my-eraclash"))} />
              <MenuRow icon="↩" title="Sign out" subtitle="Sign out of this account on this device." onClick={go(async () => { await onSignOutAccount?.(); onAccountChanged?.(); })} />
            </>
          )}
          {!cloud && !localAccount && (
            <MenuRow icon="★" title="Create account" subtitle="A device-scoped account for this browser." onClick={go(() => onCreateAccount())} />
          )}
          {!cloud && localAccount && (
            <>
              <MenuRow icon="👤" title={localAccount.name} subtitle="My EraClash · saved on this device." onClick={go(() => onNavigate?.("nav:Profile"))} />
              <MenuRow icon="◆" title="Explore membership" subtitle="What EraClash+ adds." onClick={go(() => onNavigate?.(membershipHref({ from: "/play" })))} />
              <MenuRow icon="↩" title="Sign out of this device" subtitle="" onClick={go(() => { signOut(); onAccountChanged?.(); })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The compact header (phone): one 56–64px row — menu button, the Mk1 mark, the
 * account control — that stays pinned while everything else scrolls. It is the
 * same master-brand surface (.ec-brand-header) and the same destinations and
 * account actions as the desktop header, reached through the menu sheet.
 */
function CompactHeader(props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  return (
    <header className="ec-brand-header ec-brand-header--compact" data-header="compact">
      <div className="ec-brand-header-row">
        <button ref={triggerRef} className="ec-brand-menu-btn" onClick={() => setOpen(true)}
          aria-label="Menu" aria-haspopup="dialog" aria-expanded={open}>
          <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
        </button>
        <button className="ec-brand-home ec-brand-home--compact" onClick={() => props.onNav("Play")} aria-label="EraClash Basketball home">
          <img className="ec-brand-logo" src="/brand/eraclash-logo-mk1.png" alt="" width="760" height="304" decoding="async" data-brand-mark="eraclash-logo-mk1" />
        </button>
        <div className="ec-brand-account">
          <AccountControl iconOnly onCreateAccount={props.onCreateAccount} onNavigate={props.onNavigate} onChanged={props.onAccountChanged}
            account={props.account} onSignIn={props.onSignIn} onSignOutAccount={props.onSignOutAccount} />
        </div>
      </div>
      {open && <MobileMenu {...props} onClose={() => setOpen(false)} returnTo={triggerRef} />}
    </header>
  );
}

export default function ArenaHeader(props) {
  const mobile = useCompact(MOBILE_MAX);
  if (mobile) return <CompactHeader {...props} />;
  return <DesktopHeader {...props} />;
}

function DesktopHeader({
  nav, onNav, tier, activeModeId, onModeAction, onNavigate, onCreateAccount,
  onHowModes, onAccountChanged, previewCandidateActive,
  // Phase 9B.1: the real account, when cloud accounts are configured.
  account = null, onSignIn, onSignOutAccount,
}) {
  // Six top-level items cannot share a line on a phone. Wrapping them made the
  // sticky header 217px tall — a quarter of the viewport, permanently, on every
  // screen of the game. Below the breakpoint they fold into one menu instead.
  const compactNav = useCompact(NAV_COMPACT_MAX);
  const plainNav = TOP_NAV.filter((t) => t.kind === "nav");
  return (
    // Phase 9A.2: the header is a MASTER-BRAND surface (.ec-brand-header) in
    // every shell — Brand Obsidian, metallic Platinum, EraClash Logo Mk1 — so an
    // editorial page never lightens it and every product keeps one identity.
    <header className="ec-brand-header" style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "var(--ec-a-header, rgba(5, 11, 20, 0.94))",
      borderBottom: "1px solid var(--ec-a-border, rgba(157,178,209,0.20))",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        maxWidth: 1560, margin: "0 auto", padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <button className="ec-brand-home" onClick={() => onNav("Play")} aria-label="EraClash Basketball home" style={{
          background: "none", border: "none", cursor: "pointer", padding: "4px 8px 4px 0", textAlign: "left",
          display: "inline-flex", alignItems: "center", gap: 10, minHeight: 44,
        }}>
          {/* The canonical mark, never redrawn: public/brand/eraclash-logo-mk1.png
              (data/validation/9a2/logo-mk1-manifest.json). Sized by height so the
              header keeps its 64px contract. Phase 9A.3P: this is the header's ONLY
              image — EraClash's own mark with its BASKETBALL descriptor. No league
              mark, no second crest, nothing added to fill space. */}
          <img className="ec-brand-logo" src="/brand/eraclash-logo-mk1.png" alt="" width="760" height="304" decoding="async" data-brand-mark="eraclash-logo-mk1"
            style={{ height: 34, width: "auto", display: "block" }} />
          <span className="ec-brand-sport" style={{ fontSize: 8.5, letterSpacing: 3.4, color: "var(--ec-a-text-secondary, #c3cddd)", fontWeight: 800, lineHeight: 1 }}>BASKETBALL</span>
        </button>

        <nav aria-label="Main" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <NavMenu label="Play" active={nav === "Play"}>
            {(close) => (
              <>
                <div style={menuHeading}>GAME MODES</div>
                {PLAY_MODES.map((m) => {
                  const action = resolveModeAction(m, tier, { from: "/play", previewCandidateActive });
                  return (
                    <MenuRow key={m.id} icon={m.icon} title={m.label} subtitle={m.tagline}
                      badge={m.id === activeModeId ? "Playing" : STATUS_LABEL[action.status]}
                      badgeTone={m.id === activeModeId ? statusTone(MODE_STATUS.AVAILABLE) : statusTone(action.status)}
                      onClick={() => { close(); onModeAction(action); }} />
                  );
                })}
                <div style={{ height: 1, background: "var(--ec-a-border, rgba(157,178,209,0.20))", margin: "6px 8px" }} />
                <MenuRow icon="❔" title="How modes work" subtitle="What each mode is, and what it needs."
                  onClick={() => { close(); onHowModes(); }} />
              </>
            )}
          </NavMenu>

          <NavMenu label="Fantasy">
            {(close) => (
              <>
                <div style={menuHeading}>FANTASY</div>
                {FANTASY_DESTINATIONS.map((f) => (
                  <MenuRow key={f.id} icon={f.icon} title={f.label} subtitle={f.tagline}
                    badge={FANTASY_STATUS_LABEL[f.status]} badgeTone={statusTone(MODE_STATUS.COMING_SOON)}
                    onClick={() => { close(); onNavigate(f.route); }} />
                ))}
                <div style={{ padding: "6px 10px 8px", fontSize: 11.5, color: "var(--ec-a-text-muted, #93a0b5)", lineHeight: 1.5 }}>
                  Neither fantasy product is live yet. These pages explain what each will be.
                </div>
              </>
            )}
          </NavMenu>

          {compactNav ? (
            <NavMenu label="More" active={plainNav.some((t) => t.nav === nav)}>
              {(close) => (
                <>
                  <div style={menuHeading}>THE REST OF ERACLASH</div>
                  {plainNav.map((t) => (
                    <MenuRow key={t.id} icon={t.icon || "→"} title={t.label} subtitle={t.tagline || ""}
                      badge={t.nav === nav ? "Here" : undefined} badgeTone={statusTone(MODE_STATUS.AVAILABLE)}
                      onClick={() => { close(); onNav(t.nav); }} />
                  ))}
                </>
              )}
            </NavMenu>
          ) : plainNav.map((t) => (
            <button key={t.id} className="ec-nav-item" onClick={() => onNav(t.nav)} aria-current={nav === t.nav ? "page" : undefined} style={{
              position: "relative", minHeight: 44, padding: "0 12px", borderRadius: 10, cursor: "pointer",
              fontWeight: 700, fontSize: 13.5, border: "1px solid transparent", background: "transparent",
              color: nav === t.nav ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-text-secondary, #c3cddd)",
            }}>{t.label}</button>
          ))}
        </nav>

        <div style={{ marginLeft: "auto" }}>
          <AccountControl onCreateAccount={onCreateAccount} onNavigate={onNavigate} onChanged={onAccountChanged}
            account={account} onSignIn={onSignIn} onSignOutAccount={onSignOutAccount} />
        </div>
      </div>
    </header>
  );
}

const menuHeading = {
  fontSize: 10, fontWeight: 900, letterSpacing: 1.8,
  color: "var(--ec-a-text-muted, #93a0b5)", padding: "6px 10px 4px",
};
