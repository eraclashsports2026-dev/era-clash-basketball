// ── Phase 9B.1: real accounts, cloud career, guest claim, My EraClash ───────
// The security model is the point of this file. Every test that matters here
// asks the same question a different way: can a browser make the server store
// something it did not earn, or read something that is not its own?
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  providerConfigured, cloudAccountsEnabled, cloudAccountsStatus, safeReturnPath,
  cleanDisplayName, MAX_DISPLAY_NAME, CLOUD_ACCOUNTS_VERSION, flagOn, keyShapeOk, providerUrlOk, looksLikeSecretKey,
} from "../src/accounts/config.js";
import { provider, withProvider, _setProvider, FAILURE_CODES } from "../src/accounts/provider.js";
import { createTestProvider } from "../src/accounts/testAdapter.js";
import {
  buildSavedClash, claimAndSaveResult, importDeviceHistory, countEligibleForImport,
  verifyAccountToken, cloudAccountsServerStatus, cloudAccountsReady, sha256,
  CANDIDATE_ID_SHAPE, MAX_IMPORT_CANDIDATES, flagOn as serverFlagOn, keyShapeOk as serverKeyShapeOk,
  looksLikeSecretKey as serverLooksLikeSecretKey, serviceKeyShapeOk as serverServiceKeyShapeOk,
} from "../api/_lib/cloudAccounts.js";
import { EVENTS_ALLOWLIST } from "../api/events.js";
import { ACTIVATION_EVENTS } from "../src/activation.js";

const read = (f) => readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const SQL = read("supabase/migrations/0001_accounts.sql");
const SQL2 = read("supabase/migrations/0002_accounts_hardening.sql");
/** The SQL with its comments stripped: what Postgres actually applies. */
const DDL = SQL.replace(/^\s*--.*$/gm, "");
/** DDL without COMMENT ON statements, whose prose is documentation, not schema. */
const COLUMNS_DDL = DDL.replace(/comment on [\s\S]*?;/g, "");
const git = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const PARENT = "fd36b5a107443367da704feb3f9dddea1452ae23"; // owner-accepted Play Lobby Polish V1
const parentAvailable = () => git(`git cat-file -t ${PARENT}`) === "commit";

/** An authoritative result record, shaped exactly as api/game.js writes one. */
const record = (over = {}) => ({
  v: 1, id: "pv_abc123def4", session: "a".repeat(48), mode: "single",
  goldIds: ["g1", "g2", "g3", "g4", "g5"], blueIds: ["b1", "b2", "b3", "b4", "b5"],
  finalScore: { gold: 112, blue: 104 }, eraId: "1990s",
  mvp: { name: "Test Legend", pts: 33 },
  previewCandidate: { candidateId: "Candidate 4", calibrationVersion: "1.4.0", candidateCoreHash: "c".repeat(64) },
  pregame: { cards: [{ id: "g1", name: "Gold One", pos: "PG" }], coachGold: { id: "cg", name: "Coach Gold" }, coachBlue: { id: "cb", name: "Coach Blue" } },
  core: { winner: "GOLD" }, challengeId: "chal01", created_at: 1_760_000_000_000,
  ...over,
});

