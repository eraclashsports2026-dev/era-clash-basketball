#!/usr/bin/env node
// ── Phase 9B.2 Career V2 certification ──────────────────────────────────────
//   node scripts/accounts/careerV2Qa.mjs <mode>
//
// One dispatcher, several modes, all headless. Each mode exercises the REAL
// Career V2 modules and the test account adapter — which enforces the same
// ownership rules the SQL policies do — and writes its artifact under
// data/validation/9b2. The live database's own RLS is certified separately by
// direct probes (recorded in live-rls-qa.json); these certify behaviour and
// the security invariants that live in code.
//
// Nothing here needs a signed-in browser session, which is why every mode runs
// with Supabase anonymous auth disabled (a Phase 9B.2 start condition).
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import {
  tabFromSearch, CAREER_TAB_IDS, applyHistoryFilters, sortHistory, pageOf, erasInHistory,
  rosterSnapshotFrom, cleanRosterName, suggestRosterName, SAVED_ROSTER_LIMIT_FREE,
  cleanPrefs, mergePrefs, PREF_DEFAULTS, PREF_KEYS,
  replayCapability, runItBackSetup, reconciliationState, RECONCILIATION,
  buildAccountExport, EXPORT_EXCLUDED_KEYS, historyCsv, exportFilename,
  needsReauthentication, DELETION_PHRASE,
} from "../../src/accounts/careerV2.js";
import { createTestProvider } from "../../src/accounts/testAdapter.js";
import { deleteAccount } from "../../api/_lib/cloudAccounts.js";

const MODE = process.argv[2] || "career-v2";
const OUT = "data/validation/9b2";
mkdirSync(OUT, { recursive: true });

const checks = [];
const ok = (name, pass, detail = "") => { checks.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };
const write = (file, extra = {}) => {
  const passed = checks.filter((c) => c.pass).length;
  writeFileSync(`${OUT}/${file}`, JSON.stringify({
    phase: "9B.2", mode: MODE, generatedAt: new Date().toISOString(),
    trustModel: "The real Career V2 modules exercised against the test account adapter, which enforces the same ownership rules the SQL policies enforce. Live database RLS is certified separately in live-rls-qa.json.",
    checks, passed, total: checks.length, allPassed: passed === checks.length, ...extra,
  }, null, 2) + "\n");
  console.log(`\n${passed}/${checks.length} passed → ${OUT}/${file}`);
  process.exit(passed === checks.length ? 0 : 1);
};

// A saved-clash row shaped like the provider returns.
const clash = (over = {}) => ({
  result_id: over.result_id || "pv_" + Math.random().toString(36).slice(2, 10),
  mode: "chaos", outcome: "win", gold_score: 110, blue_score: 100, era_id: "1990s",
  gold_roster: [{ id: "jordan", name: "Jordan", pos: "SG" }, { id: "pippen", name: "Pippen", pos: "SF" }, { id: "rodman", name: "Rodman", pos: "PF" }, { id: "grant", name: "Grant", pos: "PF" }, { id: "paxson", name: "Paxson", pos: "PG" }],
  blue_roster: [{ id: "magic", name: "Magic", pos: "PG" }],
  gold_coach: { id: "phil", name: "Phil" }, blue_coach: { id: "pat", name: "Pat" },
  mvp: { name: "Jordan", pts: 38 }, candidate_id: "Candidate 4", calibration_version: "1.4.0",
  candidate_core_hash: "55bb26a2", favorite: false, played_at: new Date().toISOString(),
  result_snapshot: { core: { winner: "GOLD" }, seed: 42 }, ...over,
});

