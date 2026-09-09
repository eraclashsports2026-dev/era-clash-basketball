// ── The Play Lobby ───────────────────────────────────────────────────────────
// The visual entrance to the game. One decision: what do you want to play?
//
// Three primary cards, a quieter row of four, and — when this browser holds an
// unfinished Chaos run — a Continue card above them. Every card is read from
// the ONE navigation registry (the same records the Play dropdown renders), so
// the two can never disagree about a mode's name, order, sentence, status,
// action label, CTA hierarchy or visual signature.
//
// Phase 9A.3P (polish, not redesign): the brand band adapts — full for a genuine
// first-time state, compact when a run is waiting or this device has played —
// decided synchronously from existing state so the first paint is the final
// layout. Chaos Clash alone carries the filled-Gold primary action; every other
// card's action is an obviously clickable secondary, or visibly unavailable.
//
// Nothing here starts a game. Viewing the lobby makes no /api/game request;
// the only network call is a READ of an already-existing run, and only when
// the browser remembers one.
import { useEffect, useRef, useState } from "react";
import {
  lobbyModes, resolveModeAction, STATUS_LABEL, MODE_STATUS, PLAY_LOBBY_ROUTE,
  actionLabelFor, actionHierarchyFor, accessibleActionName, ACTION_HIERARCHY, LOBBY_PRESENTATION_VERSION,
} from "../../navigation.js";
import { viewChaos, abandonChaos } from "../../chaos/client.js";
import { track } from "../../analytics.js";
import { getSession } from "../../identity.js";
import { markLobbyViewed, markModeSelected } from "../../activation.js";
import ModeGlyph from "./ModeGlyph.jsx";
import ModeSignature from "./ModeSignature.jsx";
import ContinueCard from "./ContinueCard.jsx";
import ResetDialog from "../arena/ResetDialog.jsx";
import { EraFractureDivider } from "../brand/EraFracture.jsx";
import { RUN_KEY, RUN_AT_KEY } from "./runStorage.js";
import { HERO_STATES, HERO_LINE, readHeroState } from "./heroState.js";

export { RUN_KEY, RUN_AT_KEY };
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

