// ── /dev/social-reference — the Clash Cards + Rivalries reference fixture ────
// Dev-fixtures build only (VITE_EC_DEV_FIXTURES=1); never in a production
// bundle. Renders the real components — CardComposer, ChallengesTab with its
// Rivalries subsection — over an in-page stand-in for the account route, so
// the signed-in surfaces can be measured (responsive, accessibility, export
// at output size) on a harness that has no account provider. The stand-in
// answers only the actions these components send and keeps a small state
// machine so ACCEPT / DECLINE / BLOCK / CANCEL / END behave as the server does.
import { useEffect, useState } from "react";
import CardComposer from "../../components/cards/CardComposer.jsx";
import ChallengesTab from "../../components/challenges/ChallengesTab.jsx";

const J = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", K = "33333333-3333-4333-8333-333333333333", D = "44444444-4444-4444-8444-444444444444";
const iso = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const rec = (w, l, t) => ({ wins: w, losses: l, ties: t, total: w + l + t });

const seed = () => ({
  rivalries: [
    { rivalryId: "r-active", contractVersion: "1.0.0", state: "active", pendingFromMe: false, pendingExpiresAt: null, lastClosedReason: null, lastClosedAt: null, blockedByMe: false, opponent: { name: "Marcus", deleted: false, publicSlug: "22222222222222222222" }, period: { periodNo: 2, startedAt: iso(240), record: rec(4, 3, 1) }, periods: 2 },
    { rivalryId: "r-incoming", contractVersion: "1.0.0", state: "pending", pendingFromMe: false, pendingExpiresAt: new Date(Date.now() + 5 * 86400_000).toISOString(), lastClosedReason: null, lastClosedAt: null, blockedByMe: false, opponent: { name: "A Very Long Display Name Here", deleted: false, publicSlug: null }, period: null, periods: 0 },
    { rivalryId: "r-outgoing", contractVersion: "1.0.0", state: "pending", pendingFromMe: true, pendingExpiresAt: new Date(Date.now() + 6 * 86400_000).toISOString(), lastClosedReason: null, lastClosedAt: null, blockedByMe: false, opponent: { name: "Bea", deleted: false, publicSlug: null }, period: null, periods: 0 },
    { rivalryId: "r-past", contractVersion: "1.0.0", state: "idle", pendingFromMe: false, pendingExpiresAt: null, lastClosedReason: "account_deleted", lastClosedAt: iso(500), blockedByMe: false, opponent: { name: "Deleted account", deleted: true, publicSlug: null }, period: null, periods: 1 },
  ],
  detail: {
    "r-active": { rivalryId: "r-active", contractVersion: "1.0.0", state: "active", pendingFromMe: false, blockedByMe: false, opponent: { name: "Marcus", deleted: false, publicSlug: "22222222222222222222" }, currentPeriodId: "p2",
      periods: [
        { periodId: "p2", periodNo: 2, startedAt: iso(240), endedAt: null, endReason: null, endedByMe: null, record: rec(4, 3, 1), streak: 2 },
        { periodId: "p1", periodNo: 1, startedAt: iso(900), endedAt: iso(600), endReason: "ended", endedByMe: true, record: rec(1, 2, 0), streak: 0 },
      ],
      events: [
        { eventId: "e8", periodNo: 2, completedAt: iso(2), rated: true, outcome: "win", code: "EC-ABCD-EFGH", iWasCreator: true, myScore: { gold: 108, blue: 90 }, theirScore: { gold: 101, blue: 97 }, era: "1990s" },
        { eventId: "e7", periodNo: 2, completedAt: iso(30), rated: true, outcome: "win", code: "EC-BCDE-FGHJ", iWasCreator: false, myScore: { gold: 99, blue: 92 }, theirScore: { gold: 95, blue: 96 }, era: "2010s" },
        { eventId: "e6", periodNo: 2, completedAt: iso(50), rated: false, outcome: "tie", code: "EC-CDEF-GHJK", iWasCreator: true, myScore: { gold: 100, blue: 90 }, theirScore: { gold: 110, blue: 100 }, era: "1970s" },
        { eventId: "e5", periodNo: 2, completedAt: iso(80), rated: true, outcome: "loss", code: "EC-DEFG-HJKL", iWasCreator: false, myScore: { gold: 88, blue: 97 }, theirScore: { gold: 104, blue: 90 }, era: "1960s" },
      ], eventCount: 11,
      pendingChallenges: [{ code: "EC-PQRS-TUVW", mine: true, createdAt: iso(1), expiresAt: new Date(Date.now() + 29 * 86400_000).toISOString(), started: false }] },
  },
  challenges: {
    status: "ok",
    created: [{ code: "EC-ABCD-EFGH", status: "open", createdAt: iso(3), expiresAt: new Date(Date.now() + 27 * 86400_000).toISOString(), revokedAt: null, creatorScore: { gold: 108, blue: 90 }, creatorOutcome: "win", creatorPerformance: 18, era: "1990s",
      responses: [
        { name: "Marcus", status: "completed", outcome: "win", score: { gold: 101, blue: 97 }, performance: 4, challengeOutcome: "creator", completedAt: iso(2), startedAt: iso(2.5), attemptId: "a0000000-0000-4000-8000-000000000001", account: true },
        { name: "Guest", status: "completed", outcome: "loss", score: { gold: 90, blue: 99 }, performance: -9, challengeOutcome: "creator", completedAt: iso(1), startedAt: iso(1.5), attemptId: "a0000000-0000-4000-8000-000000000002", account: false },
      ] }],
    accepted: [{ code: "EC-BCDE-FGHJ", creatorName: "Marcus", status: "completed", challengeStatus: "open", creatorScore: { gold: 95, blue: 96 }, creatorOutcome: "loss", era: "2010s", yourScore: { gold: 99, blue: 92 }, yourOutcome: "win", yourPerformance: 7, challengeOutcome: "recipient", startedAt: iso(31), completedAt: iso(30), attemptId: "a0000000-0000-4000-8000-000000000003", creatorAccount: true,
      original: { code: "EC-BCDE-FGHJ", creatorName: "Marcus", era: "2010s", eraCustom: false, creatorScore: { gold: 95, blue: 96 }, creatorOutcome: "loss", creatorPerformance: -1, creatorRoster: [{ id: "x", name: "A. Guard" }, { id: "y", name: "B. Wing" }], creatorCoach: { name: "P. Coach" }, creatorMvp: null } }],
  },
  competitive: { status: "ok", rating: 1042, record: { wins: 5, losses: 3, ties: 1, matches: 9 }, provisional: false, rank: 12, history: [{ opponent: "Marcus", outcome: "win", delta: 18, before: 1024, after: 1042, at: iso(2) }] },
  cards: {
    result: { kind: "result", cardVersion: "1.0.0", score: { gold: 108, blue: 90 }, outcome: "win", margin: 18, era: "1990s", eraCustom: false, guest: false, displayName: "Joseph", completedAt: iso(0) },
    resultGuest: { kind: "result", cardVersion: "1.0.0", score: { gold: 94, blue: 101 }, outcome: "loss", margin: 7, era: "2010s-pace-and-space", eraCustom: true, guest: true, displayName: null, completedAt: iso(0) },
    resultTie: { kind: "result", cardVersion: "1.0.0", score: { gold: 100, blue: 100 }, outcome: "tie", margin: 0, era: null, eraCustom: false, guest: false, displayName: "Maximilian Bartholomew-Q", completedAt: iso(0) },
    invitation: { kind: "invitation", cardVersion: "1.0.0", code: "EC-ABCD-EFGH", creatorName: "Joseph", creatorScore: { gold: 108, blue: 90 }, creatorOutcome: "win", era: "1990s", eraCustom: false, expiresAt: new Date(Date.now() + 27 * 86400_000).toISOString(), url: `${window.location.origin}/?challenge=EC-ABCD-EFGH` },
  },
});