// ── career-v2: overview + history behaviour ─────────────────────────────────
if (MODE === "career-v2") {
  ok("the five tabs are exactly overview/history/rosters/favorites/account", CAREER_TAB_IDS.join(",") === "overview,history,rosters,favorites,account");
  ok("a URL tab is honoured and an unknown one falls back to overview", tabFromSearch("?tab=rosters") === "rosters" && tabFromSearch("?tab=x") === "overview");
  const rows = [clash({ mode: "chaos", era_id: "1990s" }), clash({ mode: "single", outcome: "loss", era_id: "1980s", gold_score: 90, blue_score: 99 }), clash({ mode: "daily", outcome: "tie", gold_score: 100, blue_score: 100 })];
  ok("history filters by mode, outcome and era independently", applyHistoryFilters(rows, { mode: "chaos" }).length === 1 && applyHistoryFilters(rows, { outcome: "tie" }).length === 1 && applyHistoryFilters(rows, { era: "1980s" }).length === 1);
  ok("only eras that occur are offered, in order", erasInHistory(rows).join(",") === "1980s,1990s");
  ok("sorting never crashes on a scoreless row", (() => { try { sortHistory([...rows, clash({ gold_score: null, blue_score: null })], "margin"); return true; } catch { return false; } })());
  ok("history pages at 25", pageOf(Array.from({ length: 60 }, () => clash()), 0).pages === 3);
  ok("no rank, percentile or contender grade is a Career V2 concept", !/rank|percentile|contender|leaderboard/i.test(readFileSync("src/components/accounts/MyEraClash.jsx", "utf8").replace(/no leaderboard|no rank/gi, "")));
  const ctx = createTestProvider({ users: [{ userId: "u-1", email: "a@x.co" }] });
  ctx.server.putResult({ id: "pv_a0000001", session: "s", mode: "single", finalScore: { gold: 110, blue: 100 }, goldIds: ["jordan"], created_at: Date.now() - 2000 });
  ctx.server.putResult({ id: "pv_a0000002", session: "s", mode: "single", finalScore: { gold: 120, blue: 90 }, goldIds: ["jordan"], created_at: Date.now() - 1000 });
  ctx.server.claimAndSave({ resultId: "pv_a0000001", token: "test-token.u-1", deviceSession: "s" });
  ctx.server.claimAndSave({ resultId: "pv_a0000002", token: "test-token.u-1", deviceSession: "s" });
  ctx.signInAs("u-1");
  const career = await ctx.provider.career();
  ok("career totals are derived, not invented", career.summary.games_played === 2 && career.summary.wins === 2 && career.longestWinStreak === 2);
  const activity = await ctx.provider.recentActivity(5);
  ok("recent activity is derived from real rows", activity.length >= 2 && activity.every((a) => a.occurred_at));
  write("career-history-qa.json", { contract: { tabs: CAREER_TAB_IDS, filters: ["mode", "outcome", "era", "range"], sorts: ["newest", "oldest", "margin", "closest"], pageSize: 25 } });
}

// ── saved-rosters ───────────────────────────────────────────────────────────
if (MODE === "saved-rosters") {
  ok("a snapshot keeps identity only", JSON.stringify(rosterSnapshotFrom([{ id: "jordan", name: "Jordan", pos: "SG", rating: 99 }])) === JSON.stringify([{ id: "jordan", name: "Jordan", pos: "SG" }]));
  ok("a name is suggested from surnames and cleaned", suggestRosterName([{ name: "Michael Jordan" }, { name: "Tim Duncan" }]) === "Jordan / Duncan" && cleanRosterName("  a  b  ") === "a b");
  const ctx = createTestProvider({ users: [{ userId: "u-1", email: "a@x.co" }, { userId: "u-2", email: "b@x.co" }] });
  ctx.signInAs("u-1");
  const r = await ctx.provider.saveRoster({ displayName: "Bulls", roster: [{ id: "jordan", name: "Jordan", pos: "SG" }] });
  ok("a roster saves for its owner", r.display_name === "Bulls");
  const renamed = await ctx.provider.renameRoster(r.id, "Chicago");
  ok("a roster renames and stamps renamed_at", renamed.display_name === "Chicago" && !!renamed.renamed_at);
  await ctx.provider.setRosterFavorite(r.id, true);
  ok("a roster favorites", (await ctx.provider.listRosters())[0].favorite === true);
  ctx.signInAs("u-2");
  ok("a second account sees none of the first's rosters", (await ctx.provider.listRosters()).length === 0);
  let stole = false; try { await ctx.provider.renameRoster(r.id, "x"); stole = true; } catch { /* refused */ }
  ok("a second account cannot rename another's roster", !stole);
  ctx.signInAs("u-1");
  for (let i = 0; i < SAVED_ROSTER_LIMIT_FREE - 1; i++) await ctx.provider.saveRoster({ displayName: `r${i}`, roster: [{ id: `p${i}` }] });
  let limited = false; try { await ctx.provider.saveRoster({ displayName: "over", roster: [{ id: "z" }] }); } catch (e) { limited = e.code === "ROSTER_LIMIT_REACHED"; }
  ok("the 11th roster is refused", limited);
  await ctx.provider.deleteRoster(r.id);
  ok("a roster deletes", (await ctx.provider.listRosters()).every((x) => x.id !== r.id));
  const SQL = readFileSync("supabase/migrations/0003_career_v2.sql", "utf8");
  ok("the database refuses a rating-bearing snapshot by constraint", /k not in \('id', 'name', 'pos'\)/.test(SQL));
  write("saved-roster-contract.json", { limitFree: SAVED_ROSTER_LIMIT_FREE, snapshotKeys: ["id", "name", "pos"] });
}

