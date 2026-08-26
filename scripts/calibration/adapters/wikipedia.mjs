// ── Wikipedia source adapter ────────────────────────────────────────────────
// Wikipedia is CC BY-SA 4.0: reuse is explicitly permitted with attribution.
// That licence is the reason this source is usable at all, so every value it
// produces carries the attribution with it.
//
// What this adapter deliberately does NOT do:
//   - spoof a browser User-Agent
//   - retry past a rate limit
//   - commit page text; only extracted numbers reach the repository
//
// It parses the RENDERED HTML rather than wikitext. Wikitext tables across
// 1970-2024 carry {{sortname}}, {{nts}} and per-cell styling whose pipes are
// indistinguishable from cell separators — a first attempt down that road
// parsed 9 of 16 articles and mangled names into "Stephen|Curry}}". The
// rendered HTML has already resolved every template, so the same parser works
// on a 1971 article and a 2024 one.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const CACHE_DIR = ".cache/calibration/sources/wikipedia";
const API = "https://en.wikipedia.org/w/api.php";

// An honest agent that says what this is and who to contact. Anything else
// misrepresents affiliation, which is both forbidden and wrong.
export const USER_AGENT = "EraClashCalibration/1.0 (basketball simulation calibration research; contact: joseph.johnson@indagare.com)";

export const PUBLISHER = "Wikipedia (Wikimedia Foundation)";
export const LICENSE_NOTE = "Wikipedia content, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Reused with attribution. Only extracted numeric facts are stored; no article text is committed to the repository.";

// Wikipedia rate-limits bursts. 1.5s stayed comfortably inside the limit;
// 300ms did not, and the correct answer to a rate limit is to slow down.
const MIN_INTERVAL_MS = 1500;
let lastFetch = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cachePath = (title) => `${CACHE_DIR}/${title.replace(/[^A-Za-z0-9]+/g, "_")}.json`;

