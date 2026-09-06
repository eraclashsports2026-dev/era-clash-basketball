// ── /dev/progression-reference — the real components, in every state ────────
// Phase 9D. A dev-only fixture (same VITE_EC_DEV_FIXTURES gate as the Time
// Arena reference): the CAREER PROGRESS postgame module in its earned,
// level-up, unlock, guest and pending states, the Overview progression hero and
// the Achievements page, rendered from data the REAL contract derives from
// representative records. Nothing here is sample copy typed by hand; what the
// server would compute is what is shown, so the responsive, accessibility and
// performance gates measure the product's own components and stylesheet.
// Never shipped: the route exists only in a fixtures build.
import { useState } from "react";
import CareerProgress from "../../components/progression/CareerProgress.jsx";
import ProgressionHero from "../../components/progression/ProgressionHero.jsx";
import AchievementsTab from "../../components/progression/AchievementsTab.jsx";
import { expectedAwards, factsFromRecords, evaluateAchievements, achievementAwards, achievementSummary, levelForXp, progressionDelta, awardLabel, reasonCategory, totalOf, PROGRESSION_VERSION, LEVEL_CURVE_VERSION, ACHIEVEMENT_CATALOG_VERSION } from "../../progression/contract.js";

const clash = (n, o = {}) => ({ result_id: `fixture${String(n).padStart(3, "0")}`, mode: o.mode || "chaos", outcome: o.outcome || "win", era_id: o.era || "1990s", gold_score: o.gold ?? 112, blue_score: o.blue ?? 101, gold_coach: { id: o.coach || "riley", name: o.coach || "Riley" }, gold_roster: [{ id: "pettit-50s" }, { id: "schayes-50s" }, { id: "mikan-50s" }], played_at: `2026-08-${String(10 + n).padStart(2, "0")}T18:00:00Z` });
const RECORDS = {
  clashes: [clash(1), clash(2, { outcome: "loss", gold: 95, era: "1980s" }), clash(3, { era: "2000s", coach: "popovich" }), clash(4, { era: "1970s", gold: 104, blue: 102 }), clash(5, { mode: "single", era: "2010s", coach: "jackson" }),
    clash(6, { outcome: "loss", gold: 88, era: "1960s" }), clash(7, { era: "1950s", gold: 120, blue: 99 }), clash(8, { outcome: "tie", gold: 100, blue: 100, era: "2020s" }), clash(9), clash(10, { era: "1980s" }), clash(11), clash(12, { outcome: "loss", gold: 90 })],
  attempts: [{ id: "fixture-attempt-1", status: "completed", challenge_outcome: "recipient" }, { id: "fixture-attempt-2", status: "completed", challenge_outcome: "creator" }],
  responses: [{ id: "fixture-response-1", status: "completed" }],
};
const facts = factsFromRecords(RECORDS);
const awards = expectedAwards(RECORDS);
const evaluated = evaluateAchievements(facts, []);
const unlockAwards = achievementAwards(evaluated);
const totalXp = totalOf(awards) + totalOf(unlockAwards);
const unlockedAt = "2026-09-06T14:00:00Z";
const progression = {
  status: "ok",
  profile: { ...levelForXp(totalXp), progressionVersion: PROGRESSION_VERSION, levelCurveVersion: LEVEL_CURVE_VERSION, catalogVersion: ACHIEVEMENT_CATALOG_VERSION },
  facts,
  achievements: evaluated.map((a) => ({ ...a, unlockedAt: a.unlocked ? unlockedAt : null, newlyUnlocked: false })),
  summary: achievementSummary(evaluated),
  delta: progressionDelta({ awarded: [], unlocked: [], totalXp }),
  repaired: { awards: 0, unlocks: 0 },
};
const compact = (awarded, unlockedIds, total) => {
  const d = progressionDelta({ awarded, unlocked: unlockedIds, totalXp: total });
  return { status: "ok", xpDelta: d.xpDelta, awarded: awarded.map((a) => ({ label: awardLabel(a), category: reasonCategory(a), xpDelta: a.xpDelta })),
    unlocked: evaluated.filter((a) => unlockedIds.includes(a.id)).map((a) => ({ id: a.id, name: a.name, category: a.category, xp: a.xp })),
    before: { level: d.before.level }, after: progression.profile, levelUp: d.levelUp, levelsGained: d.levelsGained, summary: progression.summary };
};
// One ordinary Clash: completion + win, at a total that sits inside a level.
const ordinary = compact([{ sourceType: "clash", sourceId: "fixture011", reason: "completion", xpDelta: 100 }, { sourceType: "clash", sourceId: "fixture011", reason: "win", xpDelta: 25 }], [], totalXp);
// A Clash that crossed a level: the same lines plus a New Era bonus, and a total exactly past a threshold.
const crossing = (() => { const p = levelForXp(totalXp); const at = (p.nextLevelAt ?? totalXp) + 20; const lines = [{ sourceType: "clash", sourceId: "fixture012", reason: "completion", xpDelta: 100 }, { sourceType: "clash", sourceId: "fixture012", reason: "win", xpDelta: 25 }, { sourceType: "era", sourceId: "1960s", reason: "first_completion", xpDelta: 50 }]; const c = compact(lines, [], at); return { ...c, after: { ...levelForXp(at), progressionVersion: PROGRESSION_VERSION } }; })();
// A Clash that unlocked three achievements at once (one list, not three popups).
const unlockIds = ["first_win", "time_traveler", "ten_clashes"];
const unlocking = compact([{ sourceType: "clash", sourceId: "fixture010", reason: "completion", xpDelta: 100 }, { sourceType: "clash", sourceId: "fixture010", reason: "win", xpDelta: 25 }, ...unlockIds.map((id) => ({ sourceType: "achievement", sourceId: id, reason: "unlock", xpDelta: evaluated.find((a) => a.id === id).xp }))], unlockIds, totalXp);

