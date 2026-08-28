// Copy ONE Wave 1 access key to the clipboard for distribution.
// Usage: npm run preview:wave1-copy-key -- wave1-tester-01
// Prints only the tester id — never the key — so the key cannot leak into a
// terminal transcript, a log, or a chat window. Paste it straight into the
// private message you send that tester.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SECRETS = new URL("../../.preview-secrets/wave1-access-keys.json", import.meta.url);
const who = process.argv[2];

let doc;
try { doc = JSON.parse(readFileSync(SECRETS, "utf8")); }
catch { console.error(`no key file at ${SECRETS.pathname}\nGenerate keys with: node scripts/preview/accessKey.mjs new <tester-id>`); process.exit(1); }

const ids = doc.keys.map((k) => k.testerId);
if (!who) {
  console.log(`usage: npm run preview:wave1-copy-key -- <testerId>\n\navailable: ${ids.join(", ")}`);
  process.exit(2);
}
const hit = doc.keys.find((k) => k.testerId === who);
if (!hit) { console.error(`unknown testerId "${who}"\navailable: ${ids.join(", ")}`); process.exit(1); }

try { execSync("pbcopy", { input: hit.key }); }
catch { console.error("clipboard unavailable (pbcopy failed)"); process.exit(1); }
console.log(`✓ ${hit.testerId} (${hit.role}, key version ${hit.keyVersion}, fingerprint …${hit.sha256.slice(-4)}) copied to clipboard`);
console.log("  Paste it into that tester's private invite. It is not shown here on purpose.");
