// ── Clash Breakdown V1: the pure deterministic engine ────────────────────────
// buildBreakdown(result) → a versioned, allowlisted projection of a completed
// Clash. Pure: no network, no clock, no randomness, no mutation of the input.
// The same completed result under the same version always yields the same
// projection (the tests compare serialisations).
import {
  CLASH_BREAKDOWN_VERSION, KEY_PERFORMANCE_RULE_VERSION, MAX_INSIGHTS, MAX_PERFORMANCES_PER_TEAM, TEAM_METRICS, INSIGHT_CANDIDATES,
  FAMILY_ORDER, LARGE_STRENGTH, BALANCED_LINE, PERFORMANCE_LABELS, LINE_EXTRAS, DEFERRED,
} from "./contract.js";

const SIDES = ["gold", "blue"];
const TEAM = { gold: "Gold", blue: "Blue" };
const COUNT_FIELDS = ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "to"];
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const int = (v) => { const x = n(v); return x === null ? null : Math.round(x); };
/** A percentage to one decimal from made/attempted; null when nothing was attempted. */
export const pct = (made, att) => (att > 0 && made !== null ? Math.round((made / att) * 1000) / 10 : null);
const plural = (k, one, many = `${one}s`) => (k === 1 ? one : many);
const fmtPct = (p) => (p === null ? "—" : `${p.toFixed(1)}%`);
/** Display-safe text: no angle brackets, collapsed whitespace, capped length. Rendered as React text, never HTML. */
const safeText = (s, max = 40) => String(s ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

// ── Source reading (the permitted fields only) ───────────────────────────────
const readSource = (result) => {
  const r = result || {};
  const v3 = r.v3 || r.sim?.v3 || null;
  const final = r.core?.finalScore || r.finalScore || r.sim?.finalScore || null;
  const box = v3?.fullBox && Array.isArray(v3.fullBox.gold) && Array.isArray(v3.fullBox.blue) ? v3.fullBox : null;
  const periods = Array.isArray(v3?.periodScores) ? v3.periodScores : Array.isArray(r.periodScores) ? r.periodScores : null;
  return { id: r.id || r.resultId || null, final, box, totals: v3?.teamTotals || null, periods, overtimes: int(v3?.overtimes) ?? 0 };
};

const player = (p) => {
  const out = { name: safeText(p?.name) || "Player", pos: safeText(p?.pos, 4) || null };
  for (const k of COUNT_FIELDS) out[k] = int(p?.[k]) ?? 0;
  out.reb = out.oreb + out.dreb;
  return out;
};

/** Team totals: the stored teamTotals when present and consistent with the box; else the box summed. */
const teamTotals = (src) => {
  const sums = {};
  for (const s of SIDES) {
    const t = {}; for (const k of COUNT_FIELDS) t[k] = src.box[s].reduce((a, p) => a + (int(p?.[k]) ?? 0), 0);
    t.reb = t.oreb + t.dreb; sums[s] = t;
  }
  if (!src.totals) return { totals: sums, source: "box_sum", consistent: true };
  const stored = {};
  let consistent = true;
  for (const s of SIDES) {
    const st = src.totals[s] || {}; const t = {};
    for (const k of [...COUNT_FIELDS, "reb"]) { t[k] = int(st[k]) ?? sums[s][k]; if (t[k] !== sums[s][k]) consistent = false; }
    t.possessions = int(st.possessions);
    stored[s] = t;
  }
  return { totals: stored, source: "team_totals", consistent };
};

// ── Metric values ────────────────────────────────────────────────────────────
const metricValue = (m, t) => {
  if (m.kind === "count") return t[m.field] ?? null;
  if (m.kind === "pct") return pct(t[m.made], t[m.att]);
  return null;
};
const display = (m, t) => {
  if (m.kind === "split") return `${t[m.made]}/${t[m.att]}`;
  if (m.kind === "pct") return fmtPct(pct(t[m.made], t[m.att]));
  const v = t[m.field]; return v === null || v === undefined ? "—" : String(v);
};
/** Which side the metric favours, honouring its direction; null when level or neutral or incomparable. */
const stronger = (m, g, b) => {
  if (m.direction === "neutral" || g === null || b === null || g === b) return null;
  if (m.kind === "split") return null;   // a made/attempted split is shown, the made and % rows carry the comparison
  return m.direction === "lower" ? (g < b ? "gold" : "blue") : (g > b ? "gold" : "blue");
};

// ── Insights ─────────────────────────────────────────────────────────────────
const insightCopy = (c, lead, trail, t, delta) => {
  const L = TEAM[lead], T = TEAM[trail], g = t.gold, b = t.blue;
  const d = Math.abs(delta);
  switch (c.id) {
    case "fg_pct": return { values: `Gold ${fmtPct(pct(g.fgm, g.fga))} (${g.fgm}/${g.fga}) · Blue ${fmtPct(pct(b.fgm, b.fga))} (${b.fgm}/${b.fga})`, summary: `${L} shot ${d.toFixed(1)} percentage points better from the field.` };
    case "three_made": return { values: `Gold ${g.tpm} of ${g.tpa} · Blue ${b.tpm} of ${b.tpa}`, summary: `${L} made ${d} more ${plural(d, "three-pointer")} — ${d * 3} more points from threes.` };
    case "three_pct": return { values: `Gold ${fmtPct(pct(g.tpm, g.tpa))} (${g.tpm}/${g.tpa}) · Blue ${fmtPct(pct(b.tpm, b.tpa))} (${b.tpm}/${b.tpa})`, summary: `${L} shot ${d.toFixed(1)} percentage points better from three.` };
    case "turnovers": return { values: `Gold ${g.to} · Blue ${b.to} ${plural(Math.max(g.to, b.to), "turnover")}`, summary: `${L} finished with ${d} fewer ${plural(d, "turnover")}.` };
    case "rebounds": return { values: `Gold ${g.reb} · Blue ${b.reb}`, summary: `${L} held a +${d} rebounding margin.` };
    case "off_rebounds": return { values: `Gold ${g.oreb} · Blue ${b.oreb} offensive`, summary: `${L} grabbed ${d} more offensive ${plural(d, "rebound")}.` };
    case "free_throws": return { values: `Gold ${g.ftm} of ${g.fta} · Blue ${b.ftm} of ${b.fta}`, summary: `${L} made ${d} more free ${plural(d, "throw")}.` };
    case "assists": return { values: `Gold ${g.ast} · Blue ${b.ast}`, summary: `${L} recorded ${d} more ${plural(d, "assist")}.` };
    case "steals": return { values: `Gold ${g.stl} · Blue ${b.stl} steals`, summary: `${L} recorded ${d} more ${plural(d, "steal")}.` };
    case "blocks": return { values: `Gold ${g.blk} · Blue ${b.blk} blocks`, summary: `${L} recorded ${d} more ${plural(d, "block")}.` };
    default: return { values: "", summary: "" };
  }
  void T;
};
// A candidate names a comparison-table metric, or a raw counted field (tpm, ftm) scored "higher is stronger".
const metricByKey = Object.fromEntries(TEAM_METRICS.map((m) => [m.key, m]));
const metricFor = (key) => metricByKey[key] || { key, kind: "count", field: key, direction: "higher" };
export const selectInsights = (totals) => {
  const cands = [];
  for (const c of INSIGHT_CANDIDATES) {
    const m = metricFor(c.metric);
    if (c.minAttempts && (totals.gold[m.att] < c.minAttempts || totals.blue[m.att] < c.minAttempts)) continue;
    const g = metricValue(m, totals.gold), b = metricValue(m, totals.blue);
    if (g === null || b === null) continue;
    const delta = Math.round((g - b) * 10) / 10;
    if (Math.abs(delta) < c.threshold) continue;
    const lead = stronger(m, g, b);
    if (!lead) continue;
    cands.push({ c, delta, lead, strength: Math.abs(delta) / c.threshold });
  }
  cands.sort((x, y) => (y.strength - x.strength) || (FAMILY_ORDER.indexOf(x.c.family) - FAMILY_ORDER.indexOf(y.c.family)) || (INSIGHT_CANDIDATES.indexOf(x.c) - INSIGHT_CANDIDATES.indexOf(y.c)));
  const out = []; const used = new Set();
  for (const x of cands) {
    if (used.has(x.c.family)) continue;
    used.add(x.c.family);
    const trail = x.lead === "gold" ? "blue" : "gold";
    out.push({ id: x.c.id, family: x.c.family, title: x.c.title, favours: x.lead, gold: metricValue(metricFor(x.c.metric), totals.gold), blue: metricValue(metricFor(x.c.metric), totals.blue), size: x.strength >= LARGE_STRENGTH ? "large" : "notable", ...insightCopy(x.c, x.lead, trail, totals, x.delta) });
    if (out.length === MAX_INSIGHTS) break;
  }
  return out;
};

// ── Key performances ─────────────────────────────────────────────────────────
const distinctions = (p, team) => {
  const d = [];
  const tens = ["pts", "reb", "ast", "stl", "blk"].filter((k) => p[k] >= 10).length;
  if (tens >= 3) d.push("TRIPLE_DOUBLE"); else if (tens === 2) d.push("DOUBLE_DOUBLE");
  const max = (k) => Math.max(...team.map((x) => x[k]));
  if (p.reb >= 8 && p.reb === max("reb")) d.push("TEAM_HIGH_REBOUNDS");
  if (p.ast >= 6 && p.ast === max("ast")) d.push("TEAM_HIGH_ASSISTS");
  if (p.tpm >= 4 && p.tpm === max("tpm")) d.push("TEAM_HIGH_THREES");
  if (p.stl + p.blk >= 4) d.push("DEFENSIVE_LINE");
  if (p.pts >= 20 && p.fga > 0 && p.fgm / p.fga >= 0.6) d.push("EFFICIENT_SCORING");
  return d;
};
const lineOf = (p) => {
  const parts = [`${p.pts} PTS`];
  for (const [k, label, min] of LINE_EXTRAS) { if (parts.length >= 4) break; if (p[k] >= min) parts.push(`${p[k]} ${label}`); }
  return { stats: parts.join(" · "), shooting: p.fga > 0 ? `${p.fgm}-${p.fga} FG${p.tpa > 0 ? ` · ${p.tpm}-${p.tpa} 3PT` : ""}` : "0-0 FG" };
};
export const selectPerformances = (roster) => {
  const team = (Array.isArray(roster) ? roster : []).map((p, i) => ({ ...player(p), _i: i }));
  if (!team.length) return [];
  const scorer = [...team].sort((a, b) => (b.pts - a.pts) || ((b.reb + b.ast) - (a.reb + a.ast)) || (a.to - b.to) || (a._i - b._i))[0];
  const picks = [{ p: scorer, label: "LEADING_SCORER", extra: distinctions(scorer, team) }];
  const rest = team.filter((p) => p !== scorer).map((p) => ({ p, d: distinctions(p, team) })).filter((x) => x.d.length > 0)
    .sort((a, b) => (b.d.length - a.d.length) || (b.p.pts - a.p.pts) || (a.p._i - b.p._i));
  if (rest.length && MAX_PERFORMANCES_PER_TEAM > 1) picks.push({ p: rest[0].p, label: rest[0].d[0], extra: rest[0].d.slice(1) });
  return picks.map(({ p, label, extra }) => ({ name: p.name, pos: p.pos, label: PERFORMANCE_LABELS[label], also: extra.filter((x) => x !== label).map((x) => PERFORMANCE_LABELS[x]), ...lineOf(p),
    box: { pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, to: p.to, fgm: p.fgm, fga: p.fga, tpm: p.tpm, tpa: p.tpa, ftm: p.ftm, fta: p.fta } }));
};

// ── Game flow (period level only) ────────────────────────────────────────────
const periodLabel = (i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ""}`);
export const buildFlow = (periods, final) => {
  if (!Array.isArray(periods) || periods.length < 4) return null;
  const rows = []; let g = 0, b = 0;
  const ordered = [...periods].map((p, i) => ({ ...p, _i: i })).sort((x, y) => (n(x.period) ?? x._i) - (n(y.period) ?? y._i));
  for (let i = 0; i < ordered.length; i++) {
    const pg = int(ordered[i].gold), pb = int(ordered[i].blue);
    if (pg === null || pb === null) return null;
    g += pg; b += pb;
    rows.push({ label: periodLabel(i), gold: pg, blue: pb, goldTotal: g, blueTotal: b, leader: g > b ? "gold" : b > g ? "blue" : "tied", wonBy: pg > pb ? "gold" : pb > pg ? "blue" : "even" });
  }
  const consistent = !final || (g === int(final.gold) && b === int(final.blue));
  if (!consistent) return null;   // a period ledger that does not add up to the final is not shown
  const half = rows[1];
  const secondHalf = rows.slice(2, 4).reduce((a, r) => ({ gold: a.gold + r.gold, blue: a.blue + r.blue }), { gold: 0, blue: 0 });
  const won = { gold: rows.slice(0, 4).filter((r) => r.wonBy === "gold").length, blue: rows.slice(0, 4).filter((r) => r.wonBy === "blue").length };
  const facts = [];
  facts.push(half.leader === "tied" ? `Tied ${half.goldTotal}–${half.blueTotal} at halftime.` : `${TEAM[half.leader]} led ${Math.max(half.goldTotal, half.blueTotal)}–${Math.min(half.goldTotal, half.blueTotal)} at halftime.`);
  if (secondHalf.gold !== secondHalf.blue) { const s = secondHalf.gold > secondHalf.blue ? "gold" : "blue"; facts.push(`${TEAM[s]} outscored ${TEAM[s === "gold" ? "blue" : "gold"]} ${Math.max(secondHalf.gold, secondHalf.blue)}–${Math.min(secondHalf.gold, secondHalf.blue)} after halftime.`); }
  else facts.push(`The second half was even at ${secondHalf.gold}–${secondHalf.blue}.`);
  facts.push(`Gold won ${won.gold} of 4 quarters; Blue won ${won.blue}${4 - won.gold - won.blue ? `; ${4 - won.gold - won.blue} ${plural(4 - won.gold - won.blue, "was", "were")} level` : ""}.`);
  if (rows.length > 4) facts.push(`Decided in ${rows.length - 4 === 1 ? "overtime" : `${rows.length - 4} overtimes`}.`);
  return { granularity: "period", periods: rows, halftime: { gold: half.goldTotal, blue: half.blueTotal }, secondHalf, quartersWon: won, overtimes: rows.length - 4, facts };
};

// ── The projection ───────────────────────────────────────────────────────────
/**
 * The breakdown for one completed result. `{ available: false, reason }` when
 * the result lacks the recorded box score (an older engine path, a result
 * still simulating) — the surface then says nothing rather than guessing.
 */
export const buildBreakdown = (result) => {
  const src = readSource(result);
  const base = { breakdownVersion: CLASH_BREAKDOWN_VERSION };
  const fg = int(src.final?.gold), fb = int(src.final?.blue);
  if (fg === null || fb === null) return { ...base, available: false, reason: "no_final_score" };
  if (!src.box || !src.box.gold.length || !src.box.blue.length) return { ...base, available: false, reason: "no_box_score" };
  const box = { gold: src.box.gold, blue: src.box.blue };
  const { totals, source, consistent } = teamTotals({ ...src, box: src.box });
  const scoreMatches = totals.gold.pts === fg && totals.blue.pts === fb;
  const teamComparison = TEAM_METRICS
    .filter((m) => m.key !== "possessions" || (totals.gold.possessions !== null && totals.gold.possessions !== undefined && totals.blue.possessions !== null && totals.blue.possessions !== undefined))
    .map((m) => ({ key: m.key, label: m.label, direction: m.direction, gold: display(m, totals.gold), blue: display(m, totals.blue), stronger: stronger(m, metricValue(m, totals.gold), metricValue(m, totals.blue)) }));
  const insights = scoreMatches ? selectInsights(totals) : [];
  const flow = buildFlow(src.periods, src.final);
  return {
    ...base, available: true, keyPerformanceRuleVersion: KEY_PERFORMANCE_RULE_VERSION,
    resultId: src.id ? safeText(src.id, 24) : null,
    score: { gold: fg, blue: fb, winner: fg > fb ? "gold" : fb > fg ? "blue" : "tied", margin: Math.abs(fg - fb) },
    keyDifferences: insights, balanced: insights.length === 0, balancedLine: insights.length === 0 ? BALANCED_LINE : null,
    teamComparison,
    playerPerformances: { gold: selectPerformances(box.gold), blue: selectPerformances(box.blue) },
    gameFlow: flow,
    dataCoverage: {
      totalsSource: source, boxMatchesTotals: consistent, totalsMatchFinalScore: scoreMatches,
      gameFlow: flow ? "period" : "unavailable", deferred: DEFERRED.map((d) => d.metric),
    },
  };
};