describe("configuration and the feature flag", () => {
  it("reports itself unconfigured with no provider environment, and never claims to be enabled", () => {
    expect(providerConfigured()).toBe(false);
    expect(cloudAccountsEnabled()).toBe(false);
    expect(providerUrlOk()).toBe(false);
    expect(cloudAccountsStatus()).toEqual({ enabled: false, reason: "PROVIDER_NOT_CONFIGURED" });
    expect(CLOUD_ACCOUNTS_VERSION).toBe("1.0.0");
  });
  it("with no provider, every product call refuses rather than faking a success", async () => {
    _setProvider(null);
    expect(provider()).toBe(null);
    await expect(withProvider((p) => p.currentSession())).rejects.toThrow("CLOUD_ACCOUNTS_DISABLED");
    expect(await withProvider((p) => p.currentSession(), null)).toBe(null);
  });
  it("reads a boolean flag the way a person types it into a dashboard", () => {
    // A strict === "true" turned a capitalised value into a feature that
    // silently did not exist, which cost a deployment round trip. Both sides
    // now read the flag the same forgiving way.
    for (const on of ["true", "TRUE", "True", " true ", "1", "yes", "on", "ON"]) expect(flagOn(on), on).toBe(true);
    for (const off of ["false", "FALSE", "0", "no", "off", "", "  ", null, undefined, "truthy"]) expect(flagOn(off), String(off)).toBe(false);
    // The server uses the identical rule.
    expect(serverFlagOn("TRUE")).toBe(true);
    expect(serverFlagOn("nope")).toBe(false);
    expect(src("api/_lib/cloudAccounts.js")).toMatch(/enabled: flagOn\(process\.env\.CLOUD_ACCOUNTS_ENABLED\)/);
    expect(src("src/accounts/config.js")).toMatch(/flagOn\(env\("VITE_CLOUD_ACCOUNTS_ENABLED"\)\)/);
  });
  it("refuses a SECRET key in a browser variable, in either of its forms", () => {
    // This actually happened: VITE_SUPABASE_ANON_KEY was set to an sb_secret_
    // key, which shipped in the bundle. A secret key bypasses row level
    // security completely, so a reader of the bundle would have had full
    // database access. Length and printability both said it was fine.
    const anonJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0.sig";
    const serviceJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.sig";
    const secretPrefixed = `sb_secret_${"0".repeat(24)}`;
    // Detected as secrets.
    expect(looksLikeSecretKey(secretPrefixed)).toBe(true);
    expect(looksLikeSecretKey(serviceJwt)).toBe(true);
    expect(serverLooksLikeSecretKey(secretPrefixed)).toBe(true);
    expect(serverLooksLikeSecretKey(serviceJwt)).toBe(true);
    expect(looksLikeSecretKey(anonJwt)).toBe(false);
    // Therefore refused for the browser, at any length.
    expect(keyShapeOk(secretPrefixed)).toBe(false);
    expect(keyShapeOk(serviceJwt)).toBe(false);
    expect(serverKeyShapeOk(secretPrefixed)).toBe(false);
    expect(keyShapeOk(anonJwt)).toBe(true);
    // The server's own key must BE a secret; an anon key there is refused.
    expect(serverServiceKeyShapeOk(serviceJwt)).toBe(true);
    expect(serverServiceKeyShapeOk(secretPrefixed)).toBe(true);
    expect(serverServiceKeyShapeOk(anonJwt)).toBe(false);
    // And the status names this mistake separately from a malformed value.
    expect(src("src/accounts/config.js")).toMatch(/ANON_KEY_IS_A_SECRET_KEY/);
  });
  it("rejects a key copied out of a masked dashboard field", () => {
    // This cost a deployment round trip: the anon key had been copied from a
    // partly-masked view, giving "eyJhbGci" plus 200 bullet characters. It is
    // 208 characters long, so the old length > 40 check waved it through and
    // every auth call then failed with a vendor error that explained nothing.
    const real = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.GmUgMjZLOb4xkqGcMvkZBKAxlTpEyIPehZCFSA3fMhw";
    expect(keyShapeOk(real)).toBe(true);
    expect(keyShapeOk(real + "\n")).toBe(true);                       // trimmed
    const fakeSuffix = "0".repeat(24);
    expect(keyShapeOk(`sb_publishable_${fakeSuffix}`)).toBe(true);
    expect(keyShapeOk(`sb_secret_${fakeSuffix}`)).toBe(false);   // a secret is never a browser key
    expect(keyShapeOk("sb_publishable_short")).toBe(false);
    expect(keyShapeOk("eyJhbGci" + "\u2022".repeat(200))).toBe(false);  // the masked paste
    expect(keyShapeOk("x".repeat(300))).toBe(false);                    // long but not a key
    expect(keyShapeOk("")).toBe(false);
    expect(keyShapeOk(null)).toBe(false);
    // Both sides apply it, and the status names the problem distinctly.
    expect(serverKeyShapeOk("eyJhbGci" + "\u2022".repeat(200))).toBe(false);
    expect(src("api/_lib/cloudAccounts.js")).toMatch(/serviceRoleConfigured: serviceKeyShapeOk\(serviceKey\(\)\)/);
    expect(src("api/_lib/cloudAccounts.js")).toMatch(/anonKeyConfigured: keyShapeOk\(anonKey\(\)\)/);
    expect(src("src/accounts/config.js")).toMatch(/ANON_KEY_MALFORMED/);
    expect(src("src/components/accounts/AccountDialog.jsx")).toMatch(/ANON_KEY_MALFORMED/);
  });
  it("tolerates a pasted URL with trailing slashes or stray whitespace", () => {
    expect(src("src/accounts/config.js")).toMatch(/String\(SUPABASE_URL\)\.trim\(\)\.replace\(\/\\\/\+\$\/, ""\)/);
    expect(src("api/_lib/cloudAccounts.js")).toMatch(/\.trim\(\)\.replace\(\/\\\/\+\$\/, ""\)/);
    expect(src("api/_lib/cloudAccounts.js")).toMatch(/SUPABASE_SERVICE_ROLE_KEY \|\| ""\)\.trim\(\)/);
  });
  it("the server reports its own configuration as booleans only", () => {
    const s = cloudAccountsServerStatus();
    expect(Object.keys(s).sort()).toEqual(["anonKeyConfigured", "enabled", "providerUrlConfigured", "serviceRoleConfigured"]);
    for (const v of Object.values(s)) expect(typeof v).toBe("boolean");
    expect(cloudAccountsReady()).toBe(false);
  });
  it("refuses an unsafe post-sign-in destination", () => {
    for (const bad of ["//evil.com", "https://evil.com", "\\\\evil", "/api/game", "/auth/callback", "", null, undefined]) {
      expect(safeReturnPath(bad), String(bad)).toBe("/play");
    }
    expect(safeReturnPath("/my-eraclash?tab=recent")).toBe("/my-eraclash?tab=recent");
    expect(safeReturnPath("/play/chaos")).toBe("/play/chaos");
  });
  it("cleans and caps a display name, and strips markup and invisible characters", () => {
    expect(cleanDisplayName("  Joseph  ")).toBe("Joseph");
    expect(cleanDisplayName("<script>x</script>")).not.toMatch(/[<>]/);
    expect(cleanDisplayName("x".repeat(80)).length).toBe(MAX_DISPLAY_NAME);
    expect(cleanDisplayName("   ")).toBe("");
  });
});

