// ── Membership, Fantasy and mode-information destinations ────────────────────
// Every claim here is true of the product as it stands. There is no checkout,
// no price, no trial, no billing state and no fantasy contest, because none of
// those exist yet.
import { useEffect, useRef } from "react";
import { MATRIX, CAPABILITIES, TIERS, can } from "../../entitlements.js";
import { FANTASY_DESTINATIONS, FANTASY_STATUS_LABEL, findMode, PLAY_MODES } from "../../navigation.js";
import { currentTier } from "../../account.js";
import Wave2Feedback from "../Wave2Feedback.jsx";
import { PREVIEW_ACCESS } from "../../../config/previewAccess.js";
import { WAVE2 } from "../../wave2.js";
const IS_WAVE2 = PREVIEW_ACCESS.waveId === WAVE2.waveId;

const Wrap = ({ title, kicker, children, onBack }) => (
  <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 48px" }}>
    <button onClick={onBack} style={{
      minHeight: 40, padding: "0 12px", borderRadius: 9, cursor: "pointer", marginBottom: 16,
      border: "1px solid var(--ec-a-border)", background: "transparent", color: "var(--ec-a-text-secondary, #c3cddd)",
      fontSize: 12.5, fontWeight: 700,
    }}>← Back</button>
    {kicker && <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-gold, #f2b51d)" }}>{kicker}</div>}
    <h1 style={{ margin: "4px 0 14px", fontSize: 30, fontWeight: 900, color: "var(--ec-a-text, #f5f7fb)" }}>{title}</h1>
    {children}
  </div>
);
const Card = ({ children, style }) => (
  <div className="ec-panel ec-panel-raised" style={{ padding: 16, ...style }}>{children}</div>
);
const P = ({ children }) => (
  <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ec-a-text-secondary, #c3cddd)", margin: "0 0 10px" }}>{children}</p>
);

const CAP_LABEL = {
  [CAPABILITIES.CHAOS_CLASH]: "Chaos Clash",
  [CAPABILITIES.CHAOS_UNLIMITED]: "Unlimited Chaos Clash runs",
  [CAPABILITIES.DREAM_MATCHUP]: "Dream Matchup sandbox",
  [CAPABILITIES.DAILY]: "Daily Clash",
  [CAPABILITIES.CHALLENGES]: "Same-seed challenges",
  [CAPABILITIES.SAVED_HISTORY]: "Saved history",
  [CAPABILITIES.BEST_OF_7_TRIAL]: "Best of 7 (trial)",
  [CAPABILITIES.BEST_OF_7]: "Best of 7 (unlimited)",
  [CAPABILITIES.WIN_82_PREVIEW]: "Win 82 (preview)",
  [CAPABILITIES.WIN_82]: "Win 82 (full season)",
  [CAPABILITIES.TOURNAMENT_JOIN]: "Join tournaments",
  [CAPABILITIES.TOURNAMENT_CREATE]: "Create private tournaments",
  [CAPABILITIES.ERA_GAUNTLET]: "Era Gauntlet",
  [CAPABILITIES.ADVANCED_RECAP]: "Advanced recaps",
};

export function MembershipPage({ query, onBack, onCreateAccount }) {
  const feature = query.get("feature");
  const required = query.get("required");
  const mode = feature ? findMode(feature) : null;
  const tier = currentTier();
  return (
    <Wrap kicker="MEMBERSHIP" title="EraClash membership" onBack={onBack}>
      {mode && (
        <Card style={{ marginBottom: 16, borderColor: "var(--ec-a-gold-line)" }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.6, color: "var(--ec-a-gold, #f2b51d)" }}>
            {required === "commissioner" ? "COMMISSIONER FEATURE" : "MEMBERSHIP FEATURE"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, margin: "3px 0 5px", color: "var(--ec-a-text, #f5f7fb)" }}>{mode.label}</div>
          <P>{mode.description}</P>
        </Card>
      )}
      <Card style={{ marginBottom: 16 }}>
        <P><strong style={{ color: "var(--ec-a-text, #f5f7fb)" }}>Membership plans are being prepared.</strong> The protected preview does not process payments, and no plan can be purchased here yet.</P>
        <P>You are currently on: <strong style={{ color: "var(--ec-a-gold, #f2b51d)" }}>{tier}</strong>.</P>
        {tier === "GUEST" && (
          <button onClick={onCreateAccount} style={{
            minHeight: 46, padding: "0 18px", borderRadius: 10, cursor: "pointer", fontWeight: 900, fontSize: 13.5,
            border: "1px solid var(--ec-a-gold-line)", background: "var(--ec-a-gold, #f2b51d)", color: "#0a0f18",
          }}>Create a free account</button>
        )}
      </Card>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {TIERS.map((t) => (
          <Card key={t} style={{ borderColor: t === tier ? "var(--ec-a-gold-line)" : undefined }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: t === tier ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-text, #f5f7fb)" }}>
              {t}{t === tier ? " · current" : ""}
            </div>
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
              {/* A capability can sit in a tier's matrix and still be denied to
                  everyone by its feature flag — Era Gauntlet is. Listing it as a
                  plain benefit advertised something no membership can deliver,
                  so the same can() the product enforces decides the label. */}
              {MATRIX[t].map((c) => {
                const live = can(t, c);
                return (
                  <li key={c} style={{ fontSize: 12.5, color: live ? "var(--ec-a-text-secondary, #c3cddd)" : "var(--ec-a-text-muted, #93a0b5)", lineHeight: 1.5 }}>
                    · {CAP_LABEL[c] || c}{live ? "" : " — in development"}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--ec-a-text-muted, #93a0b5)", marginTop: 14, lineHeight: 1.6 }}>
        Membership never affects draft odds, the Legend CPU, coach offers, the era, or any simulated result. It decides which modes you can open, nothing more.
      </div>
    </Wrap>
  );
}

export function FantasyPage({ id, onBack }) {
  const f = FANTASY_DESTINATIONS.find((x) => x.id === id) || FANTASY_DESTINATIONS[0];
  const other = FANTASY_DESTINATIONS.find((x) => x.id !== f.id);
  return (
    <Wrap kicker={`FANTASY · ${FANTASY_STATUS_LABEL[f.status].toUpperCase()}`} title={f.label} onBack={onBack}>
      <Card style={{ marginBottom: 14 }}>
        <P>{f.description}</P>
        <P><strong style={{ color: "var(--ec-a-text, #f5f7fb)" }}>{f.differentiator}</strong></P>
        <div style={{ fontSize: 12.5, color: "var(--ec-a-text-muted, #93a0b5)", lineHeight: 1.6, marginTop: 6 }}>
          This product is not live. There are no contests, entry fees, wallets or payouts here, and nothing on this page can be joined yet.
        </div>
      </Card>
      {other && (
        <Card>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.6, color: "var(--ec-a-text-muted, #93a0b5)" }}>HOW IT DIFFERS FROM</div>
          <div style={{ fontSize: 16, fontWeight: 900, margin: "3px 0 5px", color: "var(--ec-a-text, #f5f7fb)" }}>{other.label}</div>
          <P>{other.differentiator} {other.description}</P>
        </Card>
      )}
    </Wrap>
  );
}

export function ModeInfoPage({ id, onBack }) {
  const mode = findMode(id);
  // An unknown mode must say so. Falling back to the first mode used to show a
  // completely different game and describe it as the one that was asked for.
  if (!mode) {
    return (
      <Wrap kicker="NOT FOUND" title="That mode does not exist" onBack={onBack}>
        <Card><P>No game mode matches this address.</P></Card>
      </Wrap>
    );
  }
  return (
    <Wrap kicker={mode.implemented ? "GAME MODE" : "IN DEVELOPMENT"} title={mode.label} onBack={onBack}>
      <Card>
        <P>{mode.description}</P>
        {!mode.implemented && (
          <div style={{ fontSize: 12.5, color: "var(--ec-a-text-muted, #93a0b5)", lineHeight: 1.6 }}>
            This mode is specified but not yet built. It is not part of any membership, and nothing here can be purchased.
          </div>
        )}
      </Card>
    </Wrap>
  );
}

/**
 * The arena's own guide: how the Clash works, how to think about it, and what
 * its words mean. Every line describes behaviour that exists in the build — no
 * roadmap copy, no invented systems.
 */
const GUIDE = {
  play: {
    title: "How to play",
    blocks: [
      ["Three rolls, one board", "Roll 1 deals you five players and three coaching staffs, and deals the Legend CPU its own. You keep what you want and release the rest — players and staffs in the same decision."],
      ["The era arrives with Roll 2", "Every Clash is played in a randomly drawn era, revealed with your second roll. You still have a decision left after you see it, which is the point."],
      ["Roll 3 commits", "The third roll is the last one. Your roster and your final three offers lock, and you hire exactly one staff."],
      ["Anyone you release is gone", "A released player or staff is out of that Clash for good — for you and for the CPU. That is what makes keeping something a real decision."],
      ["The result lands beside you", "Run the sim and the final score, story, box score, coaching and analysis appear in the Result Dock without taking you away from the five you built."],
    ],
  },
  strategy: {
    title: "Strategy",
    blocks: [
      ["Pressure is the cost of greed", "Holding rare talent makes another elite pull less likely — but every player stays possible. Nothing is ever removed from the pool by holding."],
      ["The era decides what your five is worth", "Some eras have no three-point line, so a long shot pays two. Some allow hand-checking on the perimeter. Some forbid zones. The same five is not equally good in all of them."],
      ["Three staffs, three different jobs", "The Roster Maximizer plays to what you already have. The Opponent Counter attacks what Blue does badly. The Era Adapter fits the environment — and before the reveal, it favours a coach whose system survives any era."],
      ["The CPU is playing the same game", "Legend holds under the same rules, from the same odds, and its decision for each roll is committed before yours is submitted. It cannot see a draw you have not seen."],
      ["A challenge is a fair rematch", "Challenging shares the opening rolls and the rules, never the outcome. Two people who decide differently branch, and each branch is reproducible."],
    ],
  },
  glossary: {
    title: "Glossary",
    blocks: [
      ["OVR", "The draft guide rating for a player in the slot they are being drafted into. It is a guide to the draft, not the simulation's opinion of the game."],
      ["Tier", "APEX, ELITE, STAR or SPECIALIST — how rare a card is at that position. Tiers drive Draft Pressure."],
      ["Draft Pressure", "LOW, RISING or HIGH: how much of your board is already rare talent. Higher pressure means the next elite pull is less likely, never impossible."],
      ["Era Style", "The rules and pace of a decade — what is legal, what a shot is worth, how physical the perimeter may be. Both teams play in the same era."],
      ["Hold, release, burn", "Holding keeps a card through the next roll. Releasing sends it back — and burns it, so it cannot return in that Clash."],
      ["Legend Rival", "The opponent — Team Blue in solo play, run by the computer. It drafts, holds and hires with the same rules and the same odds you do."],
      ["Result Dock", "The right-hand surface that carries your result: story, box score, coaching and analysis, with the full report one tap away."],
    ],
  },
};

// Phase 9A.3: on a Wave 2 deployment the guide carries a fourth section, the
// Wave 2 feedback panel, so the lobby, placement and comparison tasks can be
// rated without a finished game on screen.
const GUIDE_SECTIONS = () => (IS_WAVE2 ? { ...GUIDE, feedback: { title: "Wave 2 feedback", blocks: [] } } : GUIDE);

export function ArenaGuide({ section = "play", onSection, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const SECTIONS = GUIDE_SECTIONS();
  const active = SECTIONS[section] ? section : "play";
  return (
    <div role="dialog" aria-modal="true" aria-label="Arena guide" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 90, background: "var(--ec-a-scrim, rgba(3,7,13,0.9))",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="ec-panel ec-panel-raised" style={{
        maxWidth: 640, width: "100%", maxHeight: "84vh", overflowY: "auto", padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19, color: "var(--ec-a-text, #f5f7fb)" }}>{SECTIONS[active].title}</h2>
          <button onClick={onClose} aria-label="Close" style={{
            marginLeft: "auto", minHeight: 44, padding: "0 12px", borderRadius: 9, cursor: "pointer",
            border: "1px solid var(--ec-a-border)", background: "transparent", color: "var(--ec-a-text-secondary)",
          }}>✕</button>
        </div>
        <div role="tablist" aria-label="Guide sections" style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(SECTIONS).length}, minmax(0,1fr))`, gap: 5, marginBottom: 12 }}>
          {Object.entries(SECTIONS).map(([id, g]) => (
            <button key={id} role="tab" aria-selected={active === id} onClick={() => onSection?.(id)} style={{
              minHeight: 44, borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 800,
              border: `1px solid ${active === id ? "var(--ec-a-gold-line)" : "var(--ec-a-border)"}`,
              background: active === id ? "var(--ec-a-gold-soft)" : "transparent",
              color: active === id ? "var(--ec-a-gold)" : "var(--ec-a-text-secondary)",
            }}>{g.title}</button>
          ))}
        </div>
        {active === "feedback" && (
          <div className="ec-editorial-shell" style={{ borderRadius: 12 }}>
            <Wave2Feedback defaultTask="N1" />
          </div>
        )}
        {SECTIONS[active].blocks.map(([heading, text]) => (
          <div key={heading} style={{ padding: "11px 0", borderTop: "1px solid var(--ec-a-border)" }}>
            <div style={{ fontWeight: 900, fontSize: 14, color: "var(--ec-a-text, #f5f7fb)" }}>{heading}</div>
            <div style={{ fontSize: 13, color: "var(--ec-a-text-secondary, #c3cddd)", lineHeight: 1.6, marginTop: 3 }}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HowModesModal({ tier, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    // Focus lands in the dialog and Escape closes it — without this the modal
    // trapped keyboard users, which the production-flags e2e caught.
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="How modes work" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 90, background: "var(--ec-a-scrim, rgba(3,7,13,0.9))",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="ec-panel ec-panel-raised" style={{
        maxWidth: 620, width: "100%", maxHeight: "82vh", overflowY: "auto", padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 19, color: "var(--ec-a-text, #f5f7fb)" }}>How modes work</h2>
          <button onClick={onClose} aria-label="Close" style={{
            marginLeft: "auto", minHeight: 40, padding: "0 12px", borderRadius: 9, cursor: "pointer",
            border: "1px solid var(--ec-a-border)", background: "transparent", color: "var(--ec-a-text-secondary)",
          }}>✕</button>
        </div>
        {PLAY_MODES.map((m) => (
          <div key={m.id} style={{ padding: "11px 0", borderTop: "1px solid var(--ec-a-border)" }}>
            <div style={{ fontWeight: 900, fontSize: 14, color: "var(--ec-a-text, #f5f7fb)" }}>{m.icon} {m.label}</div>
            <div style={{ fontSize: 13, color: "var(--ec-a-text-secondary, #c3cddd)", lineHeight: 1.6, marginTop: 3 }}>{m.description}</div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: "var(--ec-a-text-muted, #93a0b5)", marginTop: 12, lineHeight: 1.6 }}>
          Games run on an era-aware possession simulation. Enhanced recaps are written from the finished box score and are labelled wherever they appear.
        </div>
      </div>
    </div>
  );
}
