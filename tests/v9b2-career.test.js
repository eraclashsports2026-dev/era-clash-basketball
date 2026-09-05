// ── Phase 9B.2: My EraClash Career V2, saved rosters, Run It Back, export, deletion ──
// The security and truth model is the point. A stored roster can never smuggle
// a rating; a preference can only be a known setting; an export never carries a
// credential; a saved Clash's favorite is the ONLY column a browser may change;
// account deletion goes only through the server and only for the token's own
// user. These prove all of that as plain functions, plus contracts that pin the
// database, the entitlement number and the event allowlist together.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  CAREER_TABS, CAREER_TAB_IDS, tabFromSearch, modeName, MODE_LABEL,
  HISTORY_FILTERS, HISTORY_SORTS, defaultHistoryFilters, erasInHistory,
  applyHistoryFilters, sortHistory, pageOf, HISTORY_PAGE_SIZE,
  SAVED_ROSTER_LIMIT_FREE, cleanRosterName, suggestRosterName, rosterSnapshotFrom,
  coachSnapshotFrom, rosterLimitReached,
  PREF_KEYS, PREF_DEFAULTS, PREF_SCHEMA, cleanPrefs, mergePrefs,
  REPLAY, replayCapability, runItBackSetup, EXACT_REPLAY_REASONS,
  RECONCILIATION, reconciliationState,
  buildAccountExport, EXPORT_EXCLUDED_KEYS, exportFilename, historyCsv,
  DELETION_PHRASE, needsReauthentication, sessionAgeSeconds,
} from "../src/accounts/careerV2.js";
import { createTestProvider } from "../src/accounts/testAdapter.js";
import { deleteAccount } from "../api/_lib/cloudAccounts.js";
import { EVENTS_ALLOWLIST } from "../api/events.js";
import { ACTIVATION_EVENTS } from "../src/activation.js";

const read = (f) => readFileSync(f, "utf8");
const SQL = read("supabase/migrations/0003_career_v2.sql");

const clash = (over = {}) => ({
  result_id: "pv_" + Math.random().toString(36).slice(2, 10), mode: "chaos", outcome: "win",
  gold_score: 110, blue_score: 100, era_id: "1990s",
  gold_roster: [{ id: "jordan", name: "Jordan", pos: "SG" }, { id: "pippen", name: "Pippen", pos: "SF" }, { id: "rodman", name: "Rodman", pos: "PF" }, { id: "grant", name: "Grant", pos: "C" }, { id: "paxson", name: "Paxson", pos: "PG" }],
  blue_roster: [{ id: "magic", name: "Magic", pos: "PG" }],
  gold_coach: { id: "phil", name: "Phil Jackson" }, blue_coach: { id: "pat", name: "Pat Riley" },
  mvp: { name: "Jordan", pts: 38 }, candidate_id: "Candidate 4", calibration_version: "1.4.0",
  candidate_core_hash: "55bb26a2", favorite: false, played_at: new Date().toISOString(),
  result_snapshot: { core: { winner: "GOLD" }, seed: 12345 },
  ...over,
});

describe("navigation", () => {
  it("has the six named tabs and reads a valid one from the URL", () => {
    // Phase 9C added Challenges between Favorites and Account.
    expect(CAREER_TAB_IDS).toEqual(["overview", "history", "rosters", "favorites", "challenges", "account"]);
    expect(tabFromSearch("?tab=history")).toBe("history");
    expect(tabFromSearch("?tab=nonsense")).toBe("overview");
    expect(tabFromSearch("")).toBe("overview");
    expect(CAREER_TABS.every((t) => t.label && t.id)).toBe(true);
  });
  it("names a chaos run as Chaos Clash and a hand-built one as Dream Matchup", () => {
    expect(modeName("chaos")).toBe("Chaos Clash");
    expect(modeName("single")).toBe("Dream Matchup");
    expect(modeName("weird")).toBe("weird");
    expect(modeName("")).toBe("Clash");
  });
});