describe("the database contract", () => {
  it("enables row level security on every user-owned table", () => {
    for (const t of ["profiles", "saved_clashes", "result_claims"]) {
      expect(SQL, t).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    }
  });
  it("grants a client SELECT on its own rows only, and no client INSERT, UPDATE or DELETE on career data", () => {
    // Every policy in the file, with its command and its table.
    const policies = [...DDL.matchAll(/create policy (\w+) on public\.(\w+)\s+for (\w+) to (\w+) using \(([\s\S]*?)\);/g)]
      .map(([, name, table, cmd, role, using]) => ({ name, table, cmd, role, using }));
    expect(policies.length).toBeGreaterThanOrEqual(4);
    for (const p of policies) {
      expect(p.role, `${p.name} must be granted to authenticated only`).toBe("authenticated");
      expect(p.using, `${p.name} must scope to the caller`).toMatch(/user_id = auth\.uid\(\)/);
    }
    // saved_clashes and result_claims are readable, never writable, by a client.
    for (const t of ["saved_clashes", "result_claims"]) {
      expect(policies.filter((p) => p.table === t).map((p) => p.cmd)).toEqual(["select"]);
      expect(DDL, t).not.toMatch(new RegExp(`create policy \\w+ on public\\.${t}\\s+for (insert|update|delete)`));
    }
    // profiles: select and update only. No insert (the trigger owns creation), no delete.
    expect(policies.filter((p) => p.table === "profiles").map((p) => p.cmd).sort()).toEqual(["select", "update"]);
    expect(DDL).not.toMatch(/create policy \w+ on public\.profiles\s+for (insert|delete)/);
  });
  it("an update policy also constrains the row it writes", () => {
    expect(SQL).toMatch(/profiles_update_own[\s\S]{0,160}with check \(user_id = auth\.uid\(\)\)/);
  });
  it("narrows the authenticated role too, not only anonymous", () => {
    // 0001 revoked anon and stopped there, so Supabase's blanket default grants
    // left a signed-in browser holding INSERT, UPDATE, DELETE and TRUNCATE on
    // the career tables. Row level security blocked every reachable write, but
    // TRUNCATE is not subject to RLS and the grants contradicted 0001's own
    // comment. Confirmed against the live database, and corrected by 0002:
    // data/validation/9b1/account-rls-live-verification.json
    for (const t of ["profiles", "saved_clashes", "result_claims"]) {
      expect(SQL2, t).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from authenticated`));
    }
    expect(SQL2).toMatch(/revoke all on public\.career_summary, public\.career_by_mode, public\.career_streak from authenticated/);
    // Granted back: reads, plus a COLUMN-scoped update so a row's own user_id
    // and created_at cannot be rewritten even by its owner.
    expect(SQL2).toMatch(/grant select on public\.saved_clashes to authenticated/);
    expect(SQL2).toMatch(/grant select on public\.result_claims to authenticated/);
    expect(SQL2).toMatch(/grant update \(display_name, avatar_url\) on public\.profiles to authenticated/);
    expect(SQL2).not.toMatch(/grant (insert|delete|truncate|all) on public\.(saved_clashes|result_claims|profiles)/i);
    // A table added later starts closed rather than open.
    expect(SQL2).toMatch(/alter default privileges in schema public revoke all on tables from anon, authenticated/);
  });
  it("keeps the trigger functions off the REST API and pins their search_path", () => {
    for (const fn of ["handle_new_user", "touch_updated_at"]) {
      expect(SQL2, fn).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\(\\)\\s+from public, anon, authenticated`));
    }
    expect(SQL2).toMatch(/alter function public\.touch_updated_at\(\) set search_path = public/);
    expect(SQL).toMatch(/security definer set search_path = public/);   // 0001 already pinned this one
  });
  it("records the live verification, including what it found wrong", () => {
    const v = JSON.parse(read("data/validation/9b1/account-rls-live-verification.json"));
    expect(v.migrationsApplied.map((m) => m.version)).toEqual(["0001_accounts", "0002_accounts_hardening"]);
    expect(v.method).toMatch(/Not a simulation/);
    expect(v.effectivePrivileges.anon).toMatch(/none/);
    expect(v.effectivePrivileges.authenticated.saved_clashes).toBe("SELECT");
    expect(v.effectivePrivileges.finding).toMatch(/TRUNCATE is not subject to RLS/);
    expect(v.supabaseSecurityAdvisors.warningsRemaining).toBe(0);
    expect(v.unauthenticatedProbes.every((p) => p.status === 401 || p.status === 404)).toBe(true);
    // The phase must not claim an end-to-end result it has not measured. What
    // remains unmeasured has moved on — first it was the Vercel wiring, now it
    // is the emailed one-time code — so assert that the field still names a
    // real outstanding step rather than pinning one phrasing of it.
    expect(v.endToEndStillPending).toMatch(/one-time code|Vercel Preview environment/);
    expect(v.endToEndStillPending.length).toBeGreaterThan(40);
    // And the three configuration incidents are recorded with their fixes.
    expect(v.keyIncidents).toHaveLength(3);
    for (const i of v.keyIncidents) { expect(i.what).toBeTruthy(); expect(i.effect).toBeTruthy(); expect(i.fix).toBeTruthy(); }
    expect(JSON.stringify(v.keyIncidents)).toMatch(/bypasses row level security/);
    expect(v.rotationVerified).toEqual({ leakedSecretRejected: true, httpStatus: 401, verifiedAt: expect.any(String) });
    // No incident record may quote the credential it is about.
    expect(JSON.stringify(v)).not.toMatch(/sb_secret_[A-Za-z0-9_-]{8,}/);
    expect(JSON.stringify(v)).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
  });
  it("revokes everything from anonymous on every user-owned object", () => {
    for (const t of ["profiles", "saved_clashes", "result_claims"]) {
      expect(SQL, t).toMatch(new RegExp(`revoke all on public\\.${t}[^;]*from anon`));
    }
    expect(SQL).toMatch(/revoke all on public\.career_summary, public\.career_by_mode, public\.career_streak from anon/);
  });
  it("career views run as the caller, so RLS is what isolates one career from another", () => {
    for (const v of ["career_summary", "career_by_mode", "career_streak"]) {
      expect(SQL, v).toMatch(new RegExp(`create or replace view public\\.${v}\\s+with \\(security_invoker = true\\)`));
    }
  });
  it("one result belongs to one account, and one clash is saved once per user", () => {
    expect(SQL).toMatch(/create table if not exists public\.result_claims[\s\S]*result_id\s+text primary key/);
    expect(SQL).toMatch(/constraint saved_clashes_unique_result unique \(user_id, result_id\)/);
  });
  it("stores no email in the profile and no raw seed or key anywhere", () => {
    const tables = COLUMNS_DDL.split("create table").slice(1).join("create table");
    expect(tables).not.toMatch(/\bemail\b/);
    expect(COLUMNS_DDL).not.toMatch(/\b(seed|access_key|preview_key|session_token|password)\b/);
    // The device session is only ever stored as a hash, and the shape is enforced.
    expect(SQL).toMatch(/device_session_hash text not null/);
    expect(SQL).toMatch(/result_claims_hash_shape check \(device_session_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/);
  });
  it("caps and cleans the display name in the database too, not only in the client", () => {
    expect(SQL).toMatch(/profiles_display_name_len check \(char_length\(display_name\) between 1 and 24\)/);
    expect(SQL).toMatch(/profiles_display_name_clean check \(display_name !~ '\[<>\]'\)/);
  });
  it("creates exactly one profile per user on sign-up and never orphans career data", () => {
    expect(SQL).toMatch(/create trigger on_auth_user_created after insert on auth\.users/);
    expect(SQL).toMatch(/on conflict \(user_id\) do nothing/);
    for (const t of ["profiles", "saved_clashes", "result_claims"]) {
      expect(SQL, t).toMatch(new RegExp(`references auth\\.users \\(id\\) on delete cascade`));
    }
  });
});