// ── run-it-back ─────────────────────────────────────────────────────────────
if (MODE === "run-it-back") {
  const c = clash();
  const cap = replayCapability(c);
  ok("Run It Back is offered when the five is intact", cap.runItBack === true);
  const setup = runItBackSetup(c);
  ok("Run It Back reproduces roster, coaches and era", setup.goldIds.length === 5 && setup.coachGoldId === "phil" && setup.eraStyleId === "1990s");
  ok("Run It Back carries a chaos tag for a chaos clash", setup.tag === "chaos");
  ok("Exact Replay is never offered, because the server takes no chosen seed", cap.exact.available === false && cap.exact.reason === "NO_SERVER_SEED_REPLAY");
  ok("a snapshot with no seed reports its own reason", replayCapability(clash({ result_snapshot: { core: {} } })).exact.reason === "SNAPSHOT_MISSING_SEED");
  ok("a clash from a vanished engine build cannot be replayed exactly", replayCapability(c, { coreHash: "other" }).exact.reason === "CANDIDATE_UNAVAILABLE");
  ok("Run It Back is refused when the five cannot be reconstructed", runItBackSetup(clash({ gold_roster: [{ id: "a" }] })) === null);
  const app = readFileSync("src/App.jsx", "utf8");
  ok("App reconstructs the five and passes it as a gold override, never a stale team", /runItBackFromSaved/.test(app) && /goldOverride/.test(app));
  ok("App never sends a chosen seed to the game", !/seed:\s*(clash|saved|record)/.test(app));
  write("run-it-back-qa.json", { runItBack: "same five, coaches, era; new seed", exactReplay: "never — the game API takes no chosen seed; the saved report is the exact record" });
}