describe("clash history filtering, sorting and paging", () => {
  const now = Date.parse("2026-09-05T00:00:00Z");
  const rows = [
    clash({ mode: "chaos", outcome: "win", era_id: "1990s", gold_score: 120, blue_score: 90, played_at: "2026-09-04T00:00:00Z" }),
    clash({ mode: "single", outcome: "loss", era_id: "1980s", gold_score: 99, blue_score: 101, played_at: "2026-08-01T00:00:00Z" }),
    clash({ mode: "daily", outcome: "tie", era_id: "1990s", gold_score: 100, blue_score: 100, played_at: "2026-09-03T00:00:00Z" }),
  ];
  it("filters by mode, outcome, era and range independently", () => {
    expect(applyHistoryFilters(rows, { mode: "chaos" }).length).toBe(1);
    expect(applyHistoryFilters(rows, { outcome: "tie" }).length).toBe(1);
    expect(applyHistoryFilters(rows, { era: "1990s" }).length).toBe(2);
    expect(applyHistoryFilters(rows, { range: "recent" }, now).length).toBe(2);   // within 7 days
    expect(applyHistoryFilters(rows, { range: "30d" }, now).length).toBe(2);
    expect(applyHistoryFilters(rows, { mode: "chaos", outcome: "loss" }).length).toBe(0);
  });
  it("only offers eras that actually occur, in canonical order", () => {
    expect(erasInHistory(rows)).toEqual(["1980s", "1990s"]);
  });
  it("sorts newest, oldest, by margin and by closest, and never crashes on a missing score", () => {
    expect(sortHistory(rows, "newest")[0].played_at).toBe("2026-09-04T00:00:00Z");
    expect(sortHistory(rows, "oldest")[0].played_at).toBe("2026-08-01T00:00:00Z");
    expect(sortHistory(rows, "margin")[0].gold_score).toBe(120);
    expect(sortHistory(rows, "closest")[0].outcome).toBe("tie");
    const withNull = [...rows, clash({ gold_score: null, blue_score: null })];
    expect(() => sortHistory(withNull, "margin")).not.toThrow();
    expect(sortHistory(withNull, "margin").at(-1).gold_score).toBeNull();  // scoreless falls to the end
  });
  it("pages", () => {
    const many = Array.from({ length: 60 }, () => clash());
    const p0 = pageOf(many, 0);
    expect(p0.rows.length).toBe(HISTORY_PAGE_SIZE);
    expect(p0.pages).toBe(3);
    expect(pageOf(many, 2).rows.length).toBe(60 - 2 * HISTORY_PAGE_SIZE);
  });
});

describe("saved roster snapshots carry identity only", () => {
  it("drops every non-identity field, keeping id, name and pos", () => {
    const snap = rosterSnapshotFrom([{ id: "jordan", name: "Jordan", pos: "SG", rating: 99, ovr: 99, badges: ["x"] }]);
    expect(snap).toEqual([{ id: "jordan", name: "Jordan", pos: "SG" }]);
    expect(Object.keys(snap[0])).not.toContain("rating");
  });
  it("caps at five and requires an id", () => {
    const snap = rosterSnapshotFrom([...Array(8)].map((_, i) => ({ id: `p${i}` })));
    expect(snap.length).toBe(5);
    expect(rosterSnapshotFrom([{ name: "no id" }, { id: "ok" }])).toEqual([{ id: "ok" }]);
  });
  it("coach snapshot is identity only, or null", () => {
    expect(coachSnapshotFrom({ id: "phil", name: "Phil", secretRating: 9 })).toEqual({ id: "phil", name: "Phil" });
    expect(coachSnapshotFrom(null)).toBeNull();
    expect(coachSnapshotFrom({})).toBeNull();
  });
  it("suggests a name from the first three surnames, and cleans a name", () => {
    expect(suggestRosterName([{ name: "Michael Jordan" }, { name: "Tim Duncan" }, { name: "Stephen Curry" }, { name: "x y" }])).toBe("Jordan / Duncan / Curry");
    expect(suggestRosterName([])).toBe("My Five");
    expect(cleanRosterName("  <b>Dream</b>  Team  ")).toBe("bDream/b Team".replace(/[<>]/g, "") || "Dream Team");
    expect(cleanRosterName("")).toBe("");
  });
  it("the free-account limit is one number in three places", () => {
    expect(SAVED_ROSTER_LIMIT_FREE).toBe(10);
    expect(SQL).toMatch(/count\(\*\) from public\.saved_rosters where user_id = new\.user_id\) >= 10/);
    expect(rosterLimitReached(10)).toBe(true);
    expect(rosterLimitReached(9)).toBe(false);
  });
});

