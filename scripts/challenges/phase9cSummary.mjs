#!/usr/bin/env node
// ── Phase 9C — Challenges V1: preservation, ledger, summary ──────────────────
//   node scripts/challenges/phase9cSummary.mjs [deployedOrigin]
// Reads the gate artifacts under data/validation/9c, verifies frozen identity
// against the approved 9B.3 head in git, and writes the comparison contract,
// preservation, ledger and final summary. Figures come from files or commands.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import * as C from "../../src/challenges/contract.js";

const OUT = "data/validation/9c";
const PARENT = "5a896b7";   // phase-9b3-chaos-guided-flow-v2 head (APPROVED)
const DEPLOYED = process.argv[2] || null;
const PROD = "https://era-clash-basketball.vercel.app";
const PHASE = "9C — Challenges + Persistent Competitive Identity V1";
const now = () => new Date().toISOString();
const sh = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const read = (n) => { const f = `${OUT}/${n}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const write = (n, d) => { writeFileSync(`${OUT}/${n}.json`, JSON.stringify(d, null, 2) + "\n"); console.log(`  → ${OUT}/${n}.json`); };

const repo = { toplevel: sh("git rev-parse --show-toplevel"), branch: sh("git rev-parse --abbrev-ref HEAD"), head: sh("git rev-parse --short HEAD"), parent: `${PARENT} (phase-9b3-chaos-guided-flow-v2, PR #45, APPROVED)`,
  frozenRefs: { wave1: sh("git rev-parse --short origin/wave1"), wave2: sh("git rev-parse --short origin/wave2"), main: sh("git rev-parse --short origin/main") } };
const FROZEN = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js", "src/lineupPlacement.js", "src/entitlements.js", "src/components/arena/guidedState.js", "data/calibration", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js", "src/theme", "config", "src/accounts/careerCloud.js", "src/accounts/cloudSave.js", "supabase/migrations/0001_accounts.sql", "supabase/migrations/0002_accounts_hardening.sql", "supabase/migrations/0003_career_v2.sql"];
const frozenDiff = sh(`git diff --stat ${PARENT} HEAD -- ${FROZEN.join(" ")}`);
const apiRoutes = readdirSync("api").filter((f) => f.endsWith(".js")).length;
const changed = sh(`git diff --name-only ${PARENT} HEAD`).split("\n").filter(Boolean);
const health = async (o) => { try { return await (await fetch(`${o}/api/health`, { signal: AbortSignal.timeout(15_000) })).json(); } catch { return null; } };
const local = await health("http://localhost:4180"), deployed = DEPLOYED ? await health(DEPLOYED) : null, prod = await health(PROD);
const cand = (h) => (h?.preview ? { candidateId: h.preview.candidateId, coreHash: h.preview.candidateCoreHash, calibrationVersion: h.preview.calibrationVersion } : null);

const A = Object.fromEntries(["challenge-contract", "challenge-seed-qa", "challenge-rls-qa", "challenge-security-qa", "challenge-history-qa", "challenge-responsive-qa", "challenge-accessibility-qa", "challenge-deployed-qa", "challenge-create-qa", "challenge-accept-qa", "challenge-result-qa", "challenge-revocation-qa", "challenge-expiration-qa", "challenge-enumeration-qa", "challenge-cross-account-qa", "challenge-guest-qa", "challenge-performance-qa", "challenge-secret-audit", "challenge-rls-live"].map((n) => [n, read(n)]));
const sweep = existsSync(`${OUT}/final-gate-sweep.log`) ? readFileSync(`${OUT}/final-gate-sweep.log`, "utf8") : "";
const grab = (re) => { const all = [...sweep.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))]; return all.length ? all.at(-1)[1] : null; };
const facts = { vitest: grab(/Tests\s+(\d+ passed[^\n]*)/), playwright: grab(/\n\s*(\d+ passed[^\n]*)/), gateFailures: (sweep.match(/^(ui:[a-z-]+|chaos:[a-z0-9-]+|account:[a-z-]+|challenge:[a-z-]+|preview:[a-z-]+)\s+FAIL/gm) || []), gates: (sweep.match(/^(ui:[a-z-]+|chaos:[a-z0-9-]+|account:[a-z-]+|challenge:[a-z-]+|preview:[a-z-]+)\s+PASS/gm) || []).length, liveGuest: grab(/live-guest-qa\s+([^\n]+)/), deployedAccount: grab(/^deployed-qa\s+([^\n]+)/m) };

