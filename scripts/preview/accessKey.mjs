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
const key = randomBytes(16).toString("hex");
const hash = createHash("sha256").update(key).digest("hex");
console.log(`ACCESS KEY (deliver out of band, never commit): ${key}`);
console.log(`\nAdd to config/previewAccess.js keys[]:`);
console.log(`    { testerId: "${testerId}", role: "${role}", sha256: "${hash}", enabled: true, keyVersion: 2 },`);