/** The stand-in account route: answers the social/challenge actions these components send. */
const installStandIn = (state, variant) => {
  const real = window.fetch.bind(window);
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  window.fetch = (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("/api/profile") || (init.method || "GET") !== "POST") return real(input, init);
    let body = {}; try { body = JSON.parse(init.body || "{}"); } catch { body = {}; }
    const a = body.action;
    if (a === "challenge-list") return json(state.challenges);
    if (a === "competitive-me") return json(state.competitive);
    if (a === "rivalry-list") return json({ status: "ok", contractVersion: "1.0.0", rivalries: state.rivalries, limits: { requestTtlDays: 7, requestsPerDay: 10, maxOutgoing: 5 } });
    if (a === "rivalry-detail") { const d = state.detail[body.rivalryId]; return d ? json({ status: "ok", rivalry: d }) : json({ status: "not_yours" }, 404); }
    if (a === "rivalry-request") { const exists = state.rivalries.find((r) => r.rivalryId === "r-req"); if (exists) return json({ status: "already_pending", rivalryId: "r-req" }); state.rivalries.unshift({ rivalryId: "r-req", contractVersion: "1.0.0", state: "pending", pendingFromMe: true, pendingExpiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(), lastClosedReason: null, lastClosedAt: null, blockedByMe: false, opponent: { name: "Marcus", deleted: false, publicSlug: null }, period: null, periods: 0 }); return json({ status: "requested", rivalryId: "r-req" }); }
    if (a === "rivalry-respond") {
      const r = state.rivalries.find((x) => x.rivalryId === body.rivalryId); if (!r) return json({ status: "not_yours" }, 404);
      const act = body.rivalryAction;
      if (act === "accept") { if (r.state !== "pending" || r.pendingFromMe) return json({ status: "not_pending" }, 409); Object.assign(r, { state: "active", pendingExpiresAt: null, period: { periodNo: 1, startedAt: new Date().toISOString(), record: rec(0, 0, 0) }, periods: 1 }); state.detail[r.rivalryId] = { ...r, currentPeriodId: "pnew", periods: [{ periodId: "pnew", periodNo: 1, startedAt: r.period.startedAt, endedAt: null, endReason: null, endedByMe: null, record: rec(0, 0, 0), streak: 0 }], events: [], eventCount: 0, pendingChallenges: [] }; return json({ status: "accepted", rivalryId: r.rivalryId }); }
      if (act === "decline" || act === "cancel") { if (r.state !== "pending") return json({ status: "not_pending" }, 409); Object.assign(r, { state: "idle", pendingExpiresAt: null, lastClosedReason: act === "decline" ? "declined" : "canceled", lastClosedAt: new Date().toISOString() }); return json({ status: act === "decline" ? "declined" : "canceled", rivalryId: r.rivalryId }); }
      if (act === "end") { if (r.state !== "active") return json({ status: "not_active" }, 409); Object.assign(r, { state: "idle", period: null, lastClosedReason: "ended", lastClosedAt: new Date().toISOString() }); return json({ status: "ended", rivalryId: r.rivalryId }); }
      if (act === "block") { Object.assign(r, { state: "idle", period: null, pendingExpiresAt: null, blockedByMe: true, lastClosedReason: "blocked", lastClosedAt: new Date().toISOString() }); return json({ status: "blocked", rivalryId: r.rivalryId }); }
      if (act === "unblock") { r.blockedByMe = false; return json({ status: "unblocked", rivalryId: r.rivalryId }); }
      return json({ status: "failed" }, 502);
    }
    if (a === "card-result") return json({ status: "ok", card: state.cards[variant === "guest" ? "resultGuest" : variant === "tie" ? "resultTie" : "result"] });
    if (a === "card-invitation") return json({ status: "ok", card: state.cards.invitation });
    return json({ error: "VALIDATION_FAILURE" }, 400);
  };
  return () => { window.fetch = real; };
};

