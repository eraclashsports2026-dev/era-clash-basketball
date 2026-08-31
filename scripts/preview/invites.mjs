// Write the whole Wave 1 invite set for one build, ready to paste into email.
//   npm run preview:wave1-invites -- https://era-clash-basketball-xxxx-era-clash.vercel.app
// One block per person, each carrying that person's own key, plus the owner's
// block last. The file is written 0600 into .preview-secrets/ (gitignored) and
// the keys are NEVER printed to the terminal — only the path is.
import { readFileSync, writeFileSync, chmodSync } from "node:fs";

// The stable Wave 1 alias is the address testers keep. A per-commit deployment
// URL can still be passed explicitly when a build needs to be pinned.
const ALIAS = "https://era-clash-basketball-git-wave1-era-clash.vercel.app";
const BASE = (process.argv[2] || process.env.PREVIEW_BASE_URL || ALIAS).replace(/\/$/, "");
if (!/^https:\/\/[^\s]+$/.test(BASE)) {
  console.error("usage: npm run preview:wave1-invites -- [https://deployment-url]");
  process.exit(2);
}
const SECRETS = new URL("../../.preview-secrets/wave1-access-keys.json", import.meta.url);
const OUT = new URL("../../.preview-secrets/wave1-invites.txt", import.meta.url);

let doc;
try { doc = JSON.parse(readFileSync(SECRETS, "utf8")); }
catch { console.error(`no key file at ${SECRETS.pathname}`); process.exit(1); }

const testers = doc.keys.filter((k) => k.role !== "owner");
const owner = doc.keys.find((k) => k.role === "owner");

const invite = (k, n) => `INVITE ${n} (${k.testerId})
------------------------------------------------------------
You're invited to try EraClash Basketball — a private preview.

Just click this link (it signs you in automatically, good for 7 days):
${BASE}/?pv=${k.key}

If you're ever asked for an access code, yours is:
${k.key}

Works on phone or computer, nothing to install. Please don't forward
the link — it's personal to you.
`;

const body = [
  `EraClash Basketball — Wave 1 invites`,
  `build: ${BASE}`,
  `generated: ${new Date().toISOString().slice(0, 10)}`,
  ``,
  `Send ONE block per person. Each link carries that person's own key, which is`,
  `how a single tester can be cut off without disturbing anyone else.`,
  ``,
  ...testers.map((k, i) => invite(k, i + 1)),
  owner ? `OWNER — DO NOT SEND TO ANYONE
------------------------------------------------------------
${BASE}/?pv=${owner.key}

Access code, for signing in on a second device or browser:
${owner.key}
` : "",
].join("\n");

writeFileSync(OUT, body);
chmodSync(OUT, 0o600);
console.log(`✓ ${testers.length} tester invites + owner link written to .preview-secrets/wave1-invites.txt (0600)`);
console.log(`  build: ${BASE}`);
console.log("  The file holds raw keys: never commit it, never post a link publicly.");