/** Fetches one article's rendered HTML, cached, with a content hash and revision id. */
export const fetchArticle = async (title, { refresh = false } = {}) => {
  const path = cachePath(title);
  if (!refresh && existsSync(path)) return { ...JSON.parse(readFileSync(path, "utf8")), fromCache: true };

  const wait = MIN_INTERVAL_MS - (Date.now() - lastFetch);
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();

  const url = `${API}?action=parse&page=${encodeURIComponent(title.replace(/ /g, "_"))}&prop=text|revid&format=json&redirects=1&formatversion=2`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`wikipedia: HTTP ${res.status} for "${title}" — not retried past a rate limit`);
  const body = await res.text();
  if (!body.trimStart().startsWith("{")) {
    throw new Error(`wikipedia: non-JSON response for "${title}" (rate limited?): ${body.slice(0, 80)}`);
  }
  const json = JSON.parse(body);
  if (json.error) throw new Error(`wikipedia: ${json.error.info}`);

  const record = {
    title,
    resolvedTitle: json.parse.title,
    revisionId: json.parse.revid,
    html: json.parse.text,
    contentHash: createHash("sha256").update(json.parse.text).digest("hex").slice(0, 32),
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(json.parse.title.replace(/ /g, "_"))}?oldid=${json.parse.revid}`,
    retrievedAt: new Date().toISOString().slice(0, 10),
  };
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2));
  return { ...record, fromCache: false };
};

// ── HTML table parsing ──────────────────────────────────────────────────────
const decode = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
   .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(+d));

const textOf = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const num = (s) => {
  if (s == null) return null;
  const t = String(s).trim().replace(/[*†‡^]/g, "").trim().replace(/^\./, "0.");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/** Every <table> in the document, as raw HTML. */
const tablesIn = (html) => {
  const out = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[0]);
  return out;
};

const rowsOf = (table) =>
  [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) =>
    [...r[0].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => ({ tag: c[1].toLowerCase(), text: textOf(c[2]) })));

/**
 * The regular-season player statistics table.
 *
 * Chosen by CONTENT — a header row carrying a player column and a points
 * column — rather than by position or heading text. Headings are not
 * standardised ("Player statistics", "Player stats", "Statistics"), and the
 * playoffs table has an identical shape, so the first qualifying table with the
 * most rows is taken and the choice is reported for inspection.
 */
export const parsePlayerTable = (html) => {
  const candidates = [];
  for (const t of tablesIn(html)) {
    const rows = rowsOf(t);
    if (rows.length < 4) continue;
    const header = rows.find((r) => r.length >= 5 && r.every((c) => c.tag === "th"));
    if (!header) continue;
    const H = header.map((c) => c.text.toUpperCase().replace(/[^A-Z0-9%]/g, ""));
    const col = (...names) => {
      for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; }
      return -1;
    };
    const idx = {
      player: col("PLAYER", "NAME"), gp: col("GP", "G", "GAMES"), gs: col("GS"),
      mpg: col("MPG", "MIN", "MINUTES"), fgPct: col("FG%", "FGPCT"),
      tpPct: col("3P%", "3PT%"), ftPct: col("FT%"),
      reb: col("RPG", "REB", "TRB"), ast: col("APG", "AST"), pts: col("PPG", "PTS", "POINTS"),
      avg: col("AVG"), stl: col("SPG", "STL"), blk: col("BPG", "BLK"),
    };
    // A statistics table, not a draft or roster table. Both of those also have
    // a "Player" column, and picking one up would produce numbers that look
    // like statistics and are not.
    if (idx.player < 0 || idx.gp < 0 || idx.pts < 0) continue;

    const raw = [];
    for (const r of rows) {
      if (r === header || r.every((c) => c.tag === "th")) continue;
      if (r.length < header.length - 1) continue;
      const name = r[idx.player]?.text;
      if (!name || /^(total|team|opponent)/i.test(name)) continue;
      const get = (i) => (i >= 0 && i < r.length ? num(r[i].text) : null);
      const pts = get(idx.pts);
      const gp = get(idx.gp);
      if (pts == null || gp == null || gp <= 0) continue;
      raw.push({ name: name.replace(/[*\u2020\u2021^]/g, "").trim(), gp, gs: get(idx.gs), mpg: get(idx.mpg),
        fgPct: get(idx.fgPct), threePct: get(idx.tpPct), ftPct: get(idx.ftPct),
        pts, reb: get(idx.reb), ast: get(idx.ast), stl: get(idx.stl), blk: get(idx.blk), avg: get(idx.avg) });
    }
    if (raw.length < 5) continue;

    // Per-game or season totals? Detected PER COLUMN, not per table. The
    // 1986-87 Lakers article publishes scoring per game (Magic 23.8) and
    // rebounds as a season total (Magic 504) in the SAME table, so a
    // whole-table verdict silently reported 504 rebounds per game.
    //
    // The test is plausibility: no player has ever averaged more than these
    // per game, so a column whose maximum exceeds its bound must be totals.
    const PER_GAME_CEILING = { pts: 55, reb: 30, ast: 16, stl: 5, blk: 7, mpg: 48.1 };
    const isTotals = {};
    for (const [k, ceiling] of Object.entries(PER_GAME_CEILING)) {
      const vals = raw.map((p) => p[k]).filter((v) => v != null);
      isTotals[k] = vals.length > 0 && Math.max(...vals) > ceiling;
    }

    const conv = (p, k) => {
      const v = p[k];
      if (v == null) return null;
      return isTotals[k] ? round3(v / p.gp) : v;
    };
    const pct = (v) => (v == null ? null : round3(v > 1 ? v / 100 : v));
    const scope = Object.values(isTotals).some(Boolean)
      ? (Object.values(isTotals).every(Boolean) ? "SEASON_TOTALS" : "MIXED_TOTALS_AND_PER_GAME")
      : "PER_GAME";

    const players = raw.map((p) => ({
      name: p.name, gp: p.gp, gs: p.gs,
      mpg: conv(p, "mpg"),
      fgPct: pct(p.fgPct), threePct: pct(p.threePct), ftPct: pct(p.ftPct),
      // AVG, where the article supplies it, is the published per-game figure
      // and is preferred over dividing totals ourselves.
      ppg: p.avg != null ? p.avg : conv(p, "pts"),
      rpg: conv(p, "reb"), apg: conv(p, "ast"),
      spg: conv(p, "stl"), bpg: conv(p, "blk"),
    })).filter((p) => p.ppg != null);

    if (players.length >= 5) candidates.push({ headers: H, players, scope });
  }
  if (!candidates.length) return null;
  // The regular-season table lists more players than the playoffs table, which
  // carries only players who appeared in the postseason.
  return candidates.sort((a, b) => b.players.length - a.players.length)[0];
};

const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

/**
 * The season ROSTER table: who was on this team that season.
 *
 * Separate from the statistics table because Wikipedia's coverage of the two is
 * independent — many older season articles carry a roster and no statistics at
 * all. Membership is enough to verify that a fixture's five belong to the named
 * team-season, which is a different and weaker claim than knowing what they
 * produced, and the two are kept apart for exactly that reason.
 */
export const parseRosterTable = (html) => {
  for (const t of tablesIn(html)) {
    const rows = rowsOf(t);
    if (rows.length < 6) continue;
    const header = rows.find((r) => r.length >= 5 && r.every((c) => c.tag === "th"));
    if (!header) continue;
    const H = header.map((c) => c.text.toUpperCase().replace(/[^A-Z0-9%.]/g, ""));
    const iPlayer = H.findIndex((h) => h === "PLAYER" || h === "NAME");
    const iPos = H.findIndex((h) => h === "POS." || h === "POS" || h === "POSITION");
    // A roster table has a position column and physical columns; a draft table
    // has Round and Pick, and a statistics table has games and points.
    const isDraft = H.includes("ROUND") || H.includes("PICK");
    const isStats = H.includes("GP") || H.includes("PTS") || H.includes("PPG");
    const hasPhysical = H.includes("HEIGHT") || H.includes("WEIGHT") || H.includes("FROM");
    if (iPlayer < 0 || iPos < 0 || isDraft || isStats || !hasPhysical) continue;

    const players = [];
    for (const r of rows) {
      if (r === header || r.every((c) => c.tag === "th")) continue;
      const name = r[iPlayer]?.text?.replace(/[*\u2020\u2021^()]/g, "").replace(/\s+/g, " ").trim();
      if (!name || name.length < 3) continue;
      players.push({ name, position: r[iPos]?.text ?? null });
    }
    if (players.length >= 6) return { players, source: "ROSTER_TABLE" };
  }
  return null;
};

/** Team win-loss record from the season infobox. */
export const parseRecord = (html) => {
  for (const t of tablesIn(html)) {
    if (!/infobox/i.test(t.slice(0, 400))) continue;
    const txt = textOf(t);
    const m = txt.match(/Record\s*:?\s*(\d{1,2})\s*[–\-]\s*(\d{1,2})/i);
    if (m) {
      const w = Number(m[1]);
      const l = Number(m[2]);
      if (w + l >= 40 && w + l <= 82) return { wins: w, losses: l, games: w + l };
    }
  }
  return null;
};