export default function SocialReferenceFixture() {
  const [ready, setReady] = useState(false);
  const variant = new URLSearchParams(window.location.search).get("card") || "account";
  useEffect(() => { const restore = installStandIn(seed(), variant); setReady(true); return restore; }, [variant]);
  if (!ready) return null;
  const signedIn = variant !== "guest";
  return (
    <main className="ec-me-page" style={{ maxWidth: 760, margin: "0 auto", padding: "16px 16px 60px", display: "grid", gap: 16 }} data-fixture="social-reference">
      <h1 style={{ fontFamily: "var(--ec-display)", fontSize: 22, margin: 0 }}>Clash Cards + Rivalries — reference fixture</h1>
      <section data-fixture="composer" className="ec-me-card">
        <h2 className="ec-me-section">Card composer · {variant}</h2>
        <CardComposer chaosRunId="fixturerun01" accessToken={signedIn ? "fixture-token" : null} challengeCode={signedIn ? "EC-ABCD-EFGH" : null} challengeUrl={signedIn ? `${window.location.origin}/?challenge=EC-ABCD-EFGH` : null} entryPoint="fixture" />
      </section>
      <section data-fixture="challenges">
        <ChallengesTab accessToken="fixture-token" displayName="Joseph" socialEnabled onChallengeAgain={() => { document.body.setAttribute("data-challenge-again", "1"); }} onOpenProfile={(p) => { document.body.setAttribute("data-open-profile", p); }} />
      </section>
    </main>
  );
}
