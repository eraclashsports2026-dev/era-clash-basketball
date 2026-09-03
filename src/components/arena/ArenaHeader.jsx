// ── Global header ────────────────────────────────────────────────────────────
// Play and Fantasy are both first-class menus driven by the ONE navigation
// registry, so a mode can never appear in the menu but not on the shelf.
import NavMenu from "./NavMenu.jsx";
import AccountControl from "./AccountControl.jsx";
import {
  PLAY_MODES, FANTASY_DESTINATIONS, FANTASY_STATUS_LABEL, TOP_NAV,
  resolveModeAction, STATUS_LABEL, MODE_STATUS,
} from "../../navigation.js";
import { useCompact, NAV_COMPACT_MAX } from "../../ui/useCompact.js";

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

export default function ArenaHeader({
  nav, onNav, tier, activeModeId, onModeAction, onNavigate, onCreateAccount,
  onHowModes, onAccountChanged, previewCandidateActive,
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
              header keeps its 64px contract. */}
          <img className="ec-brand-logo" src="/brand/eraclash-logo-mk1.png" alt="" width="760" height="304" decoding="async"
            style={{ height: 34, width: "auto", display: "block" }} />
          <span className="ec-brand-sport" style={{ fontSize: 8.5, letterSpacing: 3.4, color: "var(--ec-a-text-muted, #93a0b5)", fontWeight: 800, lineHeight: 1 }}>BASKETBALL</span>
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
          <AccountControl onCreateAccount={onCreateAccount} onNavigate={onNavigate} onChanged={onAccountChanged} />
        </div>
      </div>
    </header>
  );
}

const menuHeading = {
  fontSize: 10, fontWeight: 900, letterSpacing: 1.8,
  color: "var(--ec-a-text-muted, #93a0b5)", padding: "6px 10px 4px",
};