describe("the authoritative save: nothing is taken from the client", () => {
  it("builds the career row from the record, ignoring anything a client might have sent", () => {
    const row = buildSavedClash({ record: record(), userId: "u-1", claimedFrom: "signed_in" });
    expect(row.gold_score).toBe(112);
    expect(row.blue_score).toBe(104);
    expect(row.outcome).toBe("win");
    expect(row.era_id).toBe("1990s");
    expect(row.candidate_id).toBe("Candidate 4");
    expect(row.calibration_version).toBe("1.4.0");
    expect(row.user_id).toBe("u-1");
    expect(row.result_id).toBe("pv_abc123def4");
    expect(row.mvp).toEqual({ name: "Test Legend", pts: 33 });
    expect(row.gold_roster[0]).toEqual({ id: "g1", name: "Gold One", pos: "PG" });
  });
  it("scores a tie and a loss from the record, never from a `won` claim", () => {
    expect(buildSavedClash({ record: record({ finalScore: { gold: 99, blue: 99 }, won: true }), userId: "u", claimedFrom: "signed_in" }).outcome).toBe("tie");
    expect(buildSavedClash({ record: record({ finalScore: { gold: 90, blue: 101 }, won: true }), userId: "u", claimedFrom: "signed_in" }).outcome).toBe("loss");
  });
  it("keeps the device session out of the snapshot entirely", () => {
    const row = buildSavedClash({ record: record(), userId: "u-1", claimedFrom: "guest_claim" });
    expect(JSON.stringify(row)).not.toContain("a".repeat(48));
    expect(row.result_snapshot.session).toBeUndefined();
    expect(row.result_snapshot.core).toBeTruthy();      // enough to re-render the report
  });
  it("fingerprints a challenge instead of storing its id in the clear", () => {
    const row = buildSavedClash({ record: record(), userId: "u-1", claimedFrom: "signed_in" });
    expect(row.challenge_fingerprint).toBe(sha256("challenge|chal01").slice(0, 32));
    expect(row.challenge_fingerprint).not.toContain("chal01");
    expect(buildSavedClash({ record: record({ challengeId: null }), userId: "u", claimedFrom: "signed_in" }).challenge_fingerprint).toBe(null);
  });
  it("refuses to verify a token, read a result or save anything while unconfigured", async () => {
    expect(await verifyAccountToken("Bearerish.token.value.that.is.long.enough")).toBe(null);
    expect(await claimAndSaveResult({ resultId: "pv_abc123def4", userId: "u-1", deviceSession: "a".repeat(48) })).toEqual({ status: "not_configured" });
    expect(await importDeviceHistory({ candidateIds: ["pv_abc123def4"], userId: "u-1", deviceSession: "a".repeat(48) }))
      .toEqual({ status: "not_configured", imported: 0, results: [] });
  });
  it("only accepts result ids of the authoritative shape, and caps an import list", () => {
    for (const ok of ["pv_abc123def4", "abcdef1234"]) expect(CANDIDATE_ID_SHAPE.test(ok), ok).toBe(true);
    for (const bad of ["../etc", "PV_ABC123", "pv_", "a", "x".repeat(40), "pv_abc 123"]) expect(CANDIDATE_ID_SHAPE.test(bad), bad).toBe(false);
    expect(MAX_IMPORT_CANDIDATES).toBe(25);
  });
  it("counts only the results this device actually produced", async () => {
    const mine = record({ id: "pv_mine123456", session: "m".repeat(48) });
    const theirs = record({ id: "pv_theirs1234", session: "t".repeat(48) });
    const store = new Map([[mine.id, mine], [theirs.id, theirs]]);
    const readOne = (id) => store.get(id) ?? null;
    let eligible = 0;
    for (const id of [mine.id, theirs.id]) {
      const r = await countEligibleForImport({ candidateIds: [id], deviceSession: "m".repeat(48) }, { record: readOne(id) });
      eligible += r.eligible;
    }
    expect(eligible).toBe(1);   // the other device's result is not importable
  });
});

