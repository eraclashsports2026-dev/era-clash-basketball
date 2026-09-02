// ── The Play Lobby ───────────────────────────────────────────────────────────
// The visual entrance to the game. One decision: what do you want to play?
//
// Three primary cards, a quieter row of four, and — when this browser holds an
// unfinished Chaos run — a Continue card above them. Every card is read from
// the ONE navigation registry (the same records the Play dropdown renders), so
// the two can never disagree about a mode's name, order, sentence or status.
//
// Nothing here starts a game. Viewing the lobby makes no /api/game request;
// the only network call is a READ of an already-existing run, and only when
// the browser remembers one.
import { useEffect, useRef, useState } from "react";
import {
  lobbyModes, resolveModeAction, STATUS_LABEL, ACTION_LABEL, MODE_STATUS, PLAY_LOBBY_ROUTE,
} from "../../navigation.js";
import { viewChaos, abandonChaos } from "../../chaos/client.js";
import { track } from "../../analytics.js";
import { markLobbyViewed, markModeSelected } from "../../activation.js";
import ModeGlyph from "./ModeGlyph.jsx";
import ContinueCard from "./ContinueCard.jsx";
import ResetDialog from "../arena/ResetDialog.jsx";

export const RUN_KEY = "ec_chaos_run";
export const RUN_AT_KEY = "ec_chaos_run_at";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  clear: () => { try { localStorage.removeItem(RUN_KEY); localStorage.removeItem(RUN_AT_KEY); } catch { /* private mode */ } },
};

const badgeTone = (status) => {
  switch (status) {
    case MODE_STATUS.AVAILABLE: return "available";
    case MODE_STATUS.COMING_SOON:
    case MODE_STATUS.DISABLED_FOR_PREVIEW:
    case MODE_STATUS.UNAVAILABLE_HERE: return "muted";
    default: return "gold";
  }
};

function ModeCard({ mode, action, tier, primary, onAct }) {
  const badge = STATUS_LABEL[action.status];
  const descId = `ec-mode-desc-${mode.id}`;
  const actionLabel = ACTION_LABEL[action.status] || "Open";
  const isLink = !!action.href && action.intent !== "EXPLAIN_PREVIEW";
  const name = `${actionLabel} ${mode.label}${mode.recommended ? ", recommended" : ""}${badge ? ` — ${badge}` : ""}`;
  const onClick = (e) => { e.preventDefault(); onAct(mode, action); };
  return (
    <article className={`ec-mode-card${primary ? " ec-mode-card--primary" : " ec-mode-card--secondary"}${mode.recommended ? " ec-mode-card--recommended" : ""}`}
      data-mode={mode.id} data-status={action.status} data-recommended={mode.recommended ? "true" : "false"}
      aria-labelledby={`ec-mode-title-${mode.id}`} aria-describedby={descId}>
      <div className="ec-mode-card-top">
        <span className="ec-mode-glyph"><ModeGlyph id={mode.id} size={primary ? 34 : 26} /></span>
        {mode.recommended && <span className="ec-mode-flag">RECOMMENDED</span>}
        {badge && <span className={`ec-mode-badge ec-mode-badge--${badgeTone(action.status)}`}>{badge}</span>}
      </div>
      <h2 id={`ec-mode-title-${mode.id}`} className="ec-mode-title">{mode.label}</h2>
      <p id={descId} className="ec-mode-line">{mode.shortDescription}</p>
      {isLink ? (
        <a className="ec-mode-action" href={action.href} onClick={onClick} aria-label={name}
          data-intent={action.intent}>{actionLabel}</a>
      ) : (
        <button className="ec-mode-action" onClick={onClick} aria-label={name} data-intent={action.intent}>{actionLabel}</button>
      )}
    </article>
  );
}

/**
 * @param tier                    the viewer's account tier
 * @param chaosAvailable          the server's word on whether Chaos runs here
 * @param previewCandidateActive  a preview-engine result is on screen
 * @param entrance                true at `/`: the public entrance carries the product line
 * @param onModeAction(action)    the App's ONE mode handler
 * @param onContinue()            resume the run in the arena
 * @param onAbandoned()           the App drops any run state it holds
 */