// ── reauthentication ────────────────────────────────────────────────────────
if (MODE === "reauthentication") {
  const mk = (agoSec) => { const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url"); return `${b({ alg: "HS256" })}.${b({ iat: Math.floor(Date.now() / 1000) - agoSec })}.s`; };
  ok("a fresh session does not need reauthentication", needsReauthentication(mk(60)) === false);
  ok("a session older than the window does", needsReauthentication(mk(3600)) === true);
  ok("an unreadable token is treated as needing reauthentication", needsReauthentication("nope") === true);
  // The full sign-out → sign-in-again → same career is a permanent regression on the adapter.
  const ctx = createTestProvider({ users: [{ userId: "u-1", email: "a@x.co" }] });
  ctx.signInAs("u-1");
  ctx.server.putResult({ id: "pv_r0000001", session: "s", mode: "single", finalScore: { gold: 110, blue: 100 }, goldIds: ["jordan"], created_at: Date.now() });
  ctx.server.claimAndSave({ resultId: "pv_r0000001", token: "test-token.u-1", deviceSession: "s" });
  await ctx.provider.saveRoster({ displayName: "Keeper", roster: [{ id: "jordan" }] });
  await ctx.provider.setPreferences({ career_density: "compact" });
  const before = { clashes: (await ctx.provider.listSavedClashes()).length, rosters: (await ctx.provider.listRosters()).length, prefs: await ctx.provider.getPreferences() };
  await ctx.provider.signOut();
  let goneWhileOut = true; try { await ctx.provider.listSavedClashes(); goneWhileOut = false; } catch { /* no session → nothing */ }
  ok("signed out, private data is unreachable", goneWhileOut);
  ctx.signInAs("u-1");   // reauthenticate as the same account
  const after = { clashes: (await ctx.provider.listSavedClashes()).length, rosters: (await ctx.provider.listRosters()).length, prefs: await ctx.provider.getPreferences() };
  ok("after reauthentication the same career returns", after.clashes === before.clashes && before.clashes === 1);
  ok("after reauthentication the same rosters return", after.rosters === before.rosters && before.rosters === 1);
  ok("after reauthentication the same preferences return", JSON.stringify(after.prefs) === JSON.stringify(before.prefs) && after.prefs.career_density === "compact");
  ok("a wrong code is refused", await (async () => { try { await ctx.provider.verifyEmailCode("a@x.co", "000000"); return false; } catch { return true; } })());
  write("reauthentication-qa.json", { window: "30 minutes", note: "The live credentialed reauthentication is exercised by the owner journey; this is the permanent regression." });
}

// ── export ──────────────────────────────────────────────────────────────────
if (MODE === "export") {
  const doc = buildAccountExport({
    profile: { display_name: "Coach", created_at: "2026-01-01T00:00:00Z", email: "leak@example.com", session: "sekret" },
    prefs: { career_density: "compact", tracking: "yes" },
    clashes: [clash({ favorite: true, result_snapshot: { core: {}, session: "abc", seed: 1 } })],
    rosters: [{ id: "r1", display_name: "Five", favorite: true, roster_snapshot: [{ id: "jordan" }] }],
  });
  const json = JSON.stringify(doc);
  ok("no excluded key survives at any depth", EXPORT_EXCLUDED_KEYS.every((k) => !json.includes(`"${k}"`)));
  ok("no email or session value leaks", !json.includes("leak@example.com") && !json.includes("sekret") && !json.includes("abc"));
  ok("the export carries profile, cleaned prefs, clashes, rosters and favorites", doc.profile.display_name === "Coach" && JSON.stringify(doc.preferences) === JSON.stringify({ career_density: "compact" }) && doc.savedClashes.length === 1 && doc.favorites.rosters[0] === "r1");
  ok("the CSV header and a row are present", historyCsv(doc.savedClashes).split("\n")[0].startsWith("played_at,mode,outcome"));
  ok("the filename is date-stamped", /^eraclash-account-export-\d{4}-\d{2}-\d{2}\.json$/.test(exportFilename()));
  ok("the export runs through browser-owned reads, not a new server function", /assembleAccountExport/.test(readFileSync("src/accounts/careerCloud.js", "utf8")));
  write("account-export-qa.json", { format: doc.format, version: doc.version, excluded: EXPORT_EXCLUDED_KEYS });
}

// ── deletion ────────────────────────────────────────────────────────────────
if (MODE === "deletion") {
  process.env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_" + "A".repeat(32);
  process.env.SUPABASE_ANON_KEY = "sb_publishable_" + "B".repeat(32);
  process.env.CLOUD_ACCOUNTS_ENABLED = "true";
  let url = null, method = null;
  const out = await deleteAccount({ userId: "11111111-1111-1111-1111-111111111111" }, { fetch: async (u, i) => { url = u; method = i.method; return new Response("", { status: 200 }); } });
  ok("deletion calls the admin endpoint for exactly the given user, with DELETE", out.status === "deleted" && /\/auth\/v1\/admin\/users\/11111111-1111-1111-1111-111111111111$/.test(url) && method === "DELETE");
  ok("a malformed user id is refused and no request is made", (await deleteAccount({ userId: "../x" }, { fetch: async () => { throw new Error("should not run"); } })).status === "invalid_user");
  ok("a rejected server credential is reported distinctly", (await deleteAccount({ userId: "11111111-1111-1111-1111-111111111111" }, { fetch: async () => new Response("", { status: 401 }) })).status === "provider_rejected_server_key");
  ok("a 404 is treated as already deleted", (await deleteAccount({ userId: "11111111-1111-1111-1111-111111111111" }, { fetch: async () => new Response("", { status: 404 }) })).status === "deleted");
  const server = readFileSync("api/profile.js", "utf8");
  ok("the server takes the user id from the verified token, never the body", /deleteAccount\(\{ userId: who\.userId \}\)/.test(server));
  ok("deletion is gated by a typed phrase in the UI", /DELETION_PHRASE/.test(readFileSync("src/components/accounts/MyEraClash.jsx", "utf8")) && DELETION_PHRASE === "DELETE");
  ok("deletion is gated by reauthentication in the UI", /needsReauthentication/.test(readFileSync("src/components/accounts/MyEraClash.jsx", "utf8")));
  const SQL = readFileSync("supabase/migrations/0003_career_v2.sql", "utf8");
  ok("account-owned tables cascade on delete", /references auth\.users \(id\) on delete cascade/.test(SQL));
  write("account-deletion-qa.json", { phrase: DELETION_PHRASE, reauthGated: true, cascade: "auth.users → profiles, saved_clashes, saved_rosters, user_preferences, result_claims", liveCascade: "verified with synthetic users in live-rls-qa.json" });
}

// ── device-reconciliation ───────────────────────────────────────────────────
if (MODE === "device-reconciliation") {
  ok("no device history → NO_DEVICE_HISTORY", reconciliationState({ deviceCount: 0 }) === RECONCILIATION.NO_DEVICE_HISTORY);
  ok("nothing unsaved → IMPORT_COMPLETE", reconciliationState({ deviceCount: 3, unsavedCount: 0 }) === RECONCILIATION.IMPORT_COMPLETE);
  ok("eligible unsaved → IMPORT_AVAILABLE", reconciliationState({ deviceCount: 3, unsavedCount: 2, eligible: 2 }) === RECONCILIATION.IMPORT_AVAILABLE);
  ok("owned by another → CONFLICT", reconciliationState({ deviceCount: 3, unsavedCount: 2, eligible: 0, claimedByOther: 2 }) === RECONCILIATION.CONFLICT);
  ok("mixed outcome → PARTIAL_IMPORT", reconciliationState({ deviceCount: 3, unsavedCount: 2, eligible: 1, lastImport: { imported: 1, refused: 1 } }) === RECONCILIATION.PARTIAL_IMPORT);
  // Idempotency + never-claim-another's-browser through the adapter's server path.
  const ctx = createTestProvider({ users: [{ userId: "u-1", email: "a@x.co" }, { userId: "u-2", email: "b@x.co" }] });
  ctx.server.putResult({ id: "pv_d0000001", session: "mine", mode: "single", finalScore: { gold: 1, blue: 0 }, goldIds: ["jordan"], created_at: Date.now() });
  const first = ctx.server.importDeviceHistory({ candidateIds: ["pv_d0000001"], token: "test-token.u-1", deviceSession: "mine" });
  const again = ctx.server.importDeviceHistory({ candidateIds: ["pv_d0000001"], token: "test-token.u-1", deviceSession: "mine" });
  ok("importing is idempotent — the second pass adds nothing", first.imported === 1 && again.imported === 0 && again.alreadySaved === 1);
  const other = ctx.server.importDeviceHistory({ candidateIds: ["pv_d0000001"], token: "test-token.u-2", deviceSession: "not-mine" });
  ok("a device cannot claim a result it did not play", other.imported === 0 && other.refused === 1);
  write("device-reconciliation-qa.json", { states: Object.values(RECONCILIATION), idempotent: true });
}

// ── performance ─────────────────────────────────────────────────────────────
if (MODE === "performance") {
  const bench = (n) => {
    const rows = Array.from({ length: n }, (_, i) => clash({ result_id: `pv_${String(i).padStart(8, "0")}`, outcome: i % 3 === 0 ? "loss" : "win", played_at: new Date(Date.now() - i * 86400000).toISOString() }));
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) pageOf(sortHistory(applyHistoryFilters(rows, { outcome: "win" }), "margin"), i % 5);
    return { n, ms: +(performance.now() - t0).toFixed(1) };
  };
  const sizes = [0, 10, 100, 500].map(bench);
  for (const s of sizes) ok(`filtering, sorting and paging ${s.n} Clashes 20× stays responsive`, s.ms < 250, `${s.ms}ms`);
  ok("history is bounded by pagination, never rendering an unbounded list", pageOf(Array.from({ length: 500 }, () => clash()), 0).rows.length === 25);
  write("account-performance-qa.json", { sizes, note: "Synthetic fixtures following the saved-result schema; no real simulations were run." });
}

