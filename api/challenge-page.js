// ── /challenge/{id} — challenge landing with OpenGraph metadata ───────────────
// "YOU'VE BEEN CHALLENGED" preview for link unfurls; humans bounce into the app
// challenge flow (/?ch=id).
import { getJSON } from "./_lib/store.js";
import { PLAYERS } from "../src/players.js";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  const id = String(req.query?.id || "");
  const ok = /^[a-z0-9]{6,16}$/.test(id);
  const ch = ok ? await getJSON(`ch:${id}`) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120");

  if (!ch) {
    return res.status(200).send(`<!doctype html><html><head>
<meta charset="utf-8"><title>EraClash Basketball</title>
<meta http-equiv="refresh" content="0;url=/"></head>
<body><a href="/">EraClash Basketball</a></body></html>`);
  }

  const who = ch.challenger?.name || "A rival";
  const names = (ch.challenger?.teamIds || [])
    .map((pid) => PLAYERS.find((p) => p.id === pid)?.name.split(" ").slice(-1)[0]).filter(Boolean);
  const title = `⚔️ YOU'VE BEEN CHALLENGED by ${who}`;
  const desc = `${who} thinks ${names.join(" · ")} can beat anything you build. Draft your five and prove them wrong.`;
  const url = `https://${req.headers.host}/challenge/${id}`;

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
<meta http-equiv="refresh" content="0;url=/?ch=${esc(id)}">
</head><body style="background:#0b0e17;color:#e8eaf2;font-family:system-ui">
<p style="padding:24px">Loading the challenge… <a href="/?ch=${esc(id)}" style="color:#fdb927">Open EraClash</a></p>
</body></html>`);
}