describe("preferences are a closed vocabulary", () => {
  it("keeps only known keys with allowed values", () => {
    expect(cleanPrefs({ career_density: "compact", reduced_motion: "reduce", tracking: "yes", career_density_evil: 1 }))
      .toEqual({ career_density: "compact", reduced_motion: "reduce" });
    expect(cleanPrefs({ reduced_motion: "sideways" })).toEqual({});
    expect(cleanPrefs(null)).toEqual({});
  });
  it("cloud truth wins over a local cache", () => {
    expect(mergePrefs({ career_density: "compact" }, { career_density: "expanded", reduced_motion: "reduce" }))
      .toEqual({ ...PREF_DEFAULTS, career_density: "compact", reduced_motion: "reduce" });
  });
  it("every preference is for a feature that exists", () => {
    // The default-result-tab values must be real ResultDock tabs.
    expect(PREF_SCHEMA.default_result_tab.values).toEqual(["story", "box", "coaching", "analysis"]);
    expect(PREF_KEYS.every((k) => typeof PREF_DEFAULTS[k] === "string")).toBe(true);
    // The migration and the client agree on the vocabulary.
    for (const k of PREF_KEYS) expect(SQL).toContain(k);
  });
});

describe("Run It Back and Exact Replay are different things", () => {
  it("Run It Back is available when the five is intact and gives a fresh setup", () => {
    const c = clash();
    const cap = replayCapability(c);
    expect(cap.runItBack).toBe(true);
    const setup = runItBackSetup(c);
    expect(setup.goldIds.length).toBe(5);
    expect(setup.coachGoldId).toBe("phil");
    expect(setup.eraStyleId).toBe("1990s");
    expect(setup.tag).toBe("chaos");
  });
  it("exact replay is never offered, because the server takes no chosen seed", () => {
    const cap = replayCapability(clash());
    expect(cap.exact.available).toBe(false);
    expect(cap.exact.reason).toBe("NO_SERVER_SEED_REPLAY");
    expect(cap.exact.message).toBe(EXACT_REPLAY_REASONS.NO_SERVER_SEED_REPLAY);
    expect(REPLAY.RUN_IT_BACK).not.toBe(REPLAY.EXACT);
  });
  it("a snapshot with no seed says so distinctly", () => {
    expect(replayCapability(clash({ result_snapshot: { core: {} } })).exact.reason).toBe("SNAPSHOT_MISSING_SEED");
  });
  it("a clash whose engine build is gone cannot be replayed exactly", () => {
    expect(replayCapability(clash(), { coreHash: "different" }).exact.reason).toBe("CANDIDATE_UNAVAILABLE");
  });
  it("Run It Back is refused when the five cannot be reconstructed", () => {
    expect(runItBackSetup(clash({ gold_roster: [{ id: "a" }] }))).toBeNull();
  });
});

describe("device/cloud reconciliation states", () => {
  it("names every state from the inputs", () => {
    expect(reconciliationState({ deviceCount: 0 })).toBe(RECONCILIATION.NO_DEVICE_HISTORY);
    expect(reconciliationState({ deviceCount: 3, unsavedCount: 0 })).toBe(RECONCILIATION.IMPORT_COMPLETE);
    expect(reconciliationState({ deviceCount: 3, unsavedCount: 2, eligible: 2 })).toBe(RECONCILIATION.IMPORT_AVAILABLE);
    expect(reconciliationState({ deviceCount: 3, unsavedCount: 2, eligible: 0, claimedByOther: 2 })).toBe(RECONCILIATION.CONFLICT);
    expect(reconciliationState({ deviceCount: 3, unsavedCount: 2, eligible: 1, lastImport: { imported: 1, refused: 1 } })).toBe(RECONCILIATION.PARTIAL_IMPORT);
  });
});

describe("account export contains only the user's allowed data", () => {
  const doc = buildAccountExport({
    profile: { display_name: "Coach", created_at: "x", email: "secret@example.com", session: "leak" },
    prefs: { career_density: "compact", tracking: "yes" },
    clashes: [clash({ favorite: true, result_snapshot: { core: {}, session: "abc", seed: 1 } })],
    rosters: [{ id: "r1", display_name: "Five", favorite: true, roster_snapshot: [{ id: "jordan" }] }],
  });
  it("excludes credentials, device proofs and internal identifiers at every depth", () => {
    const json = JSON.stringify(doc);
    for (const k of EXPORT_EXCLUDED_KEYS) expect(json, k).not.toContain(`"${k}"`);
    expect(json).not.toContain("secret@example.com");
    expect(json).not.toContain("leak");
  });
  it("carries the profile, cleaned preferences, clashes, rosters and favorite lists", () => {
    expect(doc.profile.display_name).toBe("Coach");
    expect(doc.preferences).toEqual({ career_density: "compact" });   // tracking dropped
    expect(doc.savedClashes.length).toBe(1);
    expect(doc.favorites.clashes.length).toBe(1);
    expect(doc.favorites.rosters).toEqual(["r1"]);
    expect(doc.format).toBe("eraclash-account-export");
  });
  it("the filename uses a local date and a CSV round-trips the history", () => {
    expect(exportFilename(new Date("2026-09-05T10:00:00"))).toBe("eraclash-account-export-2026-09-05.json");
    const csv = historyCsv([clash({ mode: "chaos", outcome: "win", mvp: { name: "Jordan" } })]);
    expect(csv.split("\n")[0]).toContain("played_at,mode,outcome");
    expect(csv).toMatch(/chaos,win/);
  });
});