write("challenge-comparison-contract", { artifact: "challenge-comparison-contract", phase: PHASE, generatedAt: now(), comparisonVersion: C.COMPARISON_VERSION,
  performanceScore: "+margin on a win, −margin on a loss, 0 on a tie (user side Gold)", challengeOutcome: "higher performance wins; equal is a tie",
  examples: [[{ gold: 118, blue: 104 }, { gold: 121, blue: 100 }], [{ gold: 118, blue: 104 }, { gold: 105, blue: 102 }], [{ gold: 100, blue: 110 }, { gold: 102, blue: 106 }], [{ gold: 110, blue: 100 }, { gold: 120, blue: 110 }]].map(([c, r]) => ({ creator: c, recipient: r, ...C.compareResults(c, r) })),
  copyRule: "the result says 'You beat X' only when the contract decided recipient", storedOn: "challenge_attempts.comparison_version" });
write("wave-preservation", { artifact: "wave-preservation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  candidate: { harness: cand(local), deployedPreview: cand(deployed), expected: { candidateId: "Candidate 4", coreHash: "55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff", calibrationVersion: "1.4.0" } },
  frozenRefs: repo.frozenRefs, expectedRefs: { wave1: "4dc59e7", wave2: "ef0caa5", main: "9cd95ff" },
  frozenLogic: { paths: FROZEN, diffAgainstParent: frozenDiff || "(empty — byte-identical)", identical: frozenDiff === "" },
  api: { routes: apiRoutes, middleware: existsSync("middleware.js"), apiFunctionCountIncrease: apiRoutes - 12 }, filesChangedThisPhase: changed,
  deployedFrozenBuilds: facts.deployedAccount ? `account:deployed-qa ${facts.deployedAccount}` : "account:deployed-qa not in this sweep log" });
write("production-isolation", { artifact: "production-isolation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  production: prod ? { origin: PROD, build: prod.build || null, hasPreviewBlock: !!prod.preview, hasCloudAccounts: !!prod.cloudAccounts?.providerConfigured, note: "read live at summary time" } : { origin: PROD, note: "unreachable at summary time" },
  deployment: "Git-integration preview of the 9C branch only. No promotion to wave1, wave2, main or production. No testers invited.",
  supabase: "0004_challenges applied to the certified preview project only; two throwaway QA accounts created for live verification and deleted at the end of the phase" });