describe("the guest claim, against the same rules the SQL enforces", () => {
  let ctx;
  const GUEST = "g".repeat(48);
  beforeEach(() => {
    ctx = createTestProvider({ users: [{ userId: "u-1", email: "one@example.com" }, { userId: "u-2", email: "two@example.com" }] });
    ctx.server.putResult(record({ id: "pv_guest12345", session: GUEST }));
    _setProvider(ctx.provider);
  });

  it("claims the result the guest just played, once", () => {
    expect(ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-1", deviceSession: GUEST, claimedFrom: "guest_claim" }).status).toBe("saved");
    expect(ctx.db.savedClashes).toHaveLength(1);
    expect(ctx.db.savedClashes[0].user_id).toBe("u-1");
    expect(ctx.db.savedClashes[0].claimed_from).toBe("guest_claim");
  });
  it("a repeated claim creates no duplicate", () => {
    ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-1", deviceSession: GUEST });
    expect(ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-1", deviceSession: GUEST }).status).toBe("already_saved");
    expect(ctx.db.savedClashes).toHaveLength(1);
  });
  it("a second account cannot claim the same result", () => {
    ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-1", deviceSession: GUEST });
    expect(ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-2", deviceSession: GUEST }).status).toBe("already_claimed");
    expect(ctx.db.savedClashes.filter((r) => r.user_id === "u-2")).toHaveLength(0);
  });
  it("a result from another browser is refused even with a valid account", () => {
    expect(ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-1", deviceSession: "z".repeat(48) }).status).toBe("not_your_result");
    expect(ctx.db.savedClashes).toHaveLength(0);
  });
  it("an unknown result id is refused, and an unverifiable token saves nothing", () => {
    expect(ctx.server.claimAndSave({ resultId: "pv_nothere1234", token: "test-token.u-1", deviceSession: GUEST }).status).toBe("not_found");
    expect(ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "forged", deviceSession: GUEST }).status).toBe("not_authenticated");
    expect(ctx.db.savedClashes).toHaveLength(0);
  });
  it("a device import claims only this device's results and is safely repeatable", () => {
    ctx.server.putResult(record({ id: "pv_mine2222aa", session: GUEST, finalScore: { gold: 90, blue: 101 } }));
    ctx.server.putResult(record({ id: "pv_other333bb", session: "o".repeat(48) }));
    const first = ctx.server.importDeviceHistory({ candidateIds: ["pv_guest12345", "pv_mine2222aa", "pv_other333bb", "pv_ghost4444c"], token: "test-token.u-1", deviceSession: GUEST });
    expect(first.imported).toBe(2);
    expect(first.refused).toBe(2);       // one other device, one that does not exist
    const again = ctx.server.importDeviceHistory({ candidateIds: ["pv_guest12345", "pv_mine2222aa"], token: "test-token.u-1", deviceSession: GUEST });
    expect(again.imported).toBe(0);
    expect(again.alreadySaved).toBe(2);
    expect(ctx.db.savedClashes).toHaveLength(2);
  });
});

describe("cross-account isolation and career reads", () => {
  let ctx;
  const A = "a".repeat(48), B = "b".repeat(48);
  beforeEach(() => {
    ctx = createTestProvider({ users: [{ userId: "u-1", email: "one@example.com", displayName: "One" }, { userId: "u-2", email: "two@example.com", displayName: "Two" }] });
    ctx.server.putResult(record({ id: "pv_one11111aa", session: A }));
    ctx.server.putResult(record({ id: "pv_two22222bb", session: B, finalScore: { gold: 88, blue: 99 } }));
    ctx.server.claimAndSave({ resultId: "pv_one11111aa", token: "test-token.u-1", deviceSession: A });
    ctx.server.claimAndSave({ resultId: "pv_two22222bb", token: "test-token.u-2", deviceSession: B });
    _setProvider(ctx.provider);
  });

  it("a signed-in user reads only their own clashes and their own career", async () => {
    ctx.signInAs("u-1");
    expect((await ctx.provider.listSavedClashes()).map((r) => r.result_id)).toEqual(["pv_one11111aa"]);
    expect(await ctx.provider.getSavedClash("pv_two22222bb")).toBe(null);
    const one = await ctx.provider.career();
    expect(one.summary.games_played).toBe(1);
    expect(one.summary.wins).toBe(1);

    ctx.signInAs("u-2");
    expect((await ctx.provider.listSavedClashes()).map((r) => r.result_id)).toEqual(["pv_two22222bb"]);
    expect(await ctx.provider.getSavedClash("pv_one11111aa")).toBe(null);
    const two = await ctx.provider.career();
    expect(two.summary.wins).toBe(0);
    expect(two.summary.losses).toBe(1);
  });
  it("an anonymous caller reads nothing at all", async () => {
    ctx.signOut();
    await expect(ctx.provider.listSavedClashes()).rejects.toThrow("NOT_PERMITTED");
    await expect(ctx.provider.getProfile()).rejects.toThrow("NOT_PERMITTED");
    await expect(ctx.provider.career()).rejects.toThrow("NOT_PERMITTED");
  });
  it("a profile update touches only the caller's own row, cleaned and capped", async () => {
    ctx.signInAs("u-1");
    await ctx.provider.updateDisplayName("  <b>Joseph</b>  ");
    expect(ctx.db.profiles.get("u-1").display_name).not.toMatch(/[<>]/);
    expect(ctx.db.profiles.get("u-2").display_name).toBe("Two");
    await ctx.provider.updateDisplayName("y".repeat(60));
    expect(ctx.db.profiles.get("u-1").display_name.length).toBe(MAX_DISPLAY_NAME);
    await expect(ctx.provider.updateDisplayName("   ")).rejects.toThrow("DISPLAY_NAME_INVALID");
  });
  it("exactly one profile exists per user, and it carries no email", () => {
    expect(ctx.db.profiles.size).toBe(2);
    for (const p of ctx.db.profiles.values()) expect(JSON.stringify(p)).not.toMatch(/@example\.com/);
  });
  it("signing out leaves no private career readable", async () => {
    ctx.signInAs("u-1");
    expect(await ctx.provider.listSavedClashes()).toHaveLength(1);
    await ctx.provider.signOut();
    await expect(ctx.provider.listSavedClashes()).rejects.toThrow("NOT_PERMITTED");
  });
  it("a saved report reopens from its own snapshot, carrying its original candidate", async () => {
    ctx.signInAs("u-1");
    const clash = await ctx.provider.getSavedClash("pv_one11111aa");
    expect(clash.result_snapshot.core).toBeTruthy();
    expect(clash.candidate_id).toBe("Candidate 4");
    expect(clash.calibration_version).toBe("1.4.0");
    expect(clash.result_snapshot.session).toBeUndefined();
  });
});

describe("authentication flows", () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestProvider({ users: [{ userId: "u-1", email: "one@example.com" }] });
    _setProvider(ctx.provider);
  });
  it("an email code signs the right user in, and a wrong code does not", async () => {
    await ctx.provider.sendEmailCode("one@example.com");
    await expect(ctx.provider.verifyEmailCode("one@example.com", "000000")).rejects.toThrow("CODE_INVALID_OR_EXPIRED");
    const s = await ctx.provider.verifyEmailCode("one@example.com", "123456");
    expect(s.userId).toBe("u-1");
    expect(s.accessToken).toBeTruthy();
  });
  it("a malformed email is refused before anything is sent", async () => {
    await expect(ctx.provider.sendEmailCode("not-an-email")).rejects.toThrow("EMAIL_INVALID");
  });
  it("an invalid callback fails safely and signs nobody in", async () => {
    await expect(ctx.provider.exchangeCodeForSession("https://x.invalid/auth/callback?code=nope")).rejects.toThrow("CODE_INVALID_OR_EXPIRED");
    expect(await ctx.provider.currentSession()).toBe(null);
  });
  it("every failure the product shows comes from a closed vocabulary", () => {
    expect(FAILURE_CODES).toContain("CODE_INVALID_OR_EXPIRED");
    expect(FAILURE_CODES).toContain("CLOUD_ACCOUNTS_DISABLED");
    const dialog = src("src/components/accounts/AccountDialog.jsx");
    for (const code of Object.keys({ RATE_LIMITED: 1, CODE_INVALID_OR_EXPIRED: 1, EMAIL_INVALID: 1, NETWORK: 1, PROVIDER_ERROR: 1 })) {
      expect(dialog, code).toContain(code);
    }
  });
});