export default function PlayLobby({
  tier = "GUEST", chaosAvailable = true, previewCandidateActive = false, entrance = false,
  onModeAction, onContinue, onAbandoned,
}) {
  const { primary, secondary } = lobbyModes();
  const ctx = { from: PLAY_LOBBY_ROUTE, previewCandidateActive, chaosAvailable };
  const [active, setActive] = useState({ loading: !!store.get(RUN_KEY), run: null, expired: false });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const viewed = useRef(false);

  // A remembered run is READ, never advanced. Missing, abandoned or expired
  // runs are cleared so no false Continue card can ever be shown.
  useEffect(() => {
    const id = store.get(RUN_KEY);
    if (!viewed.current) { viewed.current = true; markLobbyViewed({ hasActiveRun: !!id, route: entrance ? "/" : PLAY_LOBBY_ROUTE }); }
    if (!id) return;
    let alive = true;
    viewChaos(id, tier)
      .then((r) => {
        if (!alive) return;
        const run = r?.chaos;
        if (run && run.status !== "ABANDONED" && run.phase !== "SIMULATED") {
          setActive({ loading: false, run, expired: false });
        } else { store.clear(); setActive({ loading: false, run: null, expired: false }); }
      })
      .catch((e) => {
        if (!alive) return;
        // The server forgets an expired run (NOT_FOUND). Say so, once.
        if (e?.status === 404 || /NOT_FOUND/.test(String(e?.code || ""))) {
          setActive({ loading: false, run: null, expired: true });
          track("active_run_expired_shown", {});
        } else { setActive({ loading: false, run: null, expired: false }); }
      });
    return () => { alive = false; };
  }, [tier, entrance]);

  const act = (mode, action) => {
    markModeSelected(mode, action, entrance ? "/" : PLAY_LOBBY_ROUTE);
    onModeAction?.(action);
  };

  const abandon = async () => {
    const id = active.run?.chaosRunId;
    setBusy(true);
    try { if (id) await abandonChaos(id, tier); } catch { /* the local abandon still stands: the server forgets it at expiry */ }
    store.clear();
    track("active_run_abandoned", { phase: active.run?.phase || null });
    setBusy(false); setConfirm(false);
    setActive({ loading: false, run: null, expired: false });
    onAbandoned?.();
  };

  const lastAt = Number(store.get(RUN_AT_KEY)) || null;

  return (
    <main className="ec-lobby" aria-labelledby="ec-lobby-title" data-entrance={entrance ? "true" : "false"}>
      <header className="ec-lobby-hero">
        <img className="ec-lobby-logo" src="/brand/eraclash-logo-mk1.png" alt="EraClash Basketball" width="760" height="304" decoding="async" />
        <h1 id="ec-lobby-title" className="sr-only">Play EraClash Basketball</h1>
        <p className="ec-lobby-line">
          {entrance
            ? "Draft legends from every era and play the matchup possession by possession. Choose how you want to play."
            : "Choose how you want to play."}
        </p>
      </header>

      {(active.run || active.expired) && (
        <ContinueCard run={active.run} expired={active.expired} lastActivityAt={lastAt} busy={busy}
          onContinue={() => { track("active_run_continue_clicked", { phase: active.run?.phase || null }); onContinue?.(active.run); }}
          onAbandon={() => { track("active_run_abandon_started", { phase: active.run?.phase || null }); setConfirm(true); }}
          onDismiss={() => { store.clear(); setActive({ loading: false, run: null, expired: false }); }} />
      )}

      <section className="ec-lobby-primary" aria-label="Game modes">
        {primary.map((m) => (
          <ModeCard key={m.id} mode={m} tier={tier} primary action={resolveModeAction(m, tier, ctx)} onAct={act} />
        ))}
      </section>

      <section className="ec-lobby-secondary" aria-label="More ways to play">
        <h2 className="ec-lobby-kicker">MORE WAYS TO PLAY</h2>
        <div className="ec-lobby-secondary-grid">
          {secondary.map((m) => (
            <ModeCard key={m.id} mode={m} tier={tier} primary={false} action={resolveModeAction(m, tier, ctx)} onAct={act} />
          ))}
        </div>
      </section>

      <ResetDialog open={confirm} state="abandon" busy={busy} onConfirm={abandon} onCancel={() => setConfirm(false)} />
    </main>
  );
}
