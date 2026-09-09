// ── Competitive Rating V1: the pure contract ─────────────────────────────────
// Phase 9E. A Challenge Rating: an Elo-style number that moves only when two
// AUTHENTICATED accounts complete an official Challenge and the Phase 9C
// comparison contract decides creator, recipient or tie. Career XP measures
// activity; this measures results against other players. They never mix.
//
// COMPETITIVE_RATING_POWER_EFFECT = 0. Nothing here is imported by a draft,
// roll, era, coach, placement, challenge-seed or simulation path, and nothing
// here reads one. The rating consumes the comparison's outcome; it never
// re-reads the basketball score.
export const COMPETITIVE_RATING_VERSION = "1.0.0";
export const COMPETITIVE_RATING_POWER_EFFECT = 0;

// ── Rating constants (centralised; mirrored in SQL and pinned by tests) ──────
export const INITIAL_RATING = 1000;
export const RATING_FLOOR = 100;
export const K_PROVISIONAL = 40;        // a player's first ten rated matches
export const K_ESTABLISHED = 24;        // after ten
export const K_SWITCH_MATCHES = 10;
export const PLACEMENT = Object.freeze({ matches: 5, uniqueOpponents: 3 });
export const RATED_PAIR_LIMIT = 3;      // rated outcomes between one pair …
export const RATED_PAIR_WINDOW_DAYS = 7; // … in a rolling window

export const OUTCOMES = Object.freeze(["creator", "recipient", "tie"]);
export const UNRATED_REASONS = Object.freeze({
  GUEST: "guest_participant", SAME_ACCOUNT: "same_account", NOT_COMPLETED: "not_completed",
  REPEAT_OPPONENT: "repeat_opponent_limit", ALREADY_RATED: "already_rated", NOT_ELIGIBLE: "not_eligible",
});
export const UNRATED_COPY = Object.freeze({
  guest_participant: "Guest challenges do not affect Competitive Rating.",
  same_account: "A challenge against your own account is not rated.",
  not_completed: "The challenge was not completed.",
  repeat_opponent_limit: `Only ${RATED_PAIR_LIMIT} challenges between the same two players are rated in ${RATED_PAIR_WINDOW_DAYS} days.`,
  already_rated: "This challenge has already been rated.",
  not_eligible: "This challenge is not eligible for rating.",
});

/** Half away from zero, the same answer Postgres round() gives. */
export const roundHalfAway = (x) => (Math.sign(x) * Math.round(Math.abs(x))) || 0;
export const round4 = (x) => Math.round(x * 10000) / 10000;

/** Expected score of A against B. */
export const expectedScore = (ra, rb) => round4(1 / (1 + 10 ** ((rb - ra) / 400)));
export const kFactor = (ratedMatchesBefore) => ((ratedMatchesBefore | 0) < K_SWITCH_MATCHES ? K_PROVISIONAL : K_ESTABLISHED);
export const actualScores = (outcome) => (outcome === "creator" ? [1, 0] : outcome === "recipient" ? [0, 1] : [0.5, 0.5]);

/**
 * Rate one official comparison. Deterministic: expected scores to 4 decimals,
 * deltas rounded half away from zero, the floor applied to the rating after
 * (the delta is then the floored difference, so before + delta = after).
 */
export const rateMatch = ({ creator, recipient, outcome }) => {
  if (!OUTCOMES.includes(outcome)) return null;
  const ra = Number(creator.rating), rb = Number(recipient.rating);
  const ea = expectedScore(ra, rb), eb = round4(1 - ea);
  const [sa, sb] = actualScores(outcome);
  const ka = kFactor(creator.matches), kb = kFactor(recipient.matches);
  const rawA = roundHalfAway(ka * (sa - ea)), rawB = roundHalfAway(kb * (sb - eb));
  const afterA = Math.max(RATING_FLOOR, ra + rawA), afterB = Math.max(RATING_FLOOR, rb + rawB);
  return {
    ratingVersion: COMPETITIVE_RATING_VERSION, outcome,
    creator: { before: ra, expected: ea, k: ka, delta: afterA - ra, after: afterA },
    recipient: { before: rb, expected: eb, k: kb, delta: afterB - rb, after: afterB },
  };
};

/** What counts as rated (§7, §33, §34). Guests, self, incomplete and the pair window are the closed set of reasons. */
export const eligibility = ({ creatorUserId, recipientUserId, status, challengeOutcome, pairRatedInWindow = 0, alreadyRated = false }) => {
  if (alreadyRated) return { rated: false, reason: UNRATED_REASONS.ALREADY_RATED };
  if (status !== "completed" || !OUTCOMES.includes(challengeOutcome)) return { rated: false, reason: UNRATED_REASONS.NOT_COMPLETED };
  if (!creatorUserId || !recipientUserId) return { rated: false, reason: UNRATED_REASONS.GUEST };
  if (creatorUserId === recipientUserId) return { rated: false, reason: UNRATED_REASONS.SAME_ACCOUNT };
  if (pairRatedInWindow >= RATED_PAIR_LIMIT) return { rated: false, reason: UNRATED_REASONS.REPEAT_OPPONENT };
  return { rated: true, reason: null };
};

