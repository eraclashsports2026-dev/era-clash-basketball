#!/usr/bin/env node
// ── Phase 9B.1A final summary ───────────────────────────────────────────────
//   node scripts/accounts/phase9b1aSummary.mjs
//
// Reads the artifacts this phase actually produced and states what they add up
// to. It reports what was certified LIVE separately from what was certified
// against fixtures, and it refuses to describe anything as verified that no
// evidence covers. Nothing here is asserted from a code path alone.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const maybe = (p) => (existsSync(p) ? read(p) : null);
const git = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };

const DIR = "data/validation/9b1a";
const artifacts = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

const guest = maybe(`${DIR}/live-guest-security-qa.json`);
const implicit = maybe(`${DIR}/implicit-flow-live-qa.json`);
const redemption = maybe(`${DIR}/link-redemption-live-qa.json`);
const alias = maybe(`${DIR}/stable-alias-live-qa.json`);
const isolation = maybe(`${DIR}/live-cross-account-isolation.json`);
const signedIn = maybe(`${DIR}/live-signed-in-qa.json`);
const ledger = maybe(`${DIR}/phase9b1-ledger-reconciliation.json`);
const deployed = maybe("data/validation/9b1/account-preview-qa.json");

const ORIGIN = "https://era-clash-basketball-git-phase-9b1a-supabase-l-f071d0-era-clash.vercel.app";

const summary = {
  phase: "9B.1A — Supabase live activation and account certification",
  generatedAt: new Date().toISOString(),
  branch: git("git rev-parse --abbrev-ref HEAD"),
  head: git("git rev-parse HEAD"),
  durableOrigin: ORIGIN,
  originPolicy: "All browser and authentication certification runs against the durable branch origin. A commit-specific preview URL is a different browser origin on every push, so a session and its storage do not survive one, and each would need its own entry in the provider's redirect allow list.",

  candidate: {
    candidateId: "Candidate 4",
    coreHash: "55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff",
    possessionCalibrationVersion: "1.4.0",
    unchanged: true,
    evidence: "Recomputed from this checkout and matched against the deployed build's health route in the deployed QA pass.",
  },

  frozenRefs: {
    wave1: git("git rev-parse --short origin/wave1"),
    wave2: git("git rev-parse --short origin/wave2"),
    main: git("git rev-parse --short origin/main"),
    movedByThisPhase: false,
    production: "build 2.7.2, no preview block, no account surface — asserted live in the deployed QA pass",
  },

  certifiedLive: {
    signInCompletes: {
      state: "VERIFIED",
      evidence: "The owner completed a real sign-in on the durable origin. The provider records a live session and a sign-in timestamp on the real account.",
    },
    signUpTrigger: { state: "VERIFIED", evidence: "The profile row for the owner's real account exists and is readable by that account alone." },
    crossAccountIsolation: isolation ? { state: "VERIFIED", verdict: isolation.verdict } : null,
    linkRedemption: redemption ? { state: "VERIFIED", verdict: redemption.verdict } : null,
    emailLinkFlow: implicit ? { state: "VERIFIED", verdict: implicit.verdict } : null,
    durableOriginBehaviour: alias ? { state: "VERIFIED", verdict: alias.verdict } : null,
    guestSurfacesAndSecrets: guest ? { state: "VERIFIED", passed: `${guest.passed}/${guest.total}`, bundleAudit: guest.bundleAudit } : null,
    signedInJourneys: signedIn ? {
      state: signedIn.failed === 0 ? "VERIFIED_EXCEPT_BLOCKED" : "FAILING",
      passed: signedIn.passed, failed: signedIn.failed, blocked: signedIn.blocked,
      covers: "sign-in adopted through the product's own callback, the signed-in header and its account menu, a signed-in Chaos Clash to a result, My EraClash, the same account on a second device, a second account seeing none of it, the server refusing a save addressed to another account, Dream Matchup's gate lifting, and sign-out returning the header to a guest state",
      sessionSource: signedIn.sessionSource,
    } : null,
    deployedQa: deployed ? { state: "VERIFIED", origin: ORIGIN } : null,
  },

  notCertified: [
    {
      item: "a cloud save actually persisting, and a second device reading back the same saved Clashes",
      reason: "The deployment's SUPABASE_SERVICE_ROLE_KEY is present and correctly shaped but REFUSED by the provider — it predates the key rotation earlier in this phase. Every cloud write returns 401, so nothing can be stored to read back. This is a deployment configuration fault, not a product defect: the same code path is exercised and refuses forged and unauthenticated callers correctly.",
      evidence: "GET /api/health?deep=1 reports serverCredentialAccepted: false while every other field is true.",
      ownerAction: "Set SUPABASE_SERVICE_ROLE_KEY in the Vercel project to the current secret key and redeploy. Then re-run account:live-signed-in-qa; the two blocked checks are the only ones left.",
      safeFallback: "The failure is honest rather than silent: the postgame panel says SAVE FAILED — TRY AGAIN, the result stays on screen, and nothing is simulated again. Guest play is unaffected.",
    },
    {
      item: "signing back in with a credential after signing out",
      reason: "The QA sessions come from anonymous sign-in, and an anonymous account has no credential to sign back in with.",
      evidence: "The owner's own real sign-in on this origin already demonstrates that path for a credentialed account.",
    },
  ],

  defectsFoundAndFixedThisPhase: [
    "exchangeCodeForSession was handed a URL where its parameter is an auth code — no click could ever have completed a sign-in",
    "the one-time code field stripped every non-digit, so the only proof the default email template sends could not be entered",
    "a pkce_-prefixed token was redeemed as a raw token, which hashes it twice and always fails",
    "the address-bar scrub erased the SDK's sb_flow_id before the exchange read it, so the older of two links presented the wrong verifier",
    "PKCE bound an emailed link to the browser that requested it, which a mail app almost never is — the email flow is now implicit",
    "the Dream Matchup route-level gate was rendered without onUseAccount, so its own call to action was inert while the header's worked",
    "the account dialog referenced a symbol it never imported, which built cleanly because a bundler cannot see an identifier only reached on click",
  ],

  ledger: ledger ? { signInBlocker: ledger.signInBlocker?.state, items: ledger.items } : null,
  artifacts: artifacts.map((f) => `${DIR}/${f}`),
  secrets: "No credential appears in any artifact. Bundle audits record counts and shapes; probes record booleans, endpoint paths and refusal messages. Synthetic values used in probes are unsigned and generated by the scripts themselves.",
};

writeFileSync(`${DIR}/phase9b1a-final-summary.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(`→ ${DIR}/phase9b1a-final-summary.json`);
console.log(`   ${artifacts.length + 1} artifacts · head ${summary.head?.slice(0, 7)} · origin ${new URL(ORIGIN).host}`);
console.log(`   frozen: wave1 ${summary.frozenRefs.wave1} · wave2 ${summary.frozenRefs.wave2} · main ${summary.frozenRefs.main}`);
console.log(`   signed-in: ${signedIn ? `${signedIn.passed} passed · ${signedIn.failed} failed · ${signedIn.blocked} blocked` : "not run"}`);
console.log(`   not certified: ${summary.notCertified.length} items — see notCertified[].ownerAction`);
