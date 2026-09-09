// ── /dev/profile-reference — the real components, in every state ─────────────
// Phase 9F. Dev-only (VITE_EC_DEV_FIXTURES). Every state a gate or a screenshot
// needs, rendered from the REAL contract's projection and the REAL components,
// so what is measured is the product and not a mock of it.
import { useState } from "react";
import PlayerCard from "../../components/profiles/PlayerCard.jsx";
import { PublicProfileView } from "../../components/profiles/PublicProfilePage.jsx";
import PublicProfileModule from "../../components/profiles/PublicProfileModule.jsx";
import { StandingsTable } from "../../components/competitive/LeaderboardPage.jsx";
import { publicProfile } from "../../profiles/contract.js";
import { publicRow, orderLeaderboard } from "../../competitive/contract.js";

const SLUG_A = "e6dj0mdh6qfaks3n3mw1", SLUG_C = "yt5p66889a7smv9mzc9j";

// a placed, public, ranked profile — the flagship card
const placed = publicProfile({
  slug: SLUG_A, display_name: "Joseph", placed: true, current_rating: 1146, rank: 38,
  rated_wins: 18, rated_losses: 11, rated_ties: 1, rated_matches: 30, unique_opponents: 7,
  career_level: 24, featured: ["first_clash", "ten_wins", "era_scholar"],
});
// Placed, but the owner kept the leaderboard private. The DATABASE withholds the
// rank in that case, so the row genuinely arrives with rank null — the card is
// given exactly what the server would send, not a rank it is trusted to hide.
const placedNoRank = publicProfile({
  slug: SLUG_A, display_name: "Ava Okafor", placed: true, current_rating: 1204, rank: null,
  rated_wins: 22, rated_losses: 9, rated_ties: 0, rated_matches: 31, unique_opponents: 9,
  career_level: 31, featured: ["first_win"],
});
// provisional: no rating, no rank, only the progress
const provisional = publicProfile({
  slug: SLUG_C, display_name: "Dee Rivera", placed: false, current_rating: 1038,
  rated_matches: 3, unique_opponents: 2, career_level: 6, featured: ["first_clash"],
});
const none = publicProfile({ slug: SLUG_C, display_name: "Sam Whitlock", placed: false, rated_matches: 0, unique_opponents: 0, career_level: 1, featured: [] });

const ownerBase = {
  status: "ok", found: true, slug: SLUG_A, displayName: "Joseph", state: "placed",
  rating: 1146, rank: 38, record: { wins: 18, losses: 11, ties: 1, matches: 30 },
  placement: { matches: 30, matchesTarget: 5, opponents: 7, opponentsTarget: 3 },
  level: 24, featured: ["first_clash", "ten_wins"], maxFeatured: 3,
  unlockable: ["first_clash", "first_win", "first_chaos", "ten_wins", "era_scholar", "challenger"],
  preview: placed,
};

// leaderboard rows: rank 1 has a public profile, rank 2 does NOT
const raw = ["Marcus Bell", "Nia Grant", "Ava Okafor"].map((n, i) => ({
  user_id: `f-${i}`, display_name: n, current_rating: 1240 - i * 24, rated_wins: 14 - i, rated_losses: 4 + i,
  rated_ties: 0, rated_matches: 18 - i, last_rated_at: `2026-09-0${i + 1}T12:00:00Z`, career_level: 8 + i, streak: "W2",
}));
const boardRows = orderLeaderboard(raw).map(publicRow);
const boardLinks = { 1: SLUG_A };   // only rank 1 opted into a public profile

const Block = ({ id, title, children }) => (
  <section data-fixture={id} style={{ display: "grid", gap: 8 }}>
    <h2 style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-text-muted, #93a0b5)" }}>{title}</h2>
    {children}
  </section>
);
const Light = ({ children }) => <div className="ec-editorial" style={{ background: "var(--ec-t-bg, #f2efe8)", padding: 12, borderRadius: 14 }}>{children}</div>;

export default function ProfileReferenceFixture() {
  const [vis, setVis] = useState("private");
  const [featured, setFeatured] = useState(ownerBase.featured);
  const owner = { ...ownerBase, profileVisibility: vis, leaderboardVisibility: "public", featured };
  return (
    <div style={{ minHeight: "100vh", background: "#03070d" }}>
      <main aria-labelledby="ec-prf-title" className="ec-arena-page" style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 64px", display: "grid", gap: 22 }}>
        <h1 id="ec-prf-title" style={{ margin: 0, fontSize: 14, letterSpacing: 2, color: "var(--ec-a-text, #f5f7fb)" }}>PROFILE REFERENCE · PLAYER CARDS</h1>

        <Block id="player-card-placed" title="PUBLIC PLAYER CARD · PLACED, RANKED"><Light><PlayerCard profile={placed} /></Light></Block>
        <Block id="player-card-no-rank" title="PUBLIC PLAYER CARD · PLACED, LEADERBOARD PRIVATE (RATING, NO RANK)"><Light><PlayerCard profile={placedNoRank} /></Light></Block>
        <Block id="player-card-provisional" title="PUBLIC PLAYER CARD · PROVISIONAL (NO RATING, NO RANK)"><Light><PlayerCard profile={provisional} /></Light></Block>
        <Block id="player-card-none" title="PUBLIC PLAYER CARD · NO RATED CHALLENGES YET"><Light><PlayerCard profile={none} /></Light></Block>
        <Block id="profile-unavailable" title="PROFILE NOT AVAILABLE · PRIVATE, UNKNOWN OR DELETED (ONE STATE)"><Light><PublicProfileView state="missing" onPlay={() => {}} onLeaderboard={() => {}} /></Light></Block>
        <Block id="profile-module" title="MY ERACLASH · PUBLIC PROFILE CONTROLS">
          <Light>
            <PublicProfileModule me={owner} onVisibility={async (v) => { setVis(v); return true; }}
              onFeatured={async (ids) => { setFeatured(ids); return true; }} onOpenProfile={() => {}} />
          </Light>
        </Block>
        <Block id="leaderboard-rows" title="LEADERBOARD · RANK 1 LINKS (PROFILE PUBLIC) · RANK 2 DOES NOT (PROFILE PRIVATE)">
          <Light><StandingsTable rows={boardRows} profileLinks={boardLinks} onOpenProfile={() => {}} /></Light>
        </Block>
      </main>
    </div>
  );
}
