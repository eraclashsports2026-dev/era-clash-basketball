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
import PlayerCard from "../../components/arena/PlayerCard.jsx";
import AccountGate from "../../components/chaos/AccountGate.jsx";
import { MembershipPage } from "../../components/arena/InfoPages.jsx";
import { applyTheme, THEME_IDS, getTheme, PRODUCTION_THEME_ID } from "../../theme/themeResolver.js";
import { LAB_FIXTURE_IDS, FIXTURE_LABELS, labRun, labResult, labTeams, labMeta } from "./labFixtures.js";
import { UNIFORM_TESTS } from "./uniformFixtures.js";

const noop = () => {};
const query = () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);

/** Which shell a fixture lives in — the same one the product uses for that surface. */
const SHELL = {
  lobby: "arena", empty: "arena", roll2: "arena", coach: "arena", result: "arena",
  // The full postgame is a reading surface in the product: the light shell.
  postgame: "reading",
  // Phase 9A.2: the portrait tests live in the arena; the gate is the light page;
  // the membership page is an arena-token surface under the editorial shell.
  portraits: "arena", gate: "reading", membership: "editorial", simulating: "arena",
};

export default function ThemeLab() {
  const q = query();
  // Phase 9A.2: the default entry is the PRODUCTION theme; the four candidates
  // remain selectable for historical comparison.
  const theme = THEME_IDS.includes(q.get("theme")) ? q.get("theme") : PRODUCTION_THEME_ID;
  const fixture = LAB_FIXTURE_IDS.includes(q.get("fixture")) ? q.get("fixture") : "lobby";
  const chrome = q.get("chrome") !== "0"; // the lab's own strip, outside the product screenshot
  const stageOff = q.get("stage") === "0"; // the pre-9A.2 portrait layer, for the before/after measurement
  const t = getTheme(theme);

  // data-theme on the document is the ONLY variable. On unmount the PRODUCT
  // theme is restored, so nothing leaks if the app is navigated afterwards.
  useEffect(() => { applyTheme(theme); return () => applyTheme(PRODUCTION_THEME_ID); }, [theme]);

  const run = useMemo(() => (fixture === "roll2" ? labRun("roll2") : fixture === "coach" ? labRun("coach") : fixture === "result" || fixture === "simulating" ? labRun("ready") : null), [fixture]);
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
  } else if (fixture === "simulating") {
    // The possession engine is not in the client bundle, so this is the frozen
    // READY run rendered in the simulating phase: the central fracture holds and
    // the dock shows the real progress phases.
    body = arena("simulating", { simStage: "Simulating possessions", busy: true });
  } else if (fixture === "portraits") {
    // Ten cards from the frozen Roll 2 board, each carrying one synthetic uniform
    // test figure (or the silhouette fallback) on the shared portrait stage.
    const roll2 = labRun("roll2");
    const gold = roll2.gold.roster, blue = roll2.blue.roster;
    const card = (side, i) => (side === "gold" ? gold : blue)[i];
    body = (
      <main className="ec-arena-court">
        <section className="ec-ta-stage" aria-label="Portrait stage uniform tests" data-focus="other" style={{ margin: "14px 18px" }}>
          <h1 className="sr-only">Portrait stage uniform tests</h1>
          <div className="ec-ta-stage-head">
            <div className="ec-ta-team-label"><div className="ec-ta-team-name" style={{ color: "var(--ec-a-gold)" }}>TEAM GOLD</div><div className="ec-ta-team-sub">UNIFORM TESTS</div></div>
            <div className="ec-ta-title"><div className="ec-ta-title-main">PORTRAIT STAGE</div><div className="ec-ta-title-sub">{stageOff ? "PRE-9A.2 LAYER" : "NIGHT COURT V1"}</div></div>
            <div className="ec-ta-team-label ec-ta-team-label--blue"><div className="ec-ta-team-name" style={{ color: "var(--ec-a-blue)" }}>TEAM BLUE</div><div className="ec-ta-team-sub">UNIFORM TESTS</div></div>
          </div>
          <div className="ec-ta-roster">
            <div className="ec-ta-team" data-team="gold">
              {UNIFORM_TESTS.filter((u) => u.team === "gold").map((u, i) => (
                <div key={u.id} data-uniform={u.id} data-jersey={u.jersey || ""} style={{ display: "contents" }}>
                  <PlayerCard card={card("gold", i)} team="gold" locked testArt={u.art} />
                </div>
              ))}
            </div>
            <div className="ec-ta-roster-divider" aria-hidden="true" />
            <div className="ec-ta-team" data-team="blue">
              {UNIFORM_TESTS.filter((u) => u.team === "blue").map((u, i) => (
                <div key={u.id} data-uniform={u.id} data-jersey={u.jersey || ""} style={{ display: "contents" }}>
                  <PlayerCard card={card("blue", i)} team="blue" locked testArt={u.art} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  } else if (fixture === "gate") {
    body = (
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 16px 60px" }}>
        <AccountGate title="Dream Matchup" blurb="Create a free account to build any five from any era and run the matchup." onCreated={noop} onBack={noop} />
      </main>
    );
  } else if (fixture === "membership") {
    body = (
      <main>
        <MembershipPage query={new URLSearchParams("feature=win82&from=/play")} onBack={noop} onCreateAccount={noop} />
      </main>
    );
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
            {LAB_FIXTURE_IDS.map((id) => (
              <a key={id} href={`?theme=${theme}&fixture=${id}`} aria-current={id === fixture ? "page" : undefined}>{FIXTURE_LABELS[id]}</a>
            ))}
          </nav>
        </div>
      )}
      <div className={`arena${shell === "arena" ? " ec-arena-shell ec-arena-page" : shell === "editorial" ? " ec-arena-shell ec-arena-page ec-editorial-shell" : ""}`}
        data-theme-lab="true" data-lab-theme={theme} data-lab-fixture={fixture} data-stage-off={stageOff ? "true" : "false"}>
        {header}
        {body}
      </div>
    </>
  );
}
