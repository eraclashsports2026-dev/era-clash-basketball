// ── Challenge client ───────────────────────────────────────────────────────────
// Server-backed challenges with the v2 URL-encoded format as a fallback:
// if /api/challenge is unavailable (no store configured, offline), links keep
// working exactly like v2 (?c=base64). Both link formats stay decodable forever.
import { PLAYERS } from "./players.js";
import { getDisplayName } from "./identity.js";
import { track } from "./analytics.js";

// Legacy v2 codec (kept verbatim — old shared links must never break)
export const encodeChallenge = (team, record) => {
  const ids = team.map((p) => p.id).join(",");
  return btoa(`${ids}|${record || ""}`).replace(/=+$/, "");
};
export const decodeChallenge = (code) => {
  try {
    const [ids, record] = atob(code).split("|");
    const team = ids.split(",").map((id) => PLAYERS.find((p) => p.id === id));
    if (team.some((p) => !p) || team.length !== 5) return null;
    return { team, record };
  } catch { return null; }
};

const idsToTeam = (ids) => {
  const team = (ids || []).map((id) => PLAYERS.find((p) => p.id === id));
  return team.length === 5 && !team.some((p) => !p) ? team : null;
};

// Create a persistent challenge; returns {url, id} — or the legacy URL if the
// server is unavailable.
export const createChallenge = async (team, record) => {
  const origin = window.location.origin;
  try {
    const res = await fetch("/api/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name: getDisplayName() || null,
        teamIds: team.map((p) => p.id),
        record: record || null,
      }),
    });
    if (res.ok) {
      const { id } = await res.json();
      track("challenge_created", { challenge_id: id, persistent: true });
      return { id, url: `${origin}/challenge/${id}` };
    }
  } catch { /* fall through */ }
  track("challenge_created", { persistent: false });
  return { id: null, url: `${origin}/?c=${encodeChallenge(team, record)}` };
};

// Load a challenge from the current URL (?ch=id server-backed, ?c=payload legacy).
// Returns { id?, team, record?, challengerName?, games, record2 } or null.
export const loadChallengeFromUrl = async () => {
  const params = new URLSearchParams(window.location.search);
  const legacy = params.get("c");
  if (legacy) {
    const dec = decodeChallenge(legacy);
    if (dec) {
      track("challenge_link_opened", { persistent: false });
      return { id: null, team: dec.team, record: dec.record, challengerName: null, games: [], rivalry: null };
    }
    return null;
  }
  const id = params.get("ch");
  if (!id || !/^[a-z0-9]{6,16}$/.test(id)) return null;
  try {
    const res = await fetch(`/api/challenge?id=${id}`);
    if (!res.ok) return null;
    const ch = await res.json();
    const team = idsToTeam(ch.challenger?.teamIds);
    if (!team) return null;
    track("challenge_link_opened", { challenge_id: id, persistent: true });
    return {
      id,
      team,
      record: ch.challenger?.record || null,
      challengerName: ch.challenger?.name || null,
      games: ch.games || [],
      rivalry: ch.record || null,
    };
  } catch { return null; }
};

// v2.3: challenge completion is server-side — /api/game appends the rivalry
// game from its own stored result. The old client "complete" call is gone.
