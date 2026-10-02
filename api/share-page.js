// Existing function serves actual initial-HTML recaps and full-size OG PNGs.
import { getJSON } from "./_lib/store.js";
import { trustedOrigin } from "./_lib/cards.js";
import { validShareId, shareModel } from "./_lib/loopShare.js";
import { renderSharePng, OG_RENDER_VERSION, escapeXml as esc } from "./_lib/loopShareImage.js";
import { PLAYERS } from "../src/players.js";
import { FRANCHISE_PAIRINGS, getFranchise, getFranchisePairing, getFranchiseRoster, franchiseDisplayName } from "../src/loop/franchises.js";
import { neutralTeamNaming } from "../src/loop/rights.js";

const catalog = new Map(PLAYERS.map((p) => [p.id, p]));
export function shareHtml({ model, origin, path, image, play, disclosure = "", legacy = false, cta = "Run it back with your five", extraHtml = "", actions = [] }) {
  const title = model.title;
  const desc = [model.subtitle, ...(model.performers || []).map((p) => `${p.name}: ${p.line}`), `${cta}.`].join(" — ");
  const rows = (side) => (model.players?.[side] || []).map((p) => `<li><span>${esc(p.pos || "")}</span> ${esc(p.name)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | EraClash Basketball</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(origin + path)}"><meta property="og:type" content="website"><meta property="og:site_name" content="EraClash Basketball"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(origin + path)}"><meta property="og:image" content="${esc(origin + image)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(desc)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(origin + image)}"><style>body{margin:0;background:#F6F1E7;color:#0F1C2E;font:18px/1.5 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:32px 20px}h1{line-height:1.15;font-size:clamp(28px,5vw,48px)}.kicker{color:#2457C5;font-weight:750}.sides{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}.side{min-width:0;border-radius:18px;padding:20px;background:#F3E3B5}.side:last-child{background:#DCE6FA}.score{font-size:58px;font-weight:800}ul{padding:0;list-style:none}h2,li{overflow-wrap:anywhere}li span{color:#6B7382;font-size:14px}a.button{display:inline-block;background:#0F1C2E;color:white;padding:16px 22px;border-radius:12px;text-decoration:none;font-weight:700}a{color:#2457C5}a:focus-visible{outline:3px solid #2457C5;outline-offset:4px}.note{color:#6B7382;font-size:14px}.performers{display:flex;gap:32px;flex-wrap:wrap}footer{margin-top:32px;font-size:14px}@media(max-width:500px){.sides{grid-template-columns:1fr;gap:10px}.side{padding:14px}.score{font-size:46px}li{font-size:15px}}</style></head><body><main data-public-recap><p class="kicker">ERACLASH / BASKETBALL</p><h1>${esc(title)}</h1><p>${esc(model.subtitle)}</p>${legacy ? '<p class="note">Archived browser-published recap. It was not verified against a server result.</p>' : ""}<div class="sides">${["gold", "blue"].map((s) => `<section class="side"><h2>${esc(s === "gold" ? model.goldName : model.blueName)}</h2>${model.score ? `<div class="score">${esc(model.score[s])}</div>` : ""}<ul>${rows(s)}</ul></section>`).join("")}</div><div class="performers">${(model.performers || []).map((p) => `<p><strong>${esc(p.name)}</strong><br>${esc(p.line)}</p>`).join("")}</div><p><a class="button" href="${esc(play)}">${esc(cta)}</a> ${(actions || []).map(a=>`<a class="button" href="${esc(a.href)}">${esc(a.label)}</a>`).join(" ")}</p>${extraHtml}<p class="note">${esc(disclosure || "A simulated basketball matchup. Play as a guest; sign up to save your results.")}</p><footer><a href="/">EraClash Basketball</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a><p>Not affiliated with, endorsed by, or sponsored by any professional basketball league or team.</p></footer></main><script src="/share-entry.js" defer></script></body></html>`;
}
function legacyModel(r) {
  return { title: `${r.won ? "Gold wins" : "Result"} ${r.scoreline || ""}`, subtitle: "Archived public recap", goldName: "GOLD FIVE", blueName: "BLUE FIVE", players: Object.fromEntries([["gold", r.teamIds], ["blue", r.oppIds]].map(([s, ids]) => [s, (ids || []).map((id) => ({ name: catalog.get(id)?.name || "Player", pos: catalog.get(id)?.pos || "" }))])), performers: r.mvp ? [{ name: r.mvp, line: r.mvpLine || "" }] : [], footer: "Run it back with your five · EraClash Basketball" };
}
export default async function handler(req, res) {
  if (!["GET", "HEAD"].includes(req.method)) { res.setHeader("Allow", "GET, HEAD"); return res.status(405).end(); }
  const origin = trustedOrigin(req);
  if (!origin) { res.setHeader("Cache-Control", "no-store"); return res.status(400).end(); }
  const kind = String(req.query?.kind || "result");
  const id = String(req.query?.id || "");
  if (kind === "franchise") return renderFranchise(req, res, origin, id);
  const r = validShareId(id) ? await getJSON(`${kind === "challenge" ? "ch" : "re"}:${id}`) : null;
  if (!r) {
    res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
    return res.status(404).send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Recap unavailable | EraClash Basketball</title><body><h1>This recap has expired or is unavailable.</h1><a href="/clash/any-five">Build your five and play</a></body></html>');
  }
  const challenge = kind === "challenge";
  const model = challenge ? { title: "You have been challenged", subtitle: "Build your five and play the matchup", goldName: "YOUR FIVE", blueName: "A RIVAL", players: { gold: [], blue: [] }, performers: [], footer: "Accept the challenge · EraClash Basketball" } : r.v === 2 ? shareModel(r) : legacyModel(r);
  const path = challenge ? `/challenge/${id}` : `/card/${id}`;
  const play = challenge ? `/?ch=${encodeURIComponent(id)}` : `/clash/any-five?rematch=${encodeURIComponent(id)}`;
  const image = `/api/share-page?kind=${challenge ? "challenge" : "result"}&id=${id}&format=png&v=${OG_RENDER_VERSION}`;
  if (req.query?.format === "png") {
    res.setHeader("Content-Type", "image/png"); res.setHeader("Cache-Control", "public, max-age=86400");
    const png = renderSharePng(model); res.setHeader("Content-Length", String(png.length));
    return req.method === "HEAD" ? res.status(200).end() : res.status(200).send(png);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", challenge ? "public, max-age=120" : "public, max-age=86400, stale-while-revalidate=604800");
  return req.method === "HEAD" ? res.status(200).end() : res.status(200).send(shareHtml({ model, origin, path, image, play, legacy: !challenge && r.v !== 2, disclosure: challenge ? "An invitation reveals no hidden draft choices. Play as a guest." : undefined }));
}

export function franchiseShareModel(pairing, { neutralNaming = false } = {}) {
  const gold = getFranchise(pairing.goldId), blue = getFranchise(pairing.blueId);
  const goldName = franchiseDisplayName(gold, { neutralNaming }).replace(' · All-time', '');
  const blueName = franchiseDisplayName(blue, { neutralNaming }).replace(' · All-time', '');
  return { title: `${goldName} vs ${blueName}`, subtitle: 'Curated all-time fives · A simulation preview, not a played result', goldName, blueName,
    players: { gold: getFranchiseRoster(gold).map((p,i)=>({name:p.name,pos:['PG','SG','SF','PF','C'][i]})), blue: getFranchiseRoster(blue).map((p,i)=>({name:p.name,pos:['PG','SG','SF','PF','C'][i]})) },
    performers: [], footer: 'Watch the matchup or control your five · EraClash Basketball' };
}
async function renderFranchise(req, res, origin, slug) {
  const pairing = getFranchisePairing(slug);
  if (!pairing) { res.setHeader('Cache-Control','no-store'); return res.status(404).send('Unknown franchise matchup.'); }
  const model = franchiseShareModel(pairing, { neutralNaming: neutralTeamNaming(process.env) });
  if (req.query?.format === 'png') {
    const png = renderSharePng(model); res.setHeader('Content-Type','image/png'); res.setHeader('Cache-Control','public, max-age=86400'); res.setHeader('Content-Length',String(png.length));
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(png);
  }
  const image = `/api/share-page?kind=franchise&id=${pairing.slug}&format=png&v=${OG_RENDER_VERSION}`;
  res.setHeader('Content-Type','text/html; charset=utf-8'); res.setHeader('Cache-Control','public, max-age=86400');
  return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(franchiseSharePage(pairing,{origin,image,neutralNaming:neutralTeamNaming(process.env)}));
}

export function franchiseSharePage(pairing, {origin,image,neutralNaming=false}) {
  const model = franchiseShareModel(pairing,{neutralNaming});
  const play = `/clash/franchise?gold=${pairing.goldId}&blue=${pairing.blueId}&entry=control`;
  const franchises = [getFranchise(pairing.goldId), getFranchise(pairing.blueId)];
  const related = FRANCHISE_PAIRINGS.filter(p=>p.slug!==pairing.slug && [p.goldId,p.blueId].some(id=>[pairing.goldId,pairing.blueId].includes(id)));
  const extraHtml = `<section><h2>About these fives</h2><p>Curated proposals from existing era cards. Statistical slices may include other teams in the same decade. Selections await owner review.</p>${franchises.map(f=>`<h3>${esc(franchiseDisplayName(f,{neutralNaming}))}</h3><p>${esc(f.notes)}</p><ul>${f.sources.map((url,i)=>`<li><a href="${esc(url)}">Historical source ${i+1}</a></li>`).join('')}</ul>`).join('')}<h2>More matchups</h2><ul>${related.map(p=>`<li><a href="${esc(p.path)}">${esc(franchiseDisplayName(p.goldId,{neutralNaming}))} vs ${esc(franchiseDisplayName(p.blueId,{neutralNaming}))}</a></li>`).join('')}</ul></section>`;
  return shareHtml({model,origin,path:pairing.path,image,play,cta:'Take control',extraHtml,actions:[{label:'Watch this Clash',href:`/clash/franchise?gold=${pairing.goldId}&blue=${pairing.blueId}&entry=watch`}],disclosure:'Curated all-time lineups drawn from the available player catalog. Not an official ranking or a live-game forecast. Neutral staff; no home-court modifier. Play as a guest.'});
}
