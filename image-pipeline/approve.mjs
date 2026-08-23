#!/usr/bin/env node
// ── Approve a reviewed image candidate ─────────────────────────────────────────
// node image-pipeline/approve.mjs <candidate_id> [<candidate_id> ...]
// node image-pipeline/approve.mjs --reject <candidate_id> ...
//
// Approval: downloads the ORIGINAL from the recorded source into
// public/players/originals/ (EraClash-controlled copy — never hotlinked),
// records the full provenance in src/images/approved.json (bundled into the
// product and the /credits surface), and marks the candidate approved.
// CC BY-SA-flagged candidates are refused until the share-alike compliance
// decision is documented (pass --accept-by-sa to acknowledge it explicitly).
//
// NOTE: run this only for candidates a human actually reviewed (identity AND
// license) on review.html. This tool is the review gate's mechanical half.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CANDS = new URL("./candidates.json", import.meta.url).pathname;
const APPROVED = new URL("../src/images/approved.json", import.meta.url).pathname;
const ASSET_DIR = new URL("../public/players/originals/", import.meta.url).pathname;

// SSRF guard: downloads are permitted ONLY from the explicit asset-host
// allowlist over HTTPS on the default port. Never localhost, private ranges,
// IPs, redirect targets, or user-supplied hosts (curl is invoked with -f and
// no -L, so redirects are not followed).
const ALLOWED_ASSET_HOSTS = new Set(["upload.wikimedia.org", "tile.loc.gov", "www.loc.gov"]);
export const isAllowedAssetUrl = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.port && u.port !== "443") return false;
    if (u.username || u.password) return false;
    if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) return false; // no raw IPs
    return ALLOWED_ASSET_HOSTS.has(u.hostname.toLowerCase());
  } catch { return false; }
};

const args = process.argv.slice(2);
const rejectMode = args.includes("--reject");
const acceptBySa = args.includes("--accept-by-sa");
const ids = args.filter((a) => !a.startsWith("--"));

// CLI-only from here down — tests import isAllowedAssetUrl without side effects.
const isCli = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
if (!ids.length) { console.error("usage: approve.mjs [--reject] [--accept-by-sa] <candidate_id> ..."); process.exit(1); }

const data = JSON.parse(readFileSync(CANDS, "utf8"));
const approved = existsSync(APPROVED) ? JSON.parse(readFileSync(APPROVED, "utf8")) : { images: [] };
mkdirSync(ASSET_DIR, { recursive: true });

for (const id of ids) {
  const c = data.candidates.find((x) => x.id === id);
  if (!c) { console.error(`✗ ${id}: not found`); continue; }

  if (rejectMode) {
    c.human_review_status = "rejected";
    console.log(`✓ ${id}: rejected`);
    continue;
  }
  if (c.license_flag === "by-sa" && !acceptBySa) {
    console.error(`✗ ${id}: CC BY-SA flagged — pass --accept-by-sa only after the share-alike compliance decision is documented.`);
    continue;
  }

  if (!isAllowedAssetUrl(c.image_url)) {
    console.error(`✗ ${id}: asset URL not on the approved host allowlist (${c.image_url.slice(0, 60)}…)`);
    continue;
  }
  const ext = (c.image_url.match(/\.(jpe?g|png)$/i) || [".jpg"])[0].toLowerCase();
  const localName = `${c.player_id}--${c.source_asset_id}${ext}`;
  const localPath = `${ASSET_DIR}${localName}`;
  try {
    // -f fail on HTTP errors; NO -L: redirects are refused, not followed.
    execFileSync("curl", ["-fsS", "--max-filesize", "26214400", "--proto", "=https", "-A",
      "EraClashBasketball/2.3 (image pipeline)", "-o", localPath, c.image_url], { timeout: 60000 });
  } catch (e) {
    console.error(`✗ ${id}: download failed (${e.message})`);
    continue;
  }

  c.human_review_status = "approved";
  c.identity_verified = true;
  c.license_verified = true;
  c.approved_for_product = true;
  const record = {
    ...c,
    local_asset_path: `/players/originals/${localName}`,
    attribution_text: c.required_attribution
      ? `${c.player_name} photo: ${c.creator || "unknown"} — ${c.license_name} — via ${c.source_name}`
      : null,
    verified_at: new Date().toISOString(),
    downloaded_at: new Date().toISOString(),
  };
  approved.images = approved.images.filter((x) => x.id !== record.id);
  approved.images.push(record);
  console.log(`✓ ${id}: approved → ${record.local_asset_path}`);
}

writeFileSync(CANDS, JSON.stringify(data, null, 1));
writeFileSync(APPROVED, JSON.stringify(approved, null, 1));
console.log(`\napproved.json now has ${approved.images.length} production images. Rebuild + redeploy to ship.`);
console.log("Consider generating web-sized derivatives before deploy (originals can be large).");
} // end CLI guard