/** Backfill / reconciliation order: Elo is order-dependent, so this order is frozen. */
export const BACKFILL_ORDER = Object.freeze(["completed_at asc", "challenge_attempt id asc"]);
export const sortChronological = (attempts) => [...attempts].sort((a, b) => (Date.parse(a.completed_at) - Date.parse(b.completed_at)) || String(a.id).localeCompare(String(b.id)));

/**
 * Replay a chronological list of eligible attempts from scratch — the
 * independent expectation a backfill is compared against. Each attempt:
 * { id, challenge_id, creator_user_id, recipient_user_id, challenge_outcome, completed_at }.
 */
export const replayRatings = (attempts) => {
  const profiles = new Map();
  const events = [];
  const prof = (u) => { if (!profiles.has(u)) profiles.set(u, { rating: INITIAL_RATING, matches: 0, wins: 0, losses: 0, ties: 0, opponents: new Set(), lastRatedAt: null }); return profiles.get(u); };
  for (const a of sortChronological(attempts)) {
    const pairInWindow = events.filter((e) => ((e.creator_user_id === a.creator_user_id && e.recipient_user_id === a.recipient_user_id) || (e.creator_user_id === a.recipient_user_id && e.recipient_user_id === a.creator_user_id))
      && Date.parse(a.completed_at) - Date.parse(e.completed_at) < RATED_PAIR_WINDOW_DAYS * 86_400_000 && Date.parse(e.completed_at) <= Date.parse(a.completed_at)).length;
    const el = eligibility({ creatorUserId: a.creator_user_id, recipientUserId: a.recipient_user_id, status: a.status || "completed", challengeOutcome: a.challenge_outcome, pairRatedInWindow: pairInWindow });
    if (!el.rated) { events.push({ attempt_id: a.id, rated: false, reason: el.reason, completed_at: a.completed_at, creator_user_id: a.creator_user_id, recipient_user_id: a.recipient_user_id, skipped: true }); continue; }
    const c = prof(a.creator_user_id), r = prof(a.recipient_user_id);
    const m = rateMatch({ creator: { rating: c.rating, matches: c.matches }, recipient: { rating: r.rating, matches: r.matches }, outcome: a.challenge_outcome });
    events.push({ attempt_id: a.id, challenge_id: a.challenge_id, rated: true, completed_at: a.completed_at, creator_user_id: a.creator_user_id, recipient_user_id: a.recipient_user_id, outcome: a.challenge_outcome, ...m });
    const apply = (p, side, opp) => { p.rating = side.after; p.matches++; p.opponents.add(opp); p.lastRatedAt = a.completed_at; };
    apply(c, m.creator, a.recipient_user_id); apply(r, m.recipient, a.creator_user_id);
    if (a.challenge_outcome === "creator") { c.wins++; r.losses++; } else if (a.challenge_outcome === "recipient") { r.wins++; c.losses++; } else { c.ties++; r.ties++; }
  }
  return { events: events.filter((e) => !e.skipped), skipped: events.filter((e) => e.skipped), profiles: Object.fromEntries([...profiles].map(([u, p]) => [u, { ...p, opponents: [...p.opponents], uniqueOpponents: p.opponents.size, placed: isPlaced({ rated_matches: p.matches, unique_opponents: p.opponents.size }) }])) };
};

// ── Placement, record, streak ────────────────────────────────────────────────
export const isPlaced = (p) => (Number(p?.rated_matches) || 0) >= PLACEMENT.matches && (Number(p?.unique_opponents) || 0) >= PLACEMENT.uniqueOpponents;
export const placementProgress = (p) => ({ matches: Math.min(PLACEMENT.matches, Number(p?.rated_matches) || 0), matchesTarget: PLACEMENT.matches, opponents: Math.min(PLACEMENT.uniqueOpponents, Number(p?.unique_opponents) || 0), opponentsTarget: PLACEMENT.uniqueOpponents, placed: isPlaced(p) });
/** Simple and immediately understood: wins / rated matches. Ties stay visible in W–L–T. */
export const winPct = (wins, matches) => ((Number(matches) || 0) > 0 ? Math.round(((Number(wins) || 0) / Number(matches)) * 100) : null);
export const recordLine = (p) => `${p?.rated_wins ?? 0}–${p?.rated_losses ?? 0}–${p?.rated_ties ?? 0}`;
/** The user's outcome of a rated event, from their side. */
export const sideOutcome = (event, userId) => (event.outcome === "tie" ? "T" : (event.outcome === "creator") === (event.creator_user_id === userId) ? "W" : "L");
/** W3 / L1 / T1 from the newest rated events; null with none. */
export const streakOf = (events, userId) => {
  const sorted = [...(events || [])].sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at));
  if (!sorted.length) return null;
  const first = sideOutcome(sorted[0], userId); let n = 0;
  for (const e of sorted) { if (sideOutcome(e, userId) === first) n++; else break; }
  return `${first}${n}`;
};