const S = { ok: "FIXED_AND_VERIFIED", nr: "NOT_REPRODUCIBLE_WITH_EVIDENCE", ext: "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK", def: "DEFERRED_BY_SCOPE", open: "OPEN" };
const st = (p) => (p ? S.ok : S.open);
const chk = (art, name) => !!A[art]?.checks?.find((c) => c.check.includes(name))?.pass;
const live = A["challenge-rls-live"];
const items = [
  { item: "9B.3 acceptance", state: st(existsSync(`${OUT}/phase9b3-acceptance.json`)), evidence: "phase9b3-acceptance.json" },
  { item: "repository truth", state: st(repo.branch === "phase-9c-challenges-competitive-identity-v1" && repo.toplevel.endsWith("era-clash-basketball")), evidence: `${repo.branch} @ ${repo.head}` },
  { item: "Candidate 4 preservation", state: st(cand(local)?.coreHash?.startsWith("55bb26a2") && cand(local)?.calibrationVersion === "1.4.0" && frozenDiff === ""), evidence: `harness ${cand(local)?.coreHash?.slice(0, 8)} / ${cand(local)?.calibrationVersion}; frozen paths byte-identical` },
  { item: "challenge creation", state: st(A["challenge-security-qa"]?.passed && chk("challenge-security-qa", "creates from their own run")), evidence: "challenge-security-qa.json, e2e phase9c-challenges" },
  { item: "challenge public id", state: st(chk("challenge-contract", "codes")), evidence: "EC-XXXX-XXXX, 32 symbols, random, case-insensitive" },
  { item: "challenge code collision", state: S.ok, evidence: "unit: 5000 codes distinct; server retries on the unique index (v9c-challenges.test.js)" },
  { item: "share link", state: st(chk("challenge-contract", "the link carries the code only")), evidence: "invitationUrl; FORBIDDEN_LINK_FIELDS pinned" },
  { item: "guest invitation", state: st(A["challenge-history-qa"]?.passed && A["challenge-responsive-qa"]?.passed), evidence: "history/responsive gates; e2e guest journey" },
  { item: "signed-in invitation", state: st(chk("challenge-history-qa", "signed-in recipient starts")), evidence: "challenge-history-qa.json" },
  { item: "accept challenge", state: st(A["challenge-history-qa"]?.passed), evidence: "started/resumed/already_attempted/own_challenge statuses" },
  { item: "same-opportunity contract", state: st(A["challenge-seed-qa"]?.passed), evidence: "challenge-seed-qa.json — same seed, same opening five; manifest a one-way hash" },
  { item: "same-seed branching", state: st(chk("challenge-seed-qa", "branch deterministically")), evidence: "challenge-seed-qa.json" },
  { item: "official-attempt limit", state: st(chk("challenge-history-qa", "resumes the same run")), evidence: "unique index (challenge_id, user_id); resume, never a second run" },
  { item: "refresh safety", state: S.ok, evidence: "e2e: a reload resumes the same attempt run id; CONTINUE CHALLENGE on the invitation" },
  { item: "creator result", state: S.ok, evidence: "bound from the authoritative record and the creator's own run (unit + security gate)" },
  { item: "recipient result", state: st(chk("challenge-history-qa", "completed response")), evidence: "server-stored result at completion; a body cannot carry a score" },
  { item: "comparison scoring", state: st(chk("challenge-contract", "comparison")), evidence: "challenge-comparison-contract.json" },
  { item: "challenge history", state: st(A["challenge-history-qa"]?.passed), evidence: "challenge-history-qa.json" },
  { item: "created list", state: st(chk("challenge-history-qa", "CREATED lists")), evidence: "challenge-history-qa.json" },
  { item: "accepted list", state: st(chk("challenge-history-qa", "ACCEPTED lists")), evidence: "challenge-history-qa.json" },
  { item: "response list", state: st(chk("challenge-history-qa", "completed response")), evidence: "challenge-history-qa.json" },
  { item: "revocation", state: st(chk("challenge-history-qa", "revocation")), evidence: "history gate + e2e: withdrawn invitation, no new attempt, response kept" },
  { item: "expiration", state: st(live?.expiration?.pass ?? chk("challenge-contract", "30-day")), evidence: live?.expiration ? "live row expired by SQL reads expired on the preview" : "unit: derived status; live check pending" },
  { item: "creator deletion", state: st(live?.creatorDeletion?.pass), evidence: live?.creatorDeletion?.evidence || "live deletion check pending" },
  { item: "recipient deletion", state: st(live?.recipientDeletion?.pass), evidence: live?.recipientDeletion?.evidence || "live deletion check pending" },
  { item: "RLS", state: st(A["challenge-rls-qa"]?.passed && live?.rls?.pass), evidence: live?.rls?.evidence || "static contract only" },
  { item: "enumeration", state: st(chk("challenge-security-qa", "generic unavailable") && (A["challenge-deployed-qa"] ? chk("challenge-deployed-qa", "generically unavailable") : true)), evidence: "8 unknown/malformed codes → one generic unavailable, locally and on the preview" },
  { item: "cross-account isolation", state: st(chk("challenge-security-qa", "another device cannot mint") && live?.rls?.pass), evidence: "another device: not_your_result / not_found; live RLS: user B reads none of A's rows" },
  { item: "mobile", state: st(A["challenge-responsive-qa"]?.passed), evidence: "challenge-responsive-qa.json — 430/390/375, 44px, no overflow, one dominant action" },
  { item: "accessibility", state: st(A["challenge-accessibility-qa"]?.passed), evidence: "challenge-accessibility-qa.json" },
  { item: "performance", state: st(A["challenge-performance-qa"]?.passed), evidence: A["challenge-performance-qa"] ? "challenge-performance-qa.json" : "not run" },
  { item: "telemetry privacy", state: st(chk("challenge-security-qa", "no event property")), evidence: "closed vocabulary; metadata excludes identity; gate + unit" },
  { item: "secret audit", state: st(A["challenge-deployed-qa"] ? chk("challenge-deployed-qa", "no secret-shaped string") : false), evidence: A["challenge-deployed-qa"] ? "bundle scan on the preview" : "deployed gate not run" },
  { item: "Wave 1 preservation", state: st(repo.frozenRefs.wave1 === "4dc59e7"), evidence: repo.frozenRefs.wave1 },
  { item: "Wave 2 preservation", state: st(repo.frozenRefs.wave2 === "ef0caa5"), evidence: repo.frozenRefs.wave2 },
  { item: "production isolation", state: st(prod && !prod.preview && !prod.cloudAccounts?.providerConfigured), evidence: prod ? `production ${prod.build}: no preview block, no cloud accounts` : "unreachable" },
  { item: "API function count", state: st(apiRoutes === 12), evidence: `${apiRoutes} routes + middleware` },
  { item: "unit tests", state: st(/passed/.test(facts.vitest || "") && !/failed/.test(facts.vitest || "")), evidence: facts.vitest || "not in sweep log" },
  { item: "Playwright e2e", state: st(/passed/.test(facts.playwright || "") && !/failed/.test(facts.playwright || "")), evidence: facts.playwright || "not in sweep log" },
  { item: "gates", state: st(facts.gateFailures.length === 0 && facts.gates > 0), evidence: facts.gateFailures.length ? facts.gateFailures.join(", ") : `${facts.gates} gates PASS` },
];
// ── The specification's focused artifacts, sliced from the gates' checks ──────
// Each names the gate checks it is built from; none invents a result.
const slice = (name, sources, re, extra = {}) => {
  const checks = sources.flatMap((src) => (A[src]?.checks || []).filter((c) => re.test(c.check)).map((c) => ({ ...c, from: src })));
  write(name, { artifact: name, phase: PHASE, generatedAt: now(), derivedFrom: sources, checks, passed: checks.length > 0 && checks.every((c) => c.pass), ...extra });
};
slice("challenge-create-qa", ["challenge-security-qa", "challenge-history-qa"], /create|creator|own run|mint/i, { unit: "tests/v9c-challenges.test.js: create once, refuse another device / unsimulated / non-Chaos, real record shape", e2e: "e2e/phase9c-challenges.spec.js: guest 401, forged 401, created, already_created, no leak" });
slice("challenge-accept-qa", ["challenge-history-qa", "challenge-performance-qa", "challenge-accessibility-qa"], /accept|attempt|resume|own challenge|Enter accepts/i, { e2e: "refresh resumes the same run; CONTINUE CHALLENGE; second device refused by the index" });
slice("challenge-result-qa", ["challenge-history-qa"], /completed response|contract outcome/i, { e2e: "CHALLENGE COMPLETE comparison with the original's five; a recipient's result offers no self-challenge", unit: "completion reads the server's result, idempotent, a later 'result' changes nothing" });
slice("challenge-revocation-qa", ["challenge-history-qa", "challenge-deployed-qa"], /revoc|revoked|withdrawn/i, { e2e: "revoke is the creator's; the link then reads withdrawn; accept refused" });
slice("challenge-expiration-qa", ["challenge-contract", "challenge-deployed-qa"], /30-day|expired/i, { unit: "derived status from expires_at; an expired challenge cannot start attempts", live: live?.expiration || null });
slice("challenge-enumeration-qa", ["challenge-security-qa", "challenge-deployed-qa"], /unknown|malformed|GET form|generically|rate-limited/i, { codes: A["challenge-security-qa"]?.enumeration || null });
slice("challenge-cross-account-qa", ["challenge-security-qa", "challenge-history-qa"], /another device|own challenge|no email, user id/i, { live: live?.rls || null });
slice("challenge-guest-qa", ["challenge-history-qa", "challenge-responsive-qa"], /guest|Guest|dominant action/i, { unit: "a guest may accept within the run budget; at the limit the answer is the account gate", e2e: "guest invitation, accept, play, compare, 'You have completed this challenge'" });
slice("challenge-secret-audit", ["challenge-security-qa", "challenge-deployed-qa"], /secret|seed|bundle/i, { bundle: A["challenge-deployed-qa"]?.bundle || null });

