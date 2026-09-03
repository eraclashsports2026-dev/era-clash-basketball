// ── The Basketball theme decision lab ────────────────────────────────────────
// /dev/basketball-theme-lab?theme=<id>&fixture=<id>
//
// One DOM, four themes. This page renders the PRODUCT's own components —
// ArenaHeader, PlayLobby, TimeArena, Postgame — in six deterministic states, and
// the only thing the query string changes is data-theme on the document. It is
// owner-only at the edge, compiled out of production, and linked from nowhere
// in the product. There is no theme picker anywhere else.
import { useEffect, useMemo, useState } from "react";
import ArenaHeader from "../../components/arena/ArenaHeader.jsx";
import TimeArena from "../../components/arena/TimeArena.jsx";
import PlayLobby from "../../components/lobby/PlayLobby.jsx";
import Postgame from "../../components/Postgame.jsx";
import { applyTheme, THEME_IDS, getTheme, CONTROL_THEME_ID } from "../../theme/themeResolver.js";
import { FIXTURE_IDS, FIXTURE_LABELS, labRun, labResult, labTeams, labMeta } from "./labFixtures.js";

const noop = () => {};
const query = () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);

/** Which shell a fixture lives in — the same one the product uses for that surface. */
const SHELL = {
  lobby: "arena", empty: "arena", roll2: "arena", coach: "arena", result: "arena",
  // The full postgame is a reading surface in the product: the light shell.
  postgame: "reading",
};

export default function ThemeLab() {
  const q = query();
  const theme = THEME_IDS.includes(q.get("theme")) ? q.get("theme") : CONTROL_THEME_ID;
  const fixture = FIXTURE_IDS.includes(q.get("fixture")) ? q.get("fixture") : "lobby";
  const chrome = q.get("chrome") !== "0"; // the lab's own strip, outside the product screenshot
  const t = getTheme(theme);

  // data-theme on the document is the ONLY variable. It is removed on unmount so
  // nothing leaks into the product if the app is navigated afterwards.
  useEffect(() => { applyTheme(theme); return () => applyTheme(null); }, [theme]);

  const run = useMemo(() => (fixture === "roll2" ? labRun("roll2") : fixture === "coach" ? labRun("coach") : fixture === "result" ? labRun("ready") : null), [fixture]);
  const result = useMemo(labResult, []);
  const teams = useMemo(labTeams, []);
  const meta = useMemo(labMeta, []);
  const [chaosRun, setChaosRun] = useState(run);
  useEffect(() => { setChaosRun(run); }, [run]);

  const shell = SHELL[fixture];
  const header = (
    <ArenaHeader nav="Play" onNav={noop} tier="FREE" activeModeId={fixture === "lobby" ? null : "chaos"}
      onModeAction={noop} onNavigate={noop} onCreateAccount={noop} onHowModes={noop} onAccountChanged={noop} previewCandidateActive={false} />
  );

  const arena = (phase, extra = {}) => (
    <main className="ec-arena-court">
      <TimeArena tier="FREE" chaosRun={chaosRun} onRunChange={setChaosRun} resume={false}
        onReady={noop} onGated={noop}
        phase={phase} result={phase === "complete" ? result : null}
        priorResult={phase === "complete" ? null : result} priorAt={Date.now() - 3 * 60 * 1000}
        simStage="" busy={false} error={null}
        onRunClash={noop} onViewFullReport={noop} onRunItBack={noop} onNewClash={noop} onChallenge={null}
        onEraChange={noop} onGuide={noop} onSettings={noop} onMembership={noop} {...extra} />
    </main>
  );

  let body = null;
  if (fixture === "lobby") {
    body = (
      <div className="ec-arena-court ec-lobby-court">
        <PlayLobby tier="FREE" chaosAvailable previewCandidateActive={false} entrance onModeAction={noop} onContinue={noop} onAbandoned={noop} lab />
      </div>
    );
  } else if (fixture === "empty" || fixture === "roll2" || fixture === "coach") {
    body = arena("draft");
  } else if (fixture === "result") {
    body = arena("complete");
  } else if (fixture === "postgame") {
    body = (
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "8px 16px 60px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Postgame sim={result.sim} won={result.w} mode="single" team={teams.gold} opp={teams.blue}
            feedbackCtx={null} narrativeStatus="none" persisted
            onRematch={noop} onBest7={null} onChallenge={noop} onSwap={noop} onShare={noop} onLeaderboard={noop} />
        </div>
      </main>
    );
  }

  return (
    <>
      {chrome && (
        <div className="ec-theme-lab-strip" data-theme-lab-chrome="true" aria-label="Theme lab controls">
          <strong>THEME LAB</strong>
          <span>{t.role}: {t.label}</span>
          <span>·</span>
          <span>{FIXTURE_LABELS[fixture]}</span>
          <span>·</span>
          <span>seed {meta.seedId} · {meta.eraId} · {meta.candidate}</span>
          <nav aria-label="Themes" style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {THEME_IDS.map((id) => (
              <a key={id} href={`?theme=${id}&fixture=${fixture}`} aria-current={id === theme ? "page" : undefined}>{getTheme(id).label}</a>
            ))}
          </nav>
          <nav aria-label="Fixtures" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FIXTURE_IDS.map((id) => (
              <a key={id} href={`?theme=${theme}&fixture=${id}`} aria-current={id === fixture ? "page" : undefined}>{FIXTURE_LABELS[id]}</a>
            ))}
          </nav>
        </div>
      )}
      <div className={`arena${shell === "arena" ? " ec-arena-shell ec-arena-page" : ""}`}
        data-theme-lab="true" data-lab-theme={theme} data-lab-fixture={fixture}>
        {header}
        {body}
      </div>
    </>
  );
}