const Block = ({ id, title, children }) => (
  <section data-fixture={id} style={{ display: "grid", gap: 8 }}>
    <h2 style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-text-muted, #93a0b5)" }}>{title}</h2>
    {children}
  </section>
);

export default function ProgressionReferenceFixture() {
  const [tab, setTab] = useState("overview");
  return (
    <div style={{ minHeight: "100vh", background: "#03070d" }}>
      <main aria-labelledby="ec-prf-title" className="ec-arena-page" style={{ maxWidth: 920, margin: "0 auto", padding: "16px 16px 64px", display: "grid", gap: 22 }}>
        <h1 id="ec-prf-title" style={{ margin: 0, fontSize: 14, letterSpacing: 2, color: "var(--ec-a-text, #f5f7fb)" }}>PROGRESSION REFERENCE · {facts.clashes} CLASHES · LEVEL {progression.profile.level}</h1>
        <Block id="postgame-xp" title="POSTGAME · ORDINARY CLASH"><CareerProgress resultId="fixture011" mode="chaos" signedIn outcome={ordinary} onViewAchievements={() => setTab("achievements")} /></Block>
        <Block id="level-up" title="POSTGAME · LEVEL UP"><CareerProgress resultId="fixture012" mode="chaos" signedIn outcome={crossing} onViewAchievements={() => setTab("achievements")} /></Block>
        <Block id="achievement-unlock" title="POSTGAME · THREE UNLOCKS"><CareerProgress resultId="fixture010" mode="chaos" signedIn outcome={unlocking} onViewAchievements={() => setTab("achievements")} /></Block>
        <Block id="postgame-guest" title="POSTGAME · GUEST"><CareerProgress resultId="fixture-guest" mode="chaos" signedIn={false} onSignIn={() => {}} /></Block>
        <Block id="postgame-pending" title="POSTGAME · SAVING"><CareerProgress resultId="fixture-pending" mode="chaos" signedIn pending outcome={null} /></Block>
        <Block id="postgame-light" title="POSTGAME · REPORT PAGE (LIGHT SURFACE)">
          <div style={{ background: "var(--ec-t-bg, #f2efe8)", padding: 12, borderRadius: 14 }}><CareerProgress surface="light" resultId="fixture011" mode="single" signedIn outcome={ordinary} onViewAchievements={() => setTab("achievements")} /></div>
        </Block>
        <Block id="overview" title="MY ERACLASH · OVERVIEW HERO">
          <div style={{ background: "var(--ec-t-bg, #f2efe8)", padding: 12, borderRadius: 14 }}><ProgressionHero progression={progression} displayName="Joseph" onOpenAchievements={() => setTab("achievements")} /></div>
        </Block>
        <Block id="achievements" title={`MY ERACLASH · ACHIEVEMENTS (${tab === "achievements" ? "opened from a module" : "page"})`}>
          <div style={{ background: "var(--ec-t-bg, #f2efe8)", padding: 12, borderRadius: 14 }}><AchievementsTab progression={progression} /></div>
        </Block>
      </main>
    </div>
  );
}