// ── Leaderboard contract ─────────────────────────────────────────────────────
export const LEADERBOARD_LIMIT = 100;
export const AROUND_ME_SPAN = 2;
export const VISIBILITY = Object.freeze(["private", "public"]);
export const VISIBILITY_DEFAULT = "private";
export const VISIBILITY_PREF_KEY = "leaderboard_visibility";
/** Deterministic ordering: rating, then more wins, then fewer losses, then who reached their rating first, then a stable id. */
export const ORDERING = Object.freeze(["current_rating desc", "rated_wins desc", "rated_losses asc", "last_rated_at asc", "user_id asc"]);
export const compareRows = (a, b) => (b.current_rating - a.current_rating) || (b.rated_wins - a.rated_wins) || (a.rated_losses - b.rated_losses)
  || ((Date.parse(a.last_rated_at || 0) || 0) - (Date.parse(b.last_rated_at || 0) || 0)) || String(a.user_id).localeCompare(String(b.user_id));
/** Only public AND placed profiles are eligible for a public row. */
export const leaderboardEligible = (p, visibility) => visibility === "public" && isPlaced(p);
export const orderLeaderboard = (rows) => [...rows].sort(compareRows).map((r, i) => ({ ...r, rank: i + 1 }));
/** The public projection: nothing that identifies an account beyond its chosen display name. */
export const PUBLIC_ROW_FIELDS = Object.freeze(["rank", "displayName", "initials", "rating", "wins", "losses", "ties", "matches", "winPct", "level", "streak"]);
export const FORBIDDEN_PUBLIC_FIELDS = Object.freeze(["email", "user_id", "userId", "account", "location", "created_at", "joined", "provider", "result_id", "challenge_id", "attempt_id", "xp", "seed", "token"]);
export const initialsOf = (name) => String(name || "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "C";
export const publicRow = (r) => ({ rank: r.rank, displayName: r.display_name || "Coach", initials: initialsOf(r.display_name), rating: r.current_rating, wins: r.rated_wins, losses: r.rated_losses, ties: r.rated_ties, matches: r.rated_matches, winPct: winPct(r.rated_wins, r.rated_matches), level: r.career_level ?? null, streak: r.streak ?? null });
export const rankBucket = (rank) => (rank == null ? "unranked" : rank <= 10 ? "top10" : rank <= 100 ? "top100" : "beyond");

// ── Accessibility copy ───────────────────────────────────────────────────────
export const fmt = (n) => (Number(n) || 0).toLocaleString("en-US");
export const announceRow = (row) => `Rank ${row.rank}. ${row.displayName}. Competitive Rating ${fmt(row.rating)}. Record ${row.wins} wins, ${row.losses} losses, ${row.ties} ${row.ties === 1 ? "tie" : "ties"}.`;
export const announceChange = (delta, after) => `Competitive Rating ${delta >= 0 ? "increased" : "decreased"} by ${Math.abs(delta)} to ${fmt(after)}.`;

// ── Telemetry (closed) ───────────────────────────────────────────────────────
export const COMPETITIVE_EVENTS = Object.freeze({
  LEADERBOARD_VIEWED: "leaderboard_viewed", VISIBILITY_CHANGED: "leaderboard_visibility_changed", RATING_VIEWED: "competitive_rating_viewed",
  CHANGE_SHOWN: "competitive_rating_change_shown", PROVISIONAL_VIEWED: "competitive_provisional_progress_viewed", AROUND_ME_VIEWED: "around_me_viewed",
});
export const EVENT_METADATA_ALLOWED = Object.freeze(["authState", "visibility", "provisional", "rankBucket", "ratedMatchCount", "ratingDelta", "outcome", "success", "failureCode", "reason"]);

export const COMPETITIVE_POLICY = Object.freeze({
  powerEffect: COMPETITIVE_RATING_POWER_EFFECT, ratedOnly: "official Challenge comparisons between two authenticated accounts", comparisonAuthority: "Challenge Comparison V1 decides the winner; the rating consumes the outcome",
  initial: INITIAL_RATING, floor: RATING_FLOOR, k: { provisional: K_PROVISIONAL, established: K_ESTABLISHED, switchAt: K_SWITCH_MATCHES }, placement: PLACEMENT,
  pairLimit: { limit: RATED_PAIR_LIMIT, windowDays: RATED_PAIR_WINDOW_DAYS }, visibility: { default: VISIBILITY_DEFAULT, values: VISIBILITY }, leaderboard: { limit: LEADERBOARD_LIMIT, ordering: ORDERING, aroundMe: AROUND_ME_SPAN },
  notBuilt: ["XP/level/achievement leaderboards", "public profiles", "friends", "seasons", "rewards", "tiers", "approximate private rank"],
});
