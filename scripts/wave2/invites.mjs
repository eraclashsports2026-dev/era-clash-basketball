// Write the Wave 2 invite set (one block per tester, each with its own key) to
// .preview-secrets/wave2-invites.txt (0600, gitignored). Keys are never printed.
//   npm run preview:wave2-invites -- [https://stable-wave2-url]
import { readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
const BASE = (process.argv[2] || process.env.WAVE2_BASE_URL || "").replace(/\/$/, "");
if (!/^https:\/\/[^\s]+$/.test(BASE)) { console.error("usage: npm run preview:wave2-invites -- https://<stable-wave2-url>"); process.exit(2); }
const SECRETS = new URL("../../.preview-secrets/wave2-access-keys.json", import.meta.url);
const OUT = new URL("../../.preview-secrets/wave2-invites.txt", import.meta.url);
if (!existsSync(SECRETS)) { console.error(`no key file at ${SECRETS.pathname}`); process.exit(1); }
const doc = JSON.parse(readFileSync(SECRETS, "utf8"));
const template = readFileSync(new URL("../../docs/preview/wave2-invite-template.md", import.meta.url), "utf8").split("\n---")[0];
const blocks = doc.keys.filter((k) => k.role !== "owner").map((k, i) => `INVITE ${i + 1} — ${k.testerId} (${k.cohort} cohort)\n${"-".repeat(60)}\n${template.replace("<STABLE_WAVE_2_URL>", BASE).replace("<YOUR_UNIQUE_KEY>", k.key)}\n`);
const owner = doc.keys.find((k) => k.role === "owner");
writeFileSync(OUT, `${blocks.join("\n")}\nOWNER (${owner.testerId}) — for you only\n${"-".repeat(60)}\n${BASE}\nkey: ${owner.key}\n`, { mode: 0o600 }); chmodSync(OUT, 0o600);
console.log(`✓ wrote ${blocks.length} invites + the owner block to ${OUT.pathname} (0600). Keys are in the file only.`);
