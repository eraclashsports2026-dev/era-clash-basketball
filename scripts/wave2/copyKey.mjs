#!/usr/bin/env node
// Copy ONE Wave 2 access key to the clipboard.
//   npm run preview:wave2-copy-key                  → the owner key
//   npm run preview:wave2-copy-key -- wave2-new-01  → a specific tester
//
// Prints the tester id, role, cohort and a four-character fingerprint — never
// the key — so it cannot leak into a terminal transcript, a log, a screenshot
// or a chat window. Paste it straight where it is needed.
//
// The Wave 1 twin is scripts/preview/copyKey.mjs. They are deliberately
// separate: the two waves have separate credential pools, and a Wave 1 key must
// never open Wave 2.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SECRETS = new URL("../../.preview-secrets/wave2-access-keys.json", import.meta.url);
const asked = process.argv[2];

let doc;
try { doc = JSON.parse(readFileSync(SECRETS, "utf8")); }
catch {
  console.error(`no key file at ${SECRETS.pathname}`);
  console.error("Wave 2 keys are generated once and never regenerated while testers hold them.");
  process.exit(1);
}

const ids = doc.keys.map((k) => k.testerId);
// No argument means the owner: that is the key wanted most often.
const hit = asked ? doc.keys.find((k) => k.testerId === asked) : doc.keys.find((k) => k.role === "owner");
if (!hit) {
  console.error(`unknown testerId "${asked}"`);
  console.error(`available: ${ids.join(", ")}`);
  process.exit(1);
}

try { execSync("pbcopy", { input: hit.key }); }
catch {
  console.error("clipboard unavailable (pbcopy failed). The key is in .preview-secrets/wave2-invites.txt,");
  console.error("which you can open directly — it is 0600 and gitignored.");
  process.exit(1);
}

console.log(`✓ ${hit.testerId} (${hit.role}${hit.cohort ? `, ${hit.cohort}` : ""}, key version ${hit.keyVersion}, fingerprint …${hit.sha256.slice(-4)}) copied to clipboard`);
console.log("  Not shown here on purpose. Paste it into the access-key field on the preview.");
