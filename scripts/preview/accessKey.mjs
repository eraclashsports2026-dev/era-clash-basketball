// Generate a preview access key + the allowlist entry for config/previewAccess.js.
// Usage: node scripts/preview/accessKey.mjs new <tester-id> [role]
// The key prints ONCE — deliver it out of band and store it in
// .preview-secrets/ if you need a local record. Never commit it.
import { randomBytes, createHash } from "node:crypto";
const [, , cmd, testerId, role = "tester"] = process.argv;
if (cmd !== "new" || !testerId || !/^[a-z0-9-]{2,32}$/.test(testerId) || !["tester", "owner"].includes(role)) {
  console.error("usage: node scripts/preview/accessKey.mjs new <tester-id> [tester|owner]");
  process.exit(2);
}
// A ROTATION must not hand back a lower keyVersion than the tester already
// carries: sessions are validated against the allowlist's version, so pasting a
// keyVersion 2 line over a tester sitting at 3 would revive their burned v2 key
// and every session minted under it. Read the current version and step past it.
const { PREVIEW_ACCESS } = await import("../../config/previewAccess.js");
const existing = PREVIEW_ACCESS.keys.find((k) => k.testerId === testerId);
const highest = PREVIEW_ACCESS.keys.reduce((n, k) => Math.max(n, Number(k.keyVersion) || 1), 1);
const keyVersion = existing ? Number(existing.keyVersion || 1) + 1 : highest;

const key = randomBytes(16).toString("hex");
const hash = createHash("sha256").update(key).digest("hex");
console.log(`ACCESS KEY (deliver out of band, never commit): ${key}`);
if (existing) {
  console.log(`\nROTATION: ${testerId} is at keyVersion ${existing.keyVersion} — this line moves them to ${keyVersion},`);
  console.log(`which kills their old key and every session minted under it.`);
}
console.log(`\nAdd to config/previewAccess.js keys[]:`);
console.log(`    { testerId: "${testerId}", role: "${role}", sha256: "${hash}", enabled: true, keyVersion: ${keyVersion} },`);
