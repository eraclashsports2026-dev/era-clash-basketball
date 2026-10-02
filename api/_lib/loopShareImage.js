import { Resvg } from "@resvg/resvg-js";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_RENDER_VERSION = "2";
const fonts = ["Regular", "Bold"].map((w) => fileURLToPath(new URL(`./fonts/SourceSans3-${w}.ttf`, import.meta.url)));
export const escapeXml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cut = (s, n) => String(s ?? "").length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? "");
const txt = (x, y, s, size = 26, color = "#0F1C2E", bold = false) => `<text x="${x}" y="${y}" font-family="Source Sans 3" font-size="${size}" fill="${color}"${bold ? ' font-weight="700"' : ""}>${escapeXml(s)}</text>`;
const cache = new Map();
export function shareSvg(m) {
  const column = (side, x, color, label) => `<rect x="${x}" y="185" width="510" height="295" rx="20" fill="${color}"/>${txt(x + 24, 226, cut(label, 33), 23, "#0F1C2E", true)}${m.score ? txt(x + 486, 248, m.score[side], 72, "#0F1C2E", true).replace('<text ', '<text text-anchor="end" ') : ""}${(m.players?.[side] || []).slice(0, 5).map((p, i) => txt(x + 24, 277 + i * 37, `${p.pos || ""}  ${cut(p.name, 29)}`, 27)).join("")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#F6F1E7"/><path d="M0 0H1200V14H0Z" fill="#0F1C2E"/>${txt(54, 60, "ERACLASH / BASKETBALL", 24, "#2457C5", true)}${txt(54, 116, cut(m.title, 52), 42, "#0F1C2E", true)}${txt(54, 154, cut(m.subtitle, 88), 24, "#6B7382")}${column("gold", 54, "#F3E3B5", m.goldName || "GOLD FIVE")}${column("blue", 636, "#DCE6FA", m.blueName || "BLUE FIVE")}${(m.performers || []).slice(0, 2).map((p, i) => txt(54 + i * 582, 518, cut(p.name, 28), 26, "#0F1C2E", true) + txt(54 + i * 582, 546, cut(p.line, 45), 22, "#6B7382")).join("")}<path d="M54 570H1146" stroke="#D9CFBD"/>${txt(54, 605, cut(m.footer, 96), 24, "#0F1C2E", true)}</svg>`;
}
export function renderSharePng(model) {
  const svg = shareSvg(model);
  const key = createHash("sha256").update(`${OG_RENDER_VERSION}|${svg}`).digest("hex");
  if (cache.has(key)) return cache.get(key);
  const png = Buffer.from(new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Source Sans 3" } }).render().asPng());
  if (png.length >= 1_000_000) throw new Error("OG image exceeds one megabyte");
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(key, png);
  return png;
}