describe("secrets, tokens and telemetry stay where they belong", () => {
  it("no service-role key is referenced by any browser module", () => {
    const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|css)$/.test(f) ? [p] : []; });
    for (const f of walk("src")) {
      // What must never happen is a browser module READING a service-role
      // credential from the environment. The words themselves are wanted in
      // one place — config.js has to name the role claim in order to detect a
      // secret key and refuse it — so the test asks about the access, not the
      // vocabulary.
      expect(read(f), f).not.toMatch(/env\(\s*["'`][^"'`]*SERVICE[^"'`]*["'`]/i);
      expect(read(f), f).not.toMatch(/import\.meta\.env\.\w*SERVICE/i);
      expect(read(f), f).not.toMatch(/process\.env\.\w*SERVICE/i);
      expect(read(f), f).not.toMatch(/VITE_SUPABASE_SERVICE|VITE_\w*SECRET/i);
    }
  });
  it("the service-role key is read only on the server, and never logged", () => {
    const server = src("api/_lib/cloudAccounts.js");
    expect(server).toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    expect(server).not.toMatch(/console\.(log|info|warn|error)/);
    // The status probe reports booleans, not values.
    // It judges the key by its SHAPE, so a value copied from a masked dashboard
    // field is reported as absent rather than accepted for being long.
    expect(server).toMatch(/serviceRoleConfigured: serviceKeyShapeOk\(serviceKey\(\)\)/);
  });
  it("the account token travels in the Authorization header, not in a URL or a body field", () => {
    const client = src("src/accounts/cloudSave.js");
    expect(client).toMatch(/Authorization: `Bearer \$\{accessToken\}`/);
    expect(client).not.toMatch(/accessToken=|token=|\?.*token/);
    expect(src("api/profile.js")).toMatch(/req\.headers\?\.authorization/);
  });
  it("the callback scrubs the address bar before exchanging the code", () => {
    const cb = src("src/components/accounts/AuthCallback.jsx");
    const scrub = cb.indexOf("history.replaceState");
    const exchange = cb.indexOf("exchangeCodeForSession");
    expect(scrub).toBeGreaterThan(-1);
    expect(scrub).toBeLessThan(exchange);
    expect(cb).toMatch(/safeReturnPath\(params\.get\("next"\)/);
  });
  it("every account event is allowlisted on the server, and none carries identifying data", () => {
    const accountEvents = [
      "account_gate_shown", "account_signup_started", "account_signup_completed",
      "account_signin_started", "account_signin_completed", "account_signout_completed",
      "guest_result_claim_started", "guest_result_claim_completed", "guest_history_imported",
      "cloud_result_save_started", "cloud_result_save_completed", "cloud_result_save_failed",
      "my_eraclash_viewed", "recent_clash_expanded", "saved_report_opened", "display_name_updated",
    ];
    for (const e of accountEvents) {
      expect(ACTIVATION_EVENTS, e).toContain(e);
      expect(EVENTS_ALLOWLIST.has(e), e).toBe(true);
    }
    // Nothing under the account surface tracks an email, a token or a name.
    const files = ["src/accounts/accountState.js", "src/accounts/cloudSave.js", "src/components/accounts/AccountDialog.jsx",
      "src/components/accounts/AuthCallback.jsx", "src/components/accounts/MyEraClash.jsx", "src/components/accounts/SaveThisClash.jsx"];
    for (const f of files) {
      const tracked = [...src(f).matchAll(/track\("([^"]+)",\s*(\{[^}]*\})/g)].map(([, , props]) => props);
      for (const p of tracked) {
        // authMethod: "email" is the allowed closed value; an address is not.
        expect(p, f).not.toMatch(/@|accessToken|access_token|refresh|cookie|token|displayName|password/i);
        expect(p, f).not.toMatch(/\bemail:/i);
      }
    }
  });
  it("a preview tester key is never treated as an account, and never enters career data", () => {
    for (const f of ["src/accounts/provider.js", "src/accounts/accountState.js", "src/accounts/cloudSave.js", "api/_lib/cloudAccounts.js"]) {
      expect(src(f), f).not.toMatch(/previewAccess|pv_session|x-preview-key|PREVIEW_ACCESS/);
    }
    expect(COLUMNS_DDL).not.toMatch(/preview/i);
  });
});