function ModeCard({ mode, action, primary, onAct }) {
  const badge = STATUS_LABEL[action.status];
  const descId = `ec-mode-desc-${mode.id}`;
  const actionLabel = actionLabelFor(mode, action.status);
  const hierarchy = actionHierarchyFor(mode, action.status);
  const isLink = !!action.href && action.intent !== "EXPLAIN_PREVIEW";
  const name = accessibleActionName(mode, action.status);
  const onClick = (e) => { e.preventDefault(); onAct(mode, action); };
  const actionProps = {
    onClick, "aria-label": name,
    "data-intent": action.intent, "data-hierarchy": hierarchy, "data-accent": mode.accentRole || null,
  };
  return (
    <article className={`ec-mode-card${primary ? " ec-mode-card--primary" : " ec-mode-card--secondary"}${mode.recommended ? " ec-mode-card--recommended" : ""}`}
      data-mode={mode.id} data-status={action.status} data-recommended={mode.recommended ? "true" : "false"}
      data-hierarchy={hierarchy} data-accent={mode.accentRole || null} data-signature={mode.visualSignature || null}
      aria-labelledby={`ec-mode-title-${mode.id}`} aria-describedby={descId}>
      {/* The mode's own low-opacity signature: decorative, ours, ignored by assistive tech. */}
      <ModeSignature id={mode.visualSignature} />
      <div className="ec-mode-card-top">
        <span className="ec-mode-glyph"><ModeGlyph id={mode.id} size={primary ? 34 : 26} /></span>
        {mode.recommended && <span className="ec-mode-flag">RECOMMENDED</span>}
        {badge && <span className={`ec-mode-badge ec-mode-badge--${badgeTone(action.status)}`}>{badge}</span>}
      </div>
      <h2 id={`ec-mode-title-${mode.id}`} className="ec-mode-title">{mode.label}</h2>
      <p id={descId} className="ec-mode-line">{mode.shortDescription}</p>
      {isLink ? (
        <a className="ec-mode-action" href={action.href} {...actionProps}>{actionLabel}</a>
      ) : (
        <button className="ec-mode-action" {...actionProps} aria-disabled={hierarchy === ACTION_HIERARCHY.UNAVAILABLE ? "true" : undefined}>{actionLabel}</button>
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
 * @param lab                     the theme lab / QA fixture: no run lookup, no telemetry, nothing read or written
 * @param fixture                 lab only — { hero, run }: a deterministic hero state and an optional frozen run
 */
export default function PlayLobby({
  tier = "GUEST", chaosAvailable = true, previewCandidateActive = false, entrance = false,
  onModeAction, onContinue, onAbandoned,
  lab = false, fixture = null,
}) {
  const { primary, secondary } = lobbyModes();
  const ctx = { from: PLAY_LOBBY_ROUTE, previewCandidateActive, chaosAvailable };
  // The hero is decided ONCE, synchronously, before the first paint — from the
  // remembered run, the career store and the session's returning flag (all of
  // which already exist). It never changes while the lobby is open, so the run
  // lookup below can never move the grid.
  const [hero] = useState(() => (lab ? (fixture?.hero || HERO_STATES.FULL) : readHeroState({ returningDevice: getSession().returning })));
  const [active, setActive] = useState(() => (lab
    ? { loading: false, run: fixture?.run || null, expired: false }
    : { loading: !!store.get(RUN_KEY), run: null, expired: false }));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const viewed = useRef(false);

  // A remembered run is READ, never advanced. Missing, abandoned or expired
  // runs are cleared so no false Continue card can ever be shown.
  useEffect(() => {
    if (lab) return undefined;
    const id = store.get(RUN_KEY);
    if (!viewed.current) {
      viewed.current = true;
      markLobbyViewed({ hasActiveRun: !!id, route: entrance ? "/" : PLAY_LOBBY_ROUTE, heroState: hero, lobbyPresentationVersion: LOBBY_PRESENTATION_VERSION });
    }
    if (!id) return undefined;
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
  }, [tier, entrance, hero, lab]);

  const act = (mode, action) => {
    if (!lab) markModeSelected(mode, action, entrance ? "/" : PLAY_LOBBY_ROUTE);
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

  const lastAt = lab ? null : (Number(store.get(RUN_AT_KEY)) || null);
  const compact = hero !== HERO_STATES.FULL;
  const line = compact
    ? HERO_LINE[hero]
    : entrance
      ? "Draft legends from every era and play the matchup possession by possession. Choose how you want to play."
      : "Choose how you want to play.";

  return (
    <main className="ec-lobby" aria-labelledby="ec-lobby-title" data-entrance={entrance ? "true" : "false"}
      data-hero={hero} data-presentation={LOBBY_PRESENTATION_VERSION}>
      {/* Phase 9A.2: the brand band. The Mk1 mark is designed for a dark ground
          (its platinum face vanishes on ivory), so the hero is an obsidian band
          over the ivory canvas, closed by the lobby's ONE fracture moment.
          Phase 9A.3P: the band is full for a first-time state and compact for a
          returning one — same mark, same band, less height, grid moved up. */}
      <header className={`ec-lobby-hero${compact ? " ec-lobby-hero--compact" : ""}`}>
        <img className="ec-lobby-logo" src="/brand/eraclash-logo-mk1.png" alt="EraClash Basketball" width="760" height="304" decoding="async" />
        <h1 id="ec-lobby-title" className="sr-only">Play EraClash Basketball</h1>
        <p className="ec-lobby-line">{line}</p>
      </header>
      <EraFractureDivider className="ec-lobby-fracture" />
      <div className="ec-lobby-body">

      {/* Phase 9A.3P: while a remembered run is being READ, a same-height pending
          card holds the Continue card's place, so the grid is already in its final
          position on the first paint and nothing moves when the server answers.
          It reveals nothing: no stage, no era, no roster. */}
      {active.loading && !active.run && !active.expired && (
        <section className="ec-continue ec-continue--pending" aria-busy="true" aria-labelledby="ec-continue-pending-title">
          <div className="ec-continue-glyph" aria-hidden="true"><ModeGlyph id="chaos" size={30} /></div>
          <div className="ec-continue-body">
            <h2 id="ec-continue-pending-title" className="ec-continue-title">CHECKING YOUR CHAOS CLASH</h2>
            <p className="ec-continue-line"><span>Reading the run this browser remembers</span></p>
            <p className="ec-continue-teams"><span className="ec-continue-team ec-continue-team--gold"><span className="ec-continue-team-name">TEAM GOLD</span> Your Five</span><span className="ec-continue-team ec-continue-team--blue"><span className="ec-continue-team-name">TEAM BLUE</span> Legend Rival</span></p>
          </div>
          <div className="ec-continue-actions"><span className="ec-continue-cta ec-continue-cta--pending" aria-hidden="true">CONTINUE</span></div>
        </section>
      )}
      {(active.run || active.expired) && (
        <ContinueCard run={active.run} expired={active.expired} lastActivityAt={lastAt} busy={busy}
          onContinue={() => { track("active_run_continue_clicked", { phase: active.run?.phase || null }); onContinue?.(active.run); }}
          onAbandon={() => { track("active_run_abandon_started", { phase: active.run?.phase || null }); setConfirm(true); }}
          onDismiss={() => { store.clear(); setActive({ loading: false, run: null, expired: false }); }} />
      )}

      <section className="ec-lobby-primary" aria-label="Game modes">
        {primary.map((m) => (
          <ModeCard key={m.id} mode={m} primary action={resolveModeAction(m, tier, ctx)} onAct={act} />
        ))}
      </section>

      <section className="ec-lobby-secondary" aria-label="More ways to play">
        <h2 className="ec-lobby-kicker">MORE WAYS TO PLAY</h2>
        <div className="ec-lobby-secondary-grid">
          {secondary.map((m) => (
            <ModeCard key={m.id} mode={m} primary={false} action={resolveModeAction(m, tier, ctx)} onAct={act} />
          ))}
        </div>
      </section>

      </div>
      <ResetDialog open={confirm} state="abandon" busy={busy} onConfirm={abandon} onCancel={() => setConfirm(false)} />
    </main>
  );
}
