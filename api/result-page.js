// ── /result/{id} — public result page with OpenGraph metadata ─────────────────
// Crawlers get real OG tags (score, MVP, insight); humans get bounced into the
// app which renders the full result card + challenge CTA. Static OG image for
// now — dynamic share images are documented as deferred (see release notes).
import { getJSON } from "./_lib/store.js";
import { PLAYERS } from "../src/players.js";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  const id = String(req.query?.id || "");
  const ok = /^[a-z0-9]{6,16}$/.test(id);
  const r = ok ? await getJSON(`re:${id}`) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");

  if (!r) {
    return res.status(200).send(`<!doctype html><html><head>
<meta charset="utf-8"><title>EraClash Basketball</title>
<meta http-equiv="refresh" content="0;url=/"></head>
<body><a href="/">EraClash Basketball</a></body></html>`);
  }

  const names = r.teamIds.map((pid) => PLAYERS.find((p) => p.id === pid)?.name.split(" ").slice(-1)[0]).filter(Boolean);
  const title = `${r.won ? "W" : "L"} ${r.scoreline} — ${names.join(" · ")}`;
  const desc = [
    r.headline,
    r.mvp ? `MVP: ${r.mvp}${r.mvpLine ? ` (${r.mvpLine})` : ""}` : "",
    r.insight,
    "Can your five beat this lineup? Play the challenge.",
  ].filter(Boolean).join(" — ");
  const url = `https://${req.headers.host}/result/${id}`;

  return res.status(200).send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | EraClash Basketball</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="EraClash Basketball">
<meta property="og:image" content="https://${esc(req.headers.host)}/icon-512.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta http-equiv="refresh" content="0;url=/?r=${esc(id)}">
</head><body style="background:#0b0e17;color:#e8eaf2;font-family:system-ui">
<p style="padding:24px">Loading the result… <a href="/?r=${esc(id)}" style="color:#fdb927">Open EraClash</a></p>
</body></html>`);
}