describe("guest play is untouched", () => {
  it("Chaos Clash and the Daily need no capability an account adds", async () => {
    const { can, CAPABILITIES, MATRIX } = await import("../src/entitlements.js");
    expect(can("GUEST", CAPABILITIES.CHAOS_CLASH)).toBe(true);
    expect(can("GUEST", CAPABILITIES.DAILY)).toBe(true);
    expect(MATRIX.GUEST).toEqual([CAPABILITIES.CHAOS_CLASH, CAPABILITIES.DAILY]);
  });
  it("the entitlement matrix is byte-identical to the parent: no mode became paid", () => {
    if (!parentAvailable()) return;
    expect(git(`git diff --name-only ${PARENT} -- src/entitlements.js`)).toBe("");
  });
  it("the lobby, the arena and the draft never import account state", () => {
    for (const f of ["src/components/lobby/PlayLobby.jsx", "src/components/arena/TimeArena.jsx", "src/components/arena/ChaosStage.jsx"]) {
      expect(src(f), f).not.toMatch(/accounts\/(provider|accountState|cloudSave)/);
    }
  });
  it("the conversion panel never blocks the result", () => {
    const panel = src("src/components/accounts/SaveThisClash.jsx");
    expect(panel).not.toMatch(/position: "fixed"|role="dialog"|aria-modal/);
    expect(panel).toMatch(/NOT NOW/);
    // Dismissed for this result, and it does not re-open for the same one.
    expect(panel).toMatch(/shownFor\.current === resultId/);
  });
  it("the remembered result ledger is a candidate list, never proof of ownership", () => {
    const ledger = src("src/accounts/deviceResults.js");
    expect(ledger).toMatch(/localStorage/);
    expect(read("src/accounts/deviceResults.js")).toMatch(/never treated as such|not evidence of ownership/i);
    // The server re-derives ownership for every proposed id.
    expect(src("api/_lib/cloudAccounts.js")).toMatch(/record\.session !== deviceSession/);
  });
});

