// Generate a preview access key + the hash line for config/previewAccess.js.
// Usage: node scripts/preview/accessKey.mjs new <label>
import { randomBytes, createHash } from "node:crypto";
const [, , cmd, label] = process.argv;
if (cmd !== "new" || !label || !/^[a-z0-9-]{2,32}$/.test(label)) {
  console.error("usage: node scripts/preview/accessKey.mjs new <label>   (label: kebab-case)");
  process.exit(2);
}
const key = randomBytes(16).toString("hex");
const hash = createHash("sha256").update(key).digest("hex");
console.log(`ACCESS KEY (deliver out of band, never commit): ${key}`);
console.log(`\nAdd to config/previewAccess.js keys[]:`);
console.log(`    { label: "${label}", sha256: "${hash}" },`);
