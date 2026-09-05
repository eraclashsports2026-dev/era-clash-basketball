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
  serverKeyRejected, serviceKeyAccepted, serviceKeyProbe, serviceKeyIntegrity,
} from "../api/_lib/cloudAccounts.js";
import { readProof, isBrowserBound, redemptionPlan, redeem, VIA } from "../src/accounts/linkProof.js";
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

// ── Redeeming what the email actually sent ───────────────────────────────────
// This block exists because of a defect I shipped: the callback handed a whole
// URL to exchangeCodeForSession, whose parameter is a code. It could never have
// produced a session, and no test noticed, because every test built its own
// happy path instead of reading the SDK's signature. So these pin the
// signature and the argument, not only the behaviour.
describe("redeeming an email link", () => {
  const REF = "https://lfybiphmqkiecfrqsfzt.supabase.co";
  const vias = (raw) => redemptionPlan(raw).map((a) => a.via);

  it("a typed one-time code is a one-time code, and nothing else is tried", () => {
    expect(redemptionPlan("123456")).toEqual([{ via: VIA.OTP, value: "123456", type: null }]);
    expect(vias(" 12345678 ")).toEqual([VIA.OTP]);
  });

  it("with PKCE on, a magic link's token is a DIGEST and is redeemed as one", () => {
    // The trap: flowType "pkce" turns ?token= into a pkce_-prefixed digest.
    // Redeeming that as a raw token hashes it twice and always fails, so the
    // digest call has to come first — and the raw reading stays as a fallback
    // for a project with PKCE off.
    const plan = redemptionPlan(`${REF}/auth/v1/verify?token=pkce_abcdef0123456789&type=magiclink&redirect_to=https://x.vercel.app/auth/callback`);
    expect(plan.map((a) => a.via)).toEqual([VIA.TOKEN_HASH, VIA.OTP]);
    expect(plan[0]).toEqual({ via: VIA.TOKEN_HASH, value: "pkce_abcdef0123456789", type: "magiclink" });
  });

  it("without PKCE, the same parameter is a raw token and is tried that way first", () => {
    const plan = redemptionPlan(`${REF}/auth/v1/verify?token=abc123XYZ&type=magiclink&redirect_to=https://x.vercel.app/`);
    expect(plan.map((a) => a.via)).toEqual([VIA.OTP, VIA.TOKEN_HASH]);
    expect(plan[0].value).toBe("abc123XYZ");
  });

  it("the untouched link out of the email is portable either way", () => {
    for (const t of ["pkce_abcdef0123456789", "abc123XYZ"]) {
      const p = readProof(`${REF}/auth/v1/verify?token=${t}&type=magiclink`);
      expect(isBrowserBound(p)).toBe(false);
    }
  });

  it("what is left in a failed address bar is a PKCE code, and is browser-bound", () => {
    // Exactly the URL the owner's Safari could not load: the provider had
    // already consumed the token and redirected with a code.
    const plan = redemptionPlan("http://localhost:3000/?code=e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4");
    expect(plan).toEqual([{ via: VIA.CODE, value: "e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4", type: null, flowId: null }]);
    expect(isBrowserBound(plan[0])).toBe(true);
  });

  it("a portable proof is never downgraded to a browser-bound one", () => {
    const plan = redemptionPlan("https://x.vercel.app/auth/callback?token_hash=deadbeef00&code=e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4&type=email");
    expect(plan.map((a) => a.via)).not.toContain(VIA.CODE);
    expect(plan[0].via).toBe(VIA.TOKEN_HASH);
  });

  it("bare values are told apart by shape", () => {
    expect(vias("e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4")).toEqual([VIA.CODE]);
    expect(vias("pkce_9f2c1a")).toEqual([VIA.TOKEN_HASH, VIA.OTP]);
    expect(vias("0123456789abcdef".repeat(4))).toEqual([VIA.TOKEN_HASH, VIA.OTP]);
  });

  it("a session in the fragment is adopted directly, and outranks every proof", () => {
    // The product asks the provider for this shape now. There is nothing to
    // redeem: no round trip, no verifier, no address — so it cannot fail for a
    // reason anyone would have to explain, and it works on any device.
    const plan = redemptionPlan("https://x.vercel.app/auth/callback#access_token=aaa.bbb.ccc&refresh_token=rrr&token_type=bearer&type=magiclink");
    expect(plan).toEqual([{ via: VIA.SESSION, value: "aaa.bbb.ccc", refreshToken: "rrr", type: "magiclink" }]);
  });

  it("a fragment session beats a code in the same URL", () => {
    const plan = redemptionPlan("https://x.vercel.app/auth/callback?code=e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4#access_token=aaa&refresh_token=rrr");
    expect(plan.map((a) => a.via)).toEqual([VIA.SESSION]);
  });

  it("half a session is not a session", () => {
    expect(redemptionPlan("https://x.vercel.app/auth/callback#access_token=aaa")).toEqual([]);
    expect(redemptionPlan("https://x.vercel.app/auth/callback#refresh_token=rrr")).toEqual([]);
  });

  it("both tokens reach setSession, in the right order", async () => {
    const seen = [];
    const out = await redeem("https://x.vercel.app/auth/callback#access_token=aaa.bbb.ccc&refresh_token=rrr", {
      setSession: (a, r) => { seen.push([a, r]); return { ok: true }; },
      verifyEmailCode: () => null, verifyTokenHash: () => null, exchangeCodeForSession: () => null,
    });
    expect(seen).toEqual([["aaa.bbb.ccc", "rrr"]]);
    expect(out).toEqual({ ok: true });
  });

  it("a caller that cannot adopt a session is not handed one", async () => {
    // The dialog and the callback both inject setSession, but redeem must not
    // assume it: a missing adopter should skip the attempt, not throw.
    let calls = 0;
    const out = await redeem("https://x.vercel.app/auth/callback#access_token=aaa&refresh_token=rrr", {
      verifyEmailCode: () => { calls += 1; }, verifyTokenHash: () => { calls += 1; }, exchangeCodeForSession: () => { calls += 1; },
    });
    expect(out).toBeNull();
    expect(calls).toBe(0);
  });

  it("no token is ever handed to telemetry", () => {
    // Adopting a session must not turn into a logged credential.
    for (const f of ["src/components/accounts/AuthCallback.jsx", "src/components/accounts/AccountDialog.jsx"]) {
      const t = src(f);
      const tracks = [...t.matchAll(/track\([^)]*\)/g)].map((m) => m[0]).join(" ");
      // e.code is a closed failure vocabulary, not a credential — what must
      // never appear is a token, a pasted value or a proof.
      expect(tracks, f).not.toMatch(/access_token|refresh_token|accessToken|refreshToken|proof\.value|attempt\.value|session\.accessToken|\bsetCode\b|\bcode:\s/);
    }
  });

  it("the flow id travels with the code, so the right verifier is used", () => {
    // The SDK appends sb_flow_id to the redirect it asks for, and keeps each
    // flow's verifier in a slot named after it. Lose the id and the lookup
    // falls back to one fixed key holding only the newest flow — which makes
    // clicking the older of two links burn a code that was perfectly good.
    const plan = redemptionPlan("https://x.vercel.app/auth/callback?sb_flow_id=0123456789abcdef0123456789abcdef&code=e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4");
    expect(plan).toEqual([{ via: VIA.CODE, value: "e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4", type: null, flowId: "0123456789abcdef0123456789abcdef" }]);
  });

  it("a missing or malformed flow id falls back rather than failing", () => {
    expect(redemptionPlan("http://localhost:3000/?code=e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4")[0].flowId).toBeNull();
    expect(redemptionPlan("https://x/auth/callback?sb_flow_id=nope&code=e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4")[0].flowId).toBeNull();
  });

  it("the flow id reaches the exchange, not just the plan", async () => {
    const seen = [];
    await redeem("https://x.vercel.app/auth/callback?sb_flow_id=0123456789abcdef0123456789abcdef&code=e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4", {
      exchangeCodeForSession: (v, flowId) => { seen.push([v, flowId]); return { ok: true }; },
      verifyTokenHash: () => null, verifyEmailCode: () => null,
    });
    expect(seen).toEqual([["e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4", "0123456789abcdef0123456789abcdef"]]);
  });

  it("the callback reads the URL before it scrubs the address bar", () => {
    // Order, not presence. Scrubbing first would silently drop the flow id.
    const t = src("src/components/accounts/AuthCallback.jsx");
    const read = t.indexOf("const url = window.location.href");
    const scrub = t.indexOf("window.history.replaceState");
    expect(read).toBeGreaterThan(-1);
    expect(scrub).toBeGreaterThan(-1);
    expect(read).toBeLessThan(scrub);
  });

  it("the provider names the flow when it has one, and omits it when it does not", () => {
    const t = src("src/accounts/provider.js");
    expect(t).toMatch(/exchangeCodeForSession\(code, flowId \? \{ flowId \} : undefined\)/);
  });

  it("nothing usable produces nothing, rather than a request built on a guess", () => {
    for (const bad of ["", null, "   ", "https://x.vercel.app/auth/callback?next=/play"]) {
      expect(redemptionPlan(bad), String(bad)).toEqual([]);
      expect(readProof(bad)).toBeNull();
    }
  });

  it("angle brackets from a copied mail-client link are stripped", () => {
    expect(readProof("<https://x.vercel.app/c?token_hash=abc123def>").value).toBe("abc123def");
  });

  it("the SDK's exchange really does take a code, not a URL", () => {
    // The defect in one line. If a future SDK changes this parameter, this
    // fails and the callback gets looked at instead of silently breaking.
    const dts = "node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts";
    if (!existsSync(dts)) return;
    expect(read(dts)).toMatch(/exchangeCodeForSession\(authCode: string/);
  });

  it("the exchange is handed a code, never the URL it came in", async () => {
    // The original defect, now caught by behaviour rather than by reading the
    // source: a URL reaching exchangeCodeForSession can never succeed.
    const seen = [];
    await redeem("http://localhost:3000/?code=e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4", {
      exchangeCodeForSession: (v) => { seen.push(v); return { ok: true }; },
      verifyTokenHash: () => null, verifyEmailCode: () => null,
    });
    expect(seen).toEqual(["e0c581d9-f03d-48ef-9ec4-ad7fd8a2ddd4"]);
    expect(seen[0]).not.toMatch(/^https?:|[?#]/);
  });

  it("the paste field keeps what was pasted", () => {
    // It used to strip every non-digit, so a link or a UUID code could not be
    // entered at all — the field silently ate the only proof on offer.
    const t = src("src/components/accounts/AccountDialog.jsx");
    expect(t).not.toMatch(/setCode\(e\.target\.value\.replace/);
    expect(t).toMatch(/onChange=\{\(e\) => setCode\(e\.target\.value\)\}/);
    expect(t).toMatch(/maxLength=\{400\}/);
  });

  it("a later attempt failing never masks the reason the first one failed", async () => {
    const boom = (code) => () => { throw Object.assign(new Error(code), { code }); };
    await expect(redeem("https://x.supabase.co/auth/v1/verify?token=pkce_abcdef0123456789&type=magiclink", {
      email: "a@b.co",
      verifyTokenHash: boom("CODE_INVALID_OR_EXPIRED"),
      verifyEmailCode: boom("RATE_LIMITED"),
      exchangeCodeForSession: boom("PROVIDER_ERROR"),
    })).rejects.toMatchObject({ code: "CODE_INVALID_OR_EXPIRED" });
  });

  it("the second reading of the same proof is really tried when the first fails", async () => {
    // A project with PKCE off puts a RAW token in ?token=. The digest call is
    // tried first and fails; the raw reading behind it has to succeed, or a
    // correct link would be rejected.
    const tried = [];
    const session = await redeem("https://x.supabase.co/auth/v1/verify?token=" + "0123456789abcdef".repeat(4) + "&type=magiclink", {
      email: "a@b.co",
      verifyTokenHash: () => { tried.push("tokenHash"); throw Object.assign(new Error("CODE_INVALID_OR_EXPIRED"), { code: "CODE_INVALID_OR_EXPIRED" }); },
      verifyEmailCode: (addr, v, t) => { tried.push(`otp:${addr}:${t}`); return { ok: true }; },
      exchangeCodeForSession: () => { tried.push("code"); return null; },
    });
    expect(session).toEqual({ ok: true });
    expect(tried).toEqual(["tokenHash", "otp:a@b.co:magiclink"]);
  });

  it("a plan with nothing usable makes no request at all", async () => {
    let calls = 0;
    const count = () => { calls += 1; return { ok: true }; };
    const out = await redeem("https://x.vercel.app/auth/callback?next=/play", {
      email: "a@b.co", verifyEmailCode: count, verifyTokenHash: count, exchangeCodeForSession: count,
    });
    expect(out).toBeNull();
    expect(calls).toBe(0);
  });

  it("without an address, the attempts that need one are skipped, not guessed", async () => {
    // This is the callback's situation: it has a URL and no idea whose it is.
    const tried = [];
    const out = await redeem("https://x.supabase.co/auth/v1/verify?token=pkce_abcdef0123456789&type=magiclink", {
      verifyTokenHash: () => { tried.push("tokenHash"); return null; },
      verifyEmailCode: () => { tried.push("otp"); return { ok: true }; },
      exchangeCodeForSession: () => { tried.push("code"); return null; },
    });
    expect(tried).toEqual(["tokenHash"]);
    expect(out).toBeNull();
    expect(src("src/components/accounts/AuthCallback.jsx")).not.toMatch(/verifyEmailCode/);
  });

  it("every symbol these files use from the reader is actually imported", () => {
    // A dropped import is invisible to the bundler and only fails when someone
    // clicks. That happened here: the dialog referenced redemptionPlan with no
    // import and still built cleanly.
    const exported = ["redemptionPlan", "readProof", "redeem", "isBrowserBound", "VIA"];
    for (const f of ["src/components/accounts/AuthCallback.jsx", "src/components/accounts/AccountDialog.jsx", "src/accounts/provider.js"]) {
      const t = src(f);
      expect(t, f).toContain("linkProof.js");
      const imported = [...t.matchAll(/import\s*\{([^}]*)\}\s*from\s*"[^"]*linkProof\.js"/g)]
        .flatMap((m) => m[1].split(",").map((x) => x.trim()));
      for (const sym of exported) {
        if (new RegExp(`\\b${sym}\\b`).test(t.replace(/import[^;]*linkProof\.js";/g, ""))) {
          expect(imported, `${f} uses ${sym}`).toContain(sym);
        }
      }
    }
  });

  it("every account gate's own call to action actually opens the dialog", () => {
    // This bug shipped twice. The header's Create free account called setGate,
    // which never renders on the lobby route, so the click did nothing. Then
    // the route-level Dream Matchup gate was rendered without onUseAccount, so
    // its primary button did nothing either while the header's still worked.
    // The gate is the conversion path for the mode someone is trying to enter,
    // so a dead button there is worse than no button.
    const app = src("src/App.jsx");
    const renders = [...app.matchAll(/<AccountGate\b[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(renders.length).toBeGreaterThan(0);
    for (const [i, r] of renders.entries()) {
      expect(r, `AccountGate render #${i + 1} has no onUseAccount`).toMatch(/onUseAccount=\{/);
      expect(r, `AccountGate render #${i + 1} has no way back`).toMatch(/onBack=\{/);
    }
    // And the component must actually call what it is given.
    expect(src("src/components/chaos/AccountGate.jsx")).toMatch(/onUseAccount\?\.\(\)/);
  });

  it("no copy promises a code the default template does not send", () => {
    // Supabase's stock templates render only the confirmation URL. Telling
    // someone to "enter the 6-digit code" when no code was sent is the failure
    // this asserts against.
    for (const f of ["src/components/accounts/AccountDialog.jsx", "src/components/accounts/AuthCallback.jsx"]) {
      expect(read(f), f).not.toMatch(/6[- ]digit/i);
      expect(read(f), f).not.toMatch(/type the code from the (message|email)/i);
    }
  });
});

// ── When the provider refuses OUR credential ────────────────────────────────
// A revoked service-role key is correctly shaped, so every static check kept
// reporting cloud accounts ready while every save failed with a 401. Nothing
// surfaced it until a real game was played and saved on the deployment. The
// point of these is that the failure now names itself and can be probed.
describe("a rejected server credential", () => {
  const configured = () => {
    vi.stubEnv("SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "A".repeat(32));
    vi.stubEnv("SUPABASE_ANON_KEY", "sb_publishable_" + "B".repeat(32));
    vi.stubEnv("CLOUD_ACCOUNTS_ENABLED", "true");
  };
  const GUEST = "d".repeat(48);

  it("401 and 403 are the provider refusing us; other failures are not", () => {
    expect(serverKeyRejected(401)).toBe(true);
    expect(serverKeyRejected(403)).toBe(true);
    for (const s of [200, 201, 400, 404, 409, 429, 500, 502]) expect(serverKeyRejected(s), String(s)).toBe(false);
  });

  it("a save refused at 401 says so, instead of inviting a retry that cannot work", async () => {
    configured();
    const out = await claimAndSaveResult(
      { resultId: "pv_abc123def4", userId: "u-1", deviceSession: GUEST },
      { record: record({ session: GUEST }), fetch: async () => new Response("", { status: 401 }) },
    );
    expect(out).toEqual({ status: "save_failed", detail: "provider_rejected_server_key" });
    vi.unstubAllEnvs();
  });

  it("an ordinary failure keeps its own status code, so the two stay distinguishable", async () => {
    configured();
    const out = await claimAndSaveResult(
      { resultId: "pv_abc123def4", userId: "u-1", deviceSession: GUEST },
      { record: record({ session: GUEST }), fetch: async () => new Response("", { status: 500 }) },
    );
    expect(out.status).toBe("save_failed");
    expect(out.detail).toMatch(/_http_500$/);
    vi.unstubAllEnvs();
  });

  it("the credential can be probed for acceptance, and answers with a boolean", async () => {
    configured();
    expect(await serviceKeyAccepted(async () => new Response("[]", { status: 200 }))).toBe(true);
    expect(await serviceKeyAccepted(async () => new Response("", { status: 401 }))).toBe(false);
    expect(await serviceKeyAccepted(async () => { throw new Error("network"); })).toBe(false);
    vi.unstubAllEnvs();
    // With nothing configured there is nothing to accept.
    expect(await serviceKeyAccepted(async () => new Response("[]", { status: 200 }))).toBe(false);
  });

  it("the probe shows its working: status and code, never the key", async () => {
    configured();
    const p401 = await serviceKeyProbe(async () => new Response(JSON.stringify({ code: "PGRST301" }), { status: 401 }));
    expect(p401.accepted).toBe(false);
    expect(p401.status).toBe(401);
    expect(p401.code).toBe("PGRST301");
    expect(p401.tried).toHaveLength(3);          // every combination was tried
    const p404 = await serviceKeyProbe(async () => new Response("", { status: 404 }));
    expect(p404.accepted).toBe(true);            // not the credential's fault
    // A provider that refuses the Bearer form but accepts apikey alone is the
    // case this exists to find, and it must be reported as ACCEPTED.
    let n = 0;
    const picky = await serviceKeyProbe(async (u, init) => {
      n += 1;
      return init.headers.authorization ? new Response("", { status: 401 }) : new Response("[]", { status: 200 });
    });
    expect(picky.accepted).toBe(true);
    expect(picky.variant).toBe("apikey-only");
    for (const p of [p401, p404, picky]) expect(JSON.stringify(p)).not.toMatch(/sb_secret|sb_publishable|eyJ/);
    vi.unstubAllEnvs();
  });

  it("the integrity report describes the value without revealing it", () => {
    const good = "sb_secret_" + "A".repeat(32);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", good);
    let r = serviceKeyIntegrity();
    expect(r).toMatchObject({ length: good.length, charsetOk: true, hadSurroundingWhitespace: false, hasQuotes: false, kind: "sb_secret" });
    // A fingerprint that identifies without revealing: short, one-way, and
    // different for a different key.
    expect(r.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "B".repeat(32));
    expect(serviceKeyIntegrity().fingerprint).not.toBe(r.fingerprint);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", good);
    // The failures that pass every shape check and still get a 401.
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", `"${good}"`);
    r = serviceKeyIntegrity();
    expect(r.hasQuotes).toBe(true);
    expect(r.charsetOk).toBe(false);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", ` ${good}\n`);
    expect(serviceKeyIntegrity().hadSurroundingWhitespace).toBe(true);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", good + ",");
    expect(serviceKeyIntegrity().charsetOk).toBe(false);
    for (const v of [good, `"${good}"`, good + ","]) {
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", v);
      expect(JSON.stringify(serviceKeyIntegrity())).not.toContain("A".repeat(8));
    }
    vi.unstubAllEnvs();
  });

  it("nothing the probe returns can contain the key", async () => {
    // Asserting on the source text is the wrong instrument: the function has to
    // put the key in a header, so "the word key does not appear" would fail for
    // the right code. What matters is what comes back.
    configured();
    const secret = "sb_secret_" + "A".repeat(32);
    for (const status of [200, 401, 403, 500]) {
      const p = await serviceKeyProbe(async () => new Response(JSON.stringify({ code: "X" }), { status }));
      const dump = JSON.stringify(p);
      expect(dump, `status ${status}`).not.toContain(secret);
      expect(dump, `status ${status}`).not.toMatch(/sb_secret|sb_publishable|eyJ[A-Za-z0-9_-]{10,}/);
    }
    expect(String(serviceKeyProbe)).not.toMatch(/console\./);
    vi.unstubAllEnvs();
  });

  it("health reports cloud readiness as booleans, and only probes when asked", () => {
    const h = src("api/health.js");
    expect(h).toMatch(/cloudAccounts: cloud/);
    expect(h).toMatch(/req\.query\?\.deep === "1"/);
    // The round trip must not happen on every health call.
    // And the payload must keep clear of the word the server test forbids.
    expect(h).toMatch(/serverCredentialAccepted = probe\.accepted/);
    expect(h).toMatch(/serverCredentialProbeStatus = probe\.status/);
  });
});