describe("preservation", () => {
  it("adds no serverless function: twelve routes plus middleware", () => {
    expect(readdirSync("api").filter((f) => f.endsWith(".js")).length).toBe(12);
    expect(existsSync("middleware.js")).toBe(true);
    // The cloud actions live on the existing career route.
    expect(src("api/profile.js")).toMatch(/CLOUD_ACTIONS/);
  });
  it("game, draft, placement and theme code are untouched", () => {
    if (!parentAvailable()) return;
    expect(git(`git diff --name-only ${PARENT} -- src/chaos src/v3 src/engine.js src/rating.js src/players.js src/draft.js src/dailyChallenge.js src/lineupPlacement.js src/theme data/calibration`)).toBe("");
  });
  it("the Play Lobby polish is preserved exactly as accepted", () => {
    if (!parentAvailable()) return;
    expect(git(`git diff --name-only ${PARENT} -- src/components/lobby src/navigation.js`)).toBe("");
  });
  it("the preview access gate and Wave 2 study are untouched", () => {
    if (!parentAvailable()) return;
    expect(git(`git diff --name-only ${PARENT} -- config/ api/_lib/previewAccessCheck.js src/wave2.js api/feedback.js data/validation/9a3`)).toBe("");
  });
  it("the new client-rendered routes are gated and rewritten like every other one", () => {
    const mw = read("middleware.js");
    expect(mw).toMatch(/"\/auth\/:path\*", "\/my-eraclash"/);
    const rewrites = JSON.parse(read("vercel.json")).rewrites.map((r) => r.source);
    expect(rewrites).toContain("/auth/:path*");
    expect(rewrites).toContain("/my-eraclash");
  });
  it("the content policy opens exactly one new destination: the provider's own hosts", () => {
    const csp = JSON.parse(read("vercel.json")).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
    expect(csp).toMatch(/connect-src 'self' https:\/\/\*\.supabase\.co https:\/\/\*\.supabase\.in;/);
    expect(csp).toMatch(/script-src 'self';/);          // no third-party script may run
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });
});
