// ── /api/share-page — public share pages (result + challenge) ─────────────────
// One function serves both share surfaces, dispatched by ?kind=. The paths the
// world sees are unchanged: vercel.json rewrites /result/{id} and
// /challenge/{id} here. Consolidated because the deployment's serverless
// function budget is full (13) and the preview access middleware needs a slot.
import { getJSON } from "./_lib/store.js";
import { PLAYERS } from "../src/players.js";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  if (String(req.query?.kind || "") === "challenge") return renderChallengePage(req, res);
  return renderResultPage(req, res);
}

async function renderResultPage(req, res) {
  const id = String(req.query?.id || "");
  const ok = /^[a-z0-9]{6,16}$/.test(id);
  const r = ok ? await getJSON(`re:${id}`) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (!r) {
    // NOT-FOUND MUST NOT BE PUBLICLY CACHED. This path returns 200 with a
    // redirect-to-home body, and it previously inherited the same
    // `public, max-age=300` as a real result — so a result shared moments after
    // someone hit its URL would serve the "nothing here" page from CDN to
    // everyone for the next five minutes. A miss is a transient state, not a
    // cacheable document.
    res.setHeader("Cache-Control", "no-store");
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

  // A share record is immutable once written: the game it describes cannot
  // change. Cached for a day at the edge with a long stale-while-revalidate,
  // rather than `immutable`, because the URL carries no render version — when
  // the share renderer is versioned (see cache-key-registry.md) this can become
  // a year-long immutable cache safely.
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

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

async function renderChallengePage(req, res) {
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
