#!/usr/bin/env node
// ── Human review page generator ────────────────────────────────────────────────
// Renders image-pipeline/candidates.json into a local HTML review page
// (image-pipeline/review.html — open it in a browser). Each card shows the
// candidate, provenance, license, and the exact approve command. Nothing on
// this page changes product state; approval happens via approve.mjs.
import { readFileSync, writeFileSync } from "node:fs";

const IN = new URL("./candidates.json", import.meta.url).pathname;
const OUT = new URL("./review.html", import.meta.url).pathname;

const { candidates } = JSON.parse(readFileSync(IN, "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pending = candidates.filter((c) => c.human_review_status === "pending");
const byPlayer = {};
for (const c of pending) (byPlayer[c.player_id] ||= []).push(c);

const card = (c) => `
<div class="cand ${c.license_flag ? "flagged" : ""}">
  <img loading="lazy" src="${esc(c.thumbnail_url)}" alt="${esc(c.player_name)} candidate">
  <div class="meta">
    <b>${esc(c.file_title)}</b>
    <span>License: <b class="${c.license_flag ? "warn" : "ok"}">${esc(c.license_name)}${c.license_flag ? " ⚠ share-alike — needs compliance decision" : ""}</b></span>
    <span>Creator: ${esc(c.creator || "—")}</span>
    <span>Date: ${esc(c.image_date || "unknown")} · Era match: <b>${esc(c.era_match_quality)}</b> · Identity: ${esc(c.identity_confidence)}</span>
    <span><a href="${esc(c.source_page)}" target="_blank">Source page ↗</a></span>
    <code>node image-pipeline/approve.mjs ${esc(c.id)}</code>
  </div>
</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>EraClash image review — ${pending.length} pending</title>
<style>
body{background:#0b0e17;color:#e8eaf2;font-family:system-ui;margin:0;padding:24px}
h1{font-style:italic} h2{color:#fdb927;margin:28px 0 8px}
.cand{display:flex;gap:14px;background:#141a2a;border:1px solid #232c45;border-radius:10px;padding:12px;margin:8px 0;max-width:900px}
.cand.flagged{border-color:#f39c12}
.cand img{width:140px;height:140px;object-fit:cover;border-radius:8px;background:#000}
.meta{display:flex;flex-direction:column;gap:4px;font-size:13px;min-width:0}
.ok{color:#2ecc71}.warn{color:#f39c12}
code{background:#0b0e17;padding:4px 8px;border-radius:6px;font-size:12px;user-select:all}
a{color:#6ea8fe}
</style></head><body>
<h1>ERA<span style="color:#fdb927">CLASH</span> image review</h1>
<p>${pending.length} pending candidates · ${Object.keys(byPlayer).length} players. Approving a candidate downloads the original,
records provenance, and adds it to <code>src/images/approved.json</code>. Only approve when you're confident in identity AND license.</p>
${Object.entries(byPlayer).map(([pid, cs]) =>
  `<h2>${esc(cs[0].player_name)} <small style="color:#8a93ad">(${esc(pid)} · ${esc(cs[0].season_or_decade)})</small></h2>${cs.map(card).join("")}`
).join("")}
</body></html>`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} — ${pending.length} pending candidates for ${Object.keys(byPlayer).length} players. Open it in a browser.`);