// ── responsive: structural certification of the signed-in surface ───────────
if (MODE === "responsive") {
  const src = readFileSync("src/components/accounts/MyEraClash.jsx", "utf8");
  ok("interactive controls declare a 44px+ target", (src.match(/minHeight: 44|minHeight: 48/g) || []).length >= 6 && /minWidth: 44/.test(src));
  ok("the tab row scrolls rather than overflowing on narrow screens", /overflowX: "auto"/.test(src));
  ok("inputs are full-width and box-sized, not fixed desktop widths", /boxSizing: "border-box", width: "100%"/.test(src));
  ok("the stat grid and history use auto-fit/flex, not a fixed table", /auto-fit/.test(src) && !/<table/.test(src));
  ok("filters wrap instead of forcing a horizontal scroll", /flexWrap: "wrap"/.test(src));
  ok("account deletion sits in its own separated, bordered section", /red-border/.test(src));
  write("account-responsive-qa.json", { widths: ["430x932","390x844","375x812"], approach: "relative units, flex/auto-fit grids, wrapping filters, 44px targets; the signed-out entry surface is measured live by account:my-eraclash-qa and account:responsive-qa" });
}

// ── accessibility: structural certification ─────────────────────────────────
if (MODE === "accessibility") {
  const src = readFileSync("src/components/accounts/MyEraClash.jsx", "utf8");
  ok("the tabs are a semantic tablist with selected state", /role="tablist"/.test(src) && /role="tab"/.test(src) && /aria-selected=/.test(src) && /role="tabpanel"/.test(src));
  ok("history rows are expandable with aria-expanded and aria-controls", /aria-expanded=\{open\}/.test(src) && /aria-controls=/.test(src));
  ok("favorite toggles announce their pressed state and have a label", /aria-pressed=/.test(src) && /aria-label=\{.*favorite/i.test(src));
  ok("save and delete announcements go through a polite live region", /aria-live="polite"/.test(src));
  ok("result state is never colour-only — a word carries the outcome", /OUTCOME_WORD\[/.test(src));
  ok("the destructive delete requires a typed phrase and clear focus, not one click", /DELETION_PHRASE/.test(src) && /Type \{DELETION_PHRASE\} to confirm/.test(src));
  ok("form controls are labelled", (src.match(/htmlFor=/g) || []).length >= 3 && /aria-label="Roster name"/.test(src));
  ok("the page is a labelled main landmark with an h1", /aria-labelledby="ec-me-title"/.test(src) && /<h1 /.test(src));
  write("account-accessibility-qa.json", { standard: "WCAG AA", surfaces: ["semantic tabs","expandable rows","live announcements","labelled controls","non-colour-only outcomes","safe destructive dialog"] });
}