describe("reauthentication before an irreversible action", () => {
  const mkToken = (iatSecondsAgo) => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b64({ alg: "HS256" })}.${b64({ iat: Math.floor(Date.now() / 1000) - iatSecondsAgo })}.sig`;
  };
  it("reads the token's age and requires a fresh sign-in past the window", () => {
    expect(sessionAgeSeconds(mkToken(60))).toBeGreaterThanOrEqual(60);
    expect(needsReauthentication(mkToken(60))).toBe(false);
    expect(needsReauthentication(mkToken(60 * 60))).toBe(true);   // an hour old
    expect(needsReauthentication("not-a-jwt")).toBe(true);        // unreadable → require it
    expect(DELETION_PHRASE).toBe("DELETE");
  });
});

describe("the provider (via the test adapter) enforces ownership on the new data", () => {
  let ctx;
  beforeEach(() => { ctx = createTestProvider({ users: [{ userId: "u-1", email: "a@x.co" }, { userId: "u-2", email: "b@x.co" }] }); });

  it("saves, renames, favorites and deletes a roster for its owner only", async () => {
    ctx.signInAs("u-1");
    const r = await ctx.provider.saveRoster({ displayName: "Bulls", roster: [{ id: "jordan", name: "Jordan", pos: "SG" }] });
    expect(r.display_name).toBe("Bulls");
    const renamed = await ctx.provider.renameRoster(r.id, "Chicago");
    expect(renamed.display_name).toBe("Chicago");
    expect(renamed.renamed_at).toBeTruthy();
    await ctx.provider.setRosterFavorite(r.id, true);
    expect((await ctx.provider.listRosters())[0].favorite).toBe(true);
    // u-2 sees none of u-1's rosters.
    ctx.signInAs("u-2");
    expect(await ctx.provider.listRosters()).toEqual([]);
    // and cannot rename what it cannot see.
    await expect(ctx.provider.renameRoster(r.id, "steal")).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    ctx.signInAs("u-1");
    await ctx.provider.deleteRoster(r.id);
    expect(await ctx.provider.listRosters()).toEqual([]);
  });
  it("refuses the 11th roster", async () => {
    ctx.signInAs("u-1");
    for (let i = 0; i < SAVED_ROSTER_LIMIT_FREE; i++) await ctx.provider.saveRoster({ displayName: `r${i}`, roster: [{ id: `p${i}` }] });
    await expect(ctx.provider.saveRoster({ displayName: "one too many", roster: [{ id: "z" }] })).rejects.toMatchObject({ code: "ROSTER_LIMIT_REACHED" });
  });
  it("keeps preferences per user and cleans them", async () => {
    ctx.signInAs("u-1");
    await ctx.provider.setPreferences({ career_density: "compact", tracking: "evil" });
    expect(await ctx.provider.getPreferences()).toEqual({ career_density: "compact" });
    ctx.signInAs("u-2");
    expect(await ctx.provider.getPreferences()).toEqual({});
  });
  it("favorites a saved Clash the owner holds, and reports the longest win streak", async () => {
    ctx.server.putResult({ id: "pv_win0000001", session: "s1", mode: "single", finalScore: { gold: 110, blue: 100 }, goldIds: ["jordan"], created_at: Date.now() - 3000 });
    ctx.server.putResult({ id: "pv_win0000002", session: "s1", mode: "single", finalScore: { gold: 120, blue: 90 }, goldIds: ["jordan"], created_at: Date.now() - 2000 });
    ctx.server.putResult({ id: "pv_loss0000003", session: "s1", mode: "single", finalScore: { gold: 80, blue: 99 }, goldIds: ["jordan"], created_at: Date.now() - 1000 });
    ctx.server.claimAndSave({ resultId: "pv_win0000001", token: "test-token.u-1", deviceSession: "s1" });
    ctx.server.claimAndSave({ resultId: "pv_win0000002", token: "test-token.u-1", deviceSession: "s1" });
    ctx.server.claimAndSave({ resultId: "pv_loss0000003", token: "test-token.u-1", deviceSession: "s1" });
    ctx.signInAs("u-1");
    const fav = await ctx.provider.setClashFavorite("pv_win0000001", true);
    expect(fav.favorite).toBe(true);
    expect((await ctx.provider.career()).longestWinStreak).toBe(2);
    const activity = await ctx.provider.recentActivity(10);
    expect(activity.some((a) => a.kind === "clash_favorited")).toBe(true);
  });
});

describe("account deletion goes only through the server, only for the token's own user", () => {
  const configured = () => {
    vi.stubEnv("SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "A".repeat(32));
    vi.stubEnv("SUPABASE_ANON_KEY", "sb_publishable_" + "B".repeat(32));
    vi.stubEnv("CLOUD_ACCOUNTS_ENABLED", "true");
  };
  it("calls the admin delete endpoint for exactly the given user id", async () => {
    configured();
    let calledUrl = null, method = null;
    const out = await deleteAccount({ userId: "11111111-1111-1111-1111-111111111111" }, {
      fetch: async (u, init) => { calledUrl = u; method = init.method; return new Response("", { status: 200 }); },
    });
    expect(out).toEqual({ status: "deleted" });
    expect(calledUrl).toMatch(/\/auth\/v1\/admin\/users\/11111111-1111-1111-1111-111111111111$/);
    expect(method).toBe("DELETE");
    vi.unstubAllEnvs();
  });
  it("refuses a malformed user id and never calls the provider", async () => {
    configured();
    let called = false;
    const out = await deleteAccount({ userId: "../etc" }, { fetch: async () => { called = true; return new Response("", { status: 200 }); } });
    expect(out.status).toBe("invalid_user");
    expect(called).toBe(false);
    vi.unstubAllEnvs();
  });
  it("reports a rejected server credential distinctly, and a 404 as already gone", async () => {
    configured();
    expect((await deleteAccount({ userId: "11111111-1111-1111-1111-111111111111" }, { fetch: async () => new Response("", { status: 401 }) })).status).toBe("provider_rejected_server_key");
    expect((await deleteAccount({ userId: "11111111-1111-1111-1111-111111111111" }, { fetch: async () => new Response("", { status: 404 }) })).status).toBe("deleted");
    vi.unstubAllEnvs();
  });
});

describe("the migration and the event contract", () => {
  it("enables RLS and owner-only policies on both new tables", () => {
    expect(SQL).toMatch(/alter table public\.saved_rosters\s+enable row level security/);
    expect(SQL).toMatch(/alter table public\.user_preferences enable row level security/);
    for (const cmd of ["select", "insert", "update", "delete"]) expect(SQL).toMatch(new RegExp(`saved_rosters_${cmd}_own`));
    expect((SQL.match(/user_id = auth\.uid\(\)/g) || []).length).toBeGreaterThanOrEqual(6);
    expect(SQL).toMatch(/revoke all on public\.saved_rosters\s+from anon, authenticated/);
    // The favorite is the only column a browser may change on a saved Clash.
    expect(SQL).toMatch(/grant update \(favorite\)\s+on public\.saved_clashes\s+to authenticated/);
  });
  it("account-owned tables cascade on account deletion", () => {
    expect(SQL).toMatch(/references auth\.users \(id\) on delete cascade/);
  });
  it("a roster snapshot with a rating cannot be stored, by check constraint", () => {
    expect(SQL).toMatch(/roster_snapshot_ok/);
    expect(SQL).toMatch(/k not in \('id', 'name', 'pos'\)/);
    expect(SQL).toMatch(/prefs_ok/);
  });
  it("every Career V2 event is allowlisted on the server and mirrored on the client", () => {
    const events = [
      "career_history_viewed", "career_filter_changed", "saved_clash_favorited",
      "roster_saved", "roster_renamed", "roster_deleted", "roster_favorited",
      "run_it_back_started", "exact_replay_started",
      "device_reconciliation_viewed", "device_history_imported",
      "account_export_started", "account_export_completed",
      "account_deletion_started", "account_deletion_cancelled", "account_deletion_completed",
      "reauthentication_completed", "preference_updated",
    ];
    for (const e of events) {
      expect(EVENTS_ALLOWLIST.has(e), `${e} allowlisted`).toBe(true);
      expect(ACTIVATION_EVENTS, `${e} mirrored`).toContain(e);
    }
  });
  it("no Career V2 surface tracks a name, an email, an export's contents or a code", () => {
    const files = ["src/components/accounts/MyEraClash.jsx", "src/accounts/careerV2.js", "src/accounts/careerCloud.js"];
    for (const f of files) {
      const t = read(f);
      const tracks = [...t.matchAll(/track\([^;]*\)/g)].map((m) => m[0]).join(" ");
      expect(tracks, f).not.toMatch(/display_name|displayName|\.email|deletePhrase|accessToken|token/);
    }
  });
});
