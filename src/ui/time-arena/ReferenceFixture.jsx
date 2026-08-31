// ── Development-only canonical reference state ───────────────────────────────
// Renders the REAL Time Arena components in the exact state the canonical
// reference depicts, so geometry measurement and screenshot comparison run
// against the product rather than a mock-up of it:
//
//   Roll 2 of 3 · era revealed · three held a side · three coach offers
//   · a clearly labelled PREVIOUS result in the dock
//
// The run is produced by the REAL state machine from a fixed seed, so none of
// the draft is invented: the same code path a player walks produces this board.
// Only the previous RESULT is fixture data — running the possession engine in
// the browser is not something this route should pull into the bundle — and it
// is confined to this file, which production never imports.
//
// Availability: this module is reached only when the build sets
// VITE_EC_DEV_FIXTURES=1 (see npm run build:visual-qa) or under the dev server.
// A production build eliminates the route and this module with it.
import { useMemo, useState } from "react";
import { startRun, submitRollDecisions, publicView } from "../../chaos/runState.js";
import { PLAYERS, POSITIONS } from "../../players.js";
import ArenaHeader from "../../components/arena/ArenaHeader.jsx";
import TimeArena from "../../components/arena/TimeArena.jsx";

/** The seed whose Roll 2 state matches the reference: three held on each side,
    era revealed, three offers on the table. Found by search, then frozen. */
export const FIXTURE_SEED = "fixture0000000";
const FIXTURE_HOLDS = ["PG", "SG", "SF"];

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const hydrate = (arr) => Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr?.[i]) || null]));

/** The canonical run view, from the real machine. */
export const fixtureRun = () => {
  const run = startRun({ runId: "fixturerun01", seedId: FIXTURE_SEED, createdAt: 1_760_000_000_000 });
  const keptRole = run.coachOffers.gold[0].role;
  submitRollDecisions(run, { holdSlots: FIXTURE_HOLDS, holdRoles: [keptRole], hydrate });
  const view = publicView(run, { hydrate, includeCpuHolds: true, eraChange: { allowed: false, reason: "NOT_ENTITLED" } });
  return view;
};

/**
 * A previous result for the dock. FIXTURE DATA — the only invented values in
 * this file, present because the reference's dock shows a finished game and the
 * possession engine does not belong in the client bundle. Nothing here is
 * reachable from production code.
 */
const fixturePriorResult = () => ({
  w: true,
  record: { eraId: "1960s" },
  sim: {
    finalScore: { gold: 118, blue: 111 },
    mvp: "Kareem Abdul-Jabbar",
    mvpLine: { name: "Kareem Abdul-Jabbar", pts: 38, reb: 14, ast: 5, stl: 1, blk: 3 },
    story: {
      headline: "How Gold won",
      body: "Kareem Abdul-Jabbar controlled the game with 38 points and 14 rebounds. Gold turned a two-point third quarter into a seven-point cushion and never gave it back.",
    },
    eraImpact: "1960s impact: no three-point line, so every field goal paid two and interior scoring carried the night.",
    v3: {
      periodScores: [
        { gold: 28, blue: 30 }, { gold: 31, blue: 26 },
        { gold: 29, blue: 27 }, { gold: 30, blue: 28 },
      ],
      keyMoments: [
        { period: "Q3", text: "Gold went to the post on six straight possessions." },
        { period: "Q4", text: "Blue's perimeter shooting cooled and the lead held." },
      ],
      fullBox: {
        gold: [
          { name: "Nate Archibald", pts: 22, fgm: 9, fga: 19, oreb: 1, dreb: 3, ast: 9, stl: 2, blk: 0, to: 3 },
          { name: "Stephen Curry", pts: 26, fgm: 10, fga: 21, oreb: 0, dreb: 4, ast: 6, stl: 1, blk: 0, to: 2 },
          { name: "Antawn Jamison", pts: 14, fgm: 6, fga: 14, oreb: 3, dreb: 6, ast: 2, stl: 1, blk: 1, to: 1 },
          { name: "Fred Hetzel", pts: 18, fgm: 8, fga: 16, oreb: 4, dreb: 7, ast: 1, stl: 0, blk: 1, to: 2 },
          { name: "Alonzo Mourning", pts: 38, fgm: 15, fga: 24, oreb: 5, dreb: 9, ast: 5, stl: 1, blk: 3, to: 2 },
        ],
        blue: [
          { name: "Gilbert Arenas", pts: 24, fgm: 10, fga: 22, oreb: 1, dreb: 2, ast: 5, stl: 2, blk: 0, to: 4 },
          { name: "Kyrie Irving", pts: 27, fgm: 11, fga: 23, oreb: 0, dreb: 3, ast: 7, stl: 1, blk: 0, to: 3 },
          { name: "Dwyane Wade", pts: 21, fgm: 9, fga: 18, oreb: 2, dreb: 5, ast: 4, stl: 3, blk: 1, to: 2 },
          { name: "Bob McAdoo", pts: 19, fgm: 8, fga: 17, oreb: 3, dreb: 8, ast: 2, stl: 0, blk: 2, to: 1 },
          { name: "Artis Gilmore", pts: 20, fgm: 8, fga: 15, oreb: 4, dreb: 10, ast: 1, stl: 1, blk: 2, to: 2 },
        ],
      },
      coaching: {
        gold: { coach: "Rudy Tomjanovich", openingPlan: { actions: [{ action: "Post up" }] }, defense: { shell: "Man-to-man under illegal-defense rules" }, adjustments: [{ text: "Sent more help to the paint after the first quarter." }] },
        blue: { coach: "Gregg Popovich", openingPlan: { actions: [{ action: "Motion" }] }, defense: { shell: "Man-to-man, hard closeouts" }, adjustments: [{ text: "Switched the primary defender onto the post in the third." }] },
      },
    },
    expandedAnalysis: {
      sections: [
        { heading: "The result", body: "Gold won 118-111 in a game that turned in the third quarter." },
        { heading: "Who decided it", body: "Alonzo Mourning's 38 points and 14 rebounds carried the interior." },
      ],
    },
  },
});

export default function ReferenceFixture() {
  const run = useMemo(fixtureRun, []);
  const prior = useMemo(fixturePriorResult, []);
  const [chaosRun, setChaosRun] = useState(run);

  return (
    <div className="arena ec-arena-shell ec-arena-page">
      <ArenaHeader
        nav="Play" onNav={() => {}} tier="FREE" activeModeId="chaos"
        onModeAction={() => {}} onNavigate={() => {}} onCreateAccount={() => {}}
        onHowModes={() => {}} onAccountChanged={() => {}} previewCandidateActive={false} />
      <main className="ec-arena-court">
        <TimeArena
          tier="FREE" chaosRun={chaosRun} onRunChange={setChaosRun} resume={false}
          onReady={() => {}} onGated={() => {}}
          phase="draft" result={null} priorResult={prior.sim ? prior : null} priorAt={Date.now() - 3 * 60 * 1000}
          simStage="" busy={false} error={null}
          onRunClash={() => {}} onViewFullReport={() => {}} onRunItBack={() => {}}
          onNewClash={() => {}} onChallenge={null} onEraChange={() => {}}
          onGuide={() => {}} onSettings={() => {}} onMembership={() => {}} />
      </main>
    </div>
  );
}
