// Build a one-tap Wave 1 access link and copy it to the clipboard.
//   npm run preview:wave1-link -- owner                    → the app
//   npm run preview:wave1-link -- wave1-tester-01 w1-s4    → straight into a scenario
//   npm run preview:wave1-link -- owner --open             → open it here instead of copying
// The link contains that person's key, so it is copied, never printed.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.env.PREVIEW_BASE_URL || "https://era-clash-basketball-git-wave1-era-clash.vercel.app";
const SECRETS = new URL("../../.preview-secrets/wave1-access-keys.json", import.meta.url);
const args = process.argv.slice(2).filter((a) => a !== "--open");
const openIt = process.argv.includes("--open");
const [who, scenario] = args;

let doc;
try { doc = JSON.parse(readFileSync(SECRETS, "utf8")); }
catch { console.error(`no key file at ${SECRETS.pathname}`); process.exit(1); }
const ids = doc.keys.map((k) => k.testerId);
if (!who) { console.log(`usage: npm run preview:wave1-link -- <testerId> [scenarioId] [--open]\n\navailable: ${ids.join(", ")}`); process.exit(2); }
const hit = doc.keys.find((k) => k.testerId === who);
if (!hit) { console.error(`unknown testerId "${who}"\navailable: ${ids.join(", ")}`); process.exit(1); }
if (scenario && !/^w1-s[1-8]$/.test(scenario)) { console.error(`scenario must be w1-s1 … w1-s8`); process.exit(1); }

const u = new URL(BASE);
if (scenario) u.searchParams.set("scenario", scenario);
u.searchParams.set("pv", hit.key);
const link = u.toString();

if (openIt) {
  execSync(`open ${JSON.stringify(link)}`);
  console.log(`✓ opened the preview as ${hit.testerId}${scenario ? ` at scenario ${scenario}` : ""}`);
} else {
  execSync("pbcopy", { input: link });
  console.log(`✓ one-tap link for ${hit.testerId} (${hit.role}, fingerprint …${hit.sha256.slice(-4)})${scenario ? ` · scenario ${scenario}` : ""} copied to clipboard`);
  console.log("  Paste it into that person's private invite. It carries their key, so never post it publicly.");
}
