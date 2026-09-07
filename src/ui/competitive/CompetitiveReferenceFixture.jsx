// ── /dev/competitive-reference — the real components, in every state ────────
// Phase 9E. Dev-only (VITE_EC_DEV_FIXTURES). The leaderboard in its populated,
// empty, provisional, private and signed-out states, AROUND ME, the rating
// movement (rated and unrated), the Overview competitive module and the privacy
// setting — rendered from rows the REAL contract orders and a rating the REAL
// contract computes, so the gates measure the product's own components.
import { useState } from "react";
import { LeaderboardView } from "../../components/competitive/LeaderboardPage.jsx";
import RatingChange from "../../components/competitive/RatingChange.jsx";
import CompetitiveModule from "../../components/competitive/CompetitiveModule.jsx";
import VisibilitySetting from "../../components/competitive/VisibilitySetting.jsx";
import { orderLeaderboard, publicRow, rateMatch, placementProgress, winPct } from "../../competitive/contract.js";

// "Joseph" sits mid-table on purpose: AROUND ME then shows the whole window
// (two above, me, two below), and the rating tie at the top still demonstrates
// the wins tie-break. The near-the-top short window is covered server-side.
const NAMES = ["Marcus Bell", "Nia Grant", "Ava Okafor", "Dee Rivera", "Sam Whitlock", "Joseph", "Theo Park", "Bea", "Luis Ortega", "Priya Nair", "Kofi Mensah", "Elena Voss"];
const raw = NAMES.map((n, i) => ({ user_id: `fixture-${i}`, display_name: n, current_rating: 1240 - i * 17 + (i % 3) * 5, rated_wins: 14 - i, rated_losses: 4 + (i % 4), rated_ties: i % 2, rated_matches: 0, last_rated_at: `2026-09-0${(i % 6) + 1}T12:00:00Z`, career_level: 4 + ((i * 3) % 9), streak: ["W3", "L1", "W1", "T1"][i % 4] }));
for (const r of raw) r.rated_matches = r.rated_wins + r.rated_losses + r.rated_ties;
raw[1].current_rating = raw[0].current_rating;   // a tie on rating: wins decide
const rows = orderLeaderboard(raw).map(publicRow);
const meRow = rows.find((r) => r.displayName === "Joseph");
const meProfile = { rated_matches: meRow.matches, unique_opponents: 7 };
const mePublic = { status: "ok", rating: meRow.rating, record: { wins: meRow.wins, losses: meRow.losses, ties: meRow.ties, matches: meRow.matches, winPct: winPct(meRow.wins, meRow.matches) }, placement: placementProgress(meProfile), provisional: false, visibility: "public", rank: meRow.rank, streak: "W3", uniqueOpponents: 7 };
const mePrivate = { ...mePublic, visibility: "private", rank: null };
const meProvisional = { status: "ok", rating: 1038, record: { wins: 2, losses: 0, ties: 1, matches: 3, winPct: 67 }, placement: placementProgress({ rated_matches: 3, unique_opponents: 2 }), provisional: true, visibility: "private", rank: null, streak: "W2", uniqueOpponents: 2 };
const meNone = { status: "ok", rating: 1000, record: { wins: 0, losses: 0, ties: 0, matches: 0, winPct: null }, placement: placementProgress({}), provisional: true, visibility: "private", rank: null, streak: null, uniqueOpponents: 0 };
const around = { available: true, rows: rows.filter((r) => Math.abs(r.rank - meRow.rank) <= 2).map((r) => ({ ...r, isMe: r.rank === meRow.rank })) };
const m = rateMatch({ creator: { rating: 1204, matches: 12 }, recipient: { rating: 1128, matches: 4 }, outcome: "recipient" });
const rated = { status: "ok", rated: true, ratingVersion: "1.0.0", outcome: "recipient", perspective: "recipient", you: m.recipient, them: { name: "Joseph", ...m.creator } };
const unrated = { status: "ok", rated: false, reason: "guest_participant" };

const Block = ({ id, title, children }) => (
  <section data-fixture={id} style={{ display: "grid", gap: 8 }}>
    <h2 style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-text-muted, #93a0b5)" }}>{title}</h2>
    {children}
  </section>
);
const Light = ({ children }) => <div className="ec-editorial" style={{ background: "var(--ec-t-bg, #f2efe8)", padding: 12, borderRadius: 14 }}>{children}</div>;

export default function CompetitiveReferenceFixture() {
  const [vis, setVis] = useState("private");
  // The populated block owns its visibility the way the real page does
  // (LeaderboardPage passes me.visibility), so its control is live, not a prop
  // frozen open — a reference that shows a dead control is a wrong reference.
  const [boardVis, setBoardVis] = useState("public");
  return (
    <div style={{ minHeight: "100vh", background: "#03070d" }}>
      <main aria-labelledby="ec-crf-title" className="ec-arena-page" style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 64px", display: "grid", gap: 22 }}>
        <h1 id="ec-crf-title" style={{ margin: 0, fontSize: 14, letterSpacing: 2, color: "var(--ec-a-text, #f5f7fb)" }}>COMPETITIVE REFERENCE · {rows.length} PUBLIC ROWS</h1>
        <Block id="leaderboard" title="LEADERBOARD · PLACED, PUBLIC, WITH AROUND ME"><Light><LeaderboardView rows={rows} signedIn me={{ ...mePublic, visibility: boardVis, rank: boardVis === "public" ? mePublic.rank : null }} around={around} visibility={boardVis} onVisibility={async (v) => { setBoardVis(v); return true; }} /></Light></Block>
        <Block id="leaderboard-provisional" title="LEADERBOARD · PROVISIONAL"><Light><LeaderboardView rows={rows} signedIn me={meProvisional} visibility="private" onVisibility={async () => true} /></Light></Block>
        <Block id="leaderboard-private" title="LEADERBOARD · PLACED, PRIVATE"><Light><LeaderboardView rows={rows} signedIn me={mePrivate} visibility="private" onVisibility={async () => true} /></Light></Block>
        <Block id="leaderboard-empty" title="LEADERBOARD · EMPTY (COLD START, SIGNED IN, NO MATCHES)"><Light><LeaderboardView rows={[]} signedIn me={meNone} visibility="private" onVisibility={async () => true} /></Light></Block>
        <Block id="leaderboard-signed-out" title="LEADERBOARD · SIGNED OUT"><Light><LeaderboardView rows={rows} signedIn={false} onSignIn={() => {}} /></Light></Block>
        <Block id="challenge-rating-change" title="RESULT · RATED CHALLENGE"><RatingChange rating={rated} /></Block>
        <Block id="challenge-rating-unrated" title="RESULT · UNRATED CHALLENGE"><RatingChange rating={unrated} /></Block>
        <Block id="my-eraclash-rating" title="MY ERACLASH · OVERVIEW COMPETITIVE MODULE"><Light><CompetitiveModule me={mePublic} onOpenLeaderboard={() => {}} /><div style={{ height: 10 }} /><CompetitiveModule me={meProvisional} onOpenLeaderboard={() => {}} /></Light></Block>
        <Block id="leaderboard-privacy-setting" title="ACCOUNT · LEADERBOARD VISIBILITY"><Light><VisibilitySetting visibility={vis} onChange={async (v) => { setVis(v); return true; }} /></Light></Block>
      </main>
    </div>
  );
}