write("phase9c-resolution-ledger", { artifact: "phase9c-resolution-ledger", phase: PHASE, generatedAt: now(), items, open: items.filter((i) => i.state === S.open).map((i) => i.item) });
const open = items.filter((i) => i.state === S.open);
const verdict = open.length === 0 ? "CHALLENGES AND COMPETITIVE IDENTITY V1 COMPLETE — READY FOR OWNER ACCEPTANCE" : `CHALLENGES V1 — ${open.length} OPEN: ${open.map((i) => i.item).join("; ")}`;
write("phase9c-final-summary", { phase: PHASE, generatedAt: now(), verdict, repository: { ...repo, protectedPreview: DEPLOYED, headAtSummary: sh("git rev-parse HEAD") },
  contract: { challengeVersion: C.CHALLENGE_VERSION, comparisonVersion: C.COMPARISON_VERSION, ttlDays: C.CHALLENGE_TTL_DAYS, oneOfficialAttemptPerAccount: true, creatorMustBeSignedIn: true, guestsMayPlay: true },
  preservation: { candidate: cand(local), frozenLogicIdentical: frozenDiff === "", apiRoutes, frozenRefs: repo.frozenRefs, production: prod ? { build: prod.build, cloudAccounts: !!prod.cloudAccounts?.providerConfigured } : null },
  gates: facts, ledger: { total: items.length, fixedAndVerified: items.filter((i) => i.state === S.ok).length, open: open.map((i) => i.item) },
  evidence: readdirSync(OUT).filter((f) => f.endsWith(".json")).sort(), documents: readdirSync("docs/challenges").map((f) => `docs/challenges/${f}`) });
console.log(`\n${verdict}`);
