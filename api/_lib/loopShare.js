// Public recap V2 is a separate, explicitly published surface from Cards V1
// and governed spoiler-safe invitations. Never spread an engine record here.
import { createHash } from "node:crypto";
import { getJSON, setNX } from "./store.js";
import { readAuthoritativeResult } from "./cloudAccounts.js";
import { loadRun, ownsRun } from "./chaosRun.js";
import { finalScoreOf, savedRosterOf } from "./resultContract.js";

export const SHARE_VERSION = "2.0.0";
export const SHARE_TTL = 180 * 24 * 60 * 60;
export const validShareId = (id) => /^[a-z0-9]{6,16}$/.test(String(id || ""));
const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
const text = (s, n = 140) => typeof s === "string" ? s.slice(0, n) : "";
const rosterOk = (ids) => Array.isArray(ids) && ids.length === 5;
const MODE_LABELS = Object.freeze({ chaos:"Chaos Clash", "any-five":"Clash Any Five", daily:"Daily Clash", franchise:"Franchise Clash", tonight:"Tonight’s Clash", spin:"Chaos Spin", "one-franchise":"One Franchise", "one-per-era":"One Per Era", "no-mvps":"No MVPs", gauntlet:"Era Gauntlet", lab:"What-If Lab" });
const validDay = (day) => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0,10) === day;
const showStat = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : "—";
const rebounds = (row) => row.reb ?? (num(row.oreb) !== null && num(row.dreb) !== null ? row.oreb + row.dreb : null);
const pointsLine = (row, scope) => `${showStat(row.pts)} PTS · ${showStat(rebounds(row))} REB · ${showStat(row.ast)} AST${scope === "series" ? " / game" : ""}`;

export function publicRecapOf(record) {
  if (!record || record.core_result_status === "failed" || !rosterOk(record.goldIds)) return null;
  const kind = ["single", "daily", "challenge", "best7", "82", "tournament"].includes(record.mode) ? record.mode : "single";
  const lastRound = kind === "tournament" ? record.rounds?.at(-1) : null;
  const view = lastRound ? { ...record, core: lastRound.core, v3: lastRound.v3, blueIds: lastRound.oppIds } : record;
  const score = kind === "82" ? { gold: num(record.wins), blue: num(record.losses) }
    : view.core?.isSeries || kind === "best7" ? view.core?.seriesScore : finalScoreOf(view);
  if (num(score?.gold) === null || num(score?.blue) === null || !rosterOk(view.blueIds)) return null;
  const series = !!view.core?.isSeries || kind === "best7";
  const statScope = series ? "series" : kind === "82" ? "season finale" : "game";
  const baseScope = kind === "82" ? "82-game record · finale performers" : kind === "tournament" ? `${text(lastRound?.name, 40)} · series games won` : series ? "Best of seven · games won" : "Final score";
  const displayMode = MODE_LABELS[record.loop?.mode] ? record.loop.mode : record.chaosDraft ? "chaos" : kind;
  const day = displayMode === "daily" && validDay(record.loop?.day || record.dailyDate) ? record.loop?.day || record.dailyDate : null;
  const stage = displayMode === "gauntlet" && Number.isInteger(record.loop?.stage) && record.loop.stage >= 1 && record.loop.stage <= 7 ? record.loop.stage : null;
  const progress = displayMode === "gauntlet" ? record.loop?.gauntlet : null;
  const gauntlet = progress && Number.isInteger(progress.victories) && progress.victories >= 0 && progress.victories <= 7
    && progress.totalEras === 7 && Number.isInteger(progress.stagesPlayed) && progress.stagesPlayed >= 1 && progress.stagesPlayed <= 7
    && progress.victories <= progress.stagesPlayed && typeof progress.finished === "boolean"
    && (progress.finished ? progress.stagesPlayed === 7 || progress.victories < progress.stagesPlayed : progress.stagesPlayed < 7 && progress.victories === progress.stagesPlayed)
    ? { victories: progress.victories, totalEras: 7, stagesPlayed: progress.stagesPlayed, finished: progress.finished } : null;
  const scope = gauntlet ? `Era Gauntlet · ${gauntlet.victories} of 7 eras won · ${gauntlet.finished ? "Completed run" : "Run in progress"} · Latest stage points` : MODE_LABELS[displayMode] ? `${MODE_LABELS[displayMode]}${day ? ` ${day}` : ""}${stage ? ` · stage ${stage} of 7` : ""} · ${baseScope}${displayMode === "lab" ? " · Imagined scenario" : ""}` : baseScope;
  const loop = MODE_LABELS[record.loop?.mode] ? { mode: displayMode, tag: displayMode.replaceAll("-", "_").toUpperCase(), ...(day ? { day } : {}), ...(stage ? { stage } : {}), ...(gauntlet ? { gauntlet } : {}) } : null;
  const gold = savedRosterOf(record.goldIds, view, "gold");
  const blue = savedRosterOf(view.blueIds, view, "blue");
  if ([...gold, ...blue].some((p) => !p.name)) return null;
  const rows = series ? [...(view.core?.teamAStats || []), ...(view.core?.teamBStats || [])] : [...(view.v3?.fullBox?.gold || view.core?.teamAStats || []), ...(view.v3?.fullBox?.blue || view.core?.teamBStats || [])];
  const performers = rows.filter((p) => p?.name && num(p.pts) !== null).sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name)).slice(0, 2).map((p) => ({ name: text(p.name, 40), line: pointsLine(p, statScope) }));
  const won = kind === "tournament" ? !!record.won : kind === "82" ? score.gold > score.blue : String(view.core?.winner || "").toLowerCase() === "gold" || score.gold > score.blue;
  const headline = gauntlet ? `Era Gauntlet · ${gauntlet.victories} of 7 eras` : kind === "82" ? `${score.gold} wins, ${score.blue} losses` : kind === "tournament" ? (record.won ? "Tournament champions" : `Run ended in ${text(lastRound?.name, 40)}`) : `${won ? "Gold wins" : score.gold === score.blue ? "Draw" : "Blue wins"} ${score.gold}–${score.blue}`;
  return {
    v: 2, shareVersion: SHARE_VERSION, authoritative: true, kind, displayMode, ...(loop ? { loop } : {}),
    teamIds: gold.map((p) => p.id), oppIds: blue.map((p) => p.id), players: { gold, blue },
    score: { gold: score.gold, blue: score.blue }, scoreline: `${score.gold}–${score.blue}`, won,
    headline, scope, statScope, performers, mvp: text(view.core?.mvp, 40) || null,
    mvpLine: view.core?.mvpLine ? pointsLine(view.core.mvpLine, statScope) : null,
    era: text(record.eraId, 32) || null, insight: "A simulated matchup across basketball eras.",
    ts: Number.isFinite(record.created_at) ? record.created_at : null,
  };
}

export async function publishOwnedRecap({ resultId, chaosRunId, session, consent }, deps = {}) {
  if (consent !== true) return { status: "consent_required" };
  if (!session) return { status: "not_your_result" };
  let id = resultId;
  if (chaosRunId) {
    const run = await (deps.loadRun || loadRun)(chaosRunId);
    if (!run || !ownsRun(run, session)) return { status: "not_your_result" };
    if (run.status !== "SIMULATED" || !run.resultId) return { status: "not_simulated" };
    id = run.resultId;
  }
  const record = await (deps.readResult || readAuthoritativeResult)(id);
  if (!record) return { status: "not_found" };
  if (record.session !== session) return { status: "not_your_result" };
  const recap = publicRecapOf(record);
  if (!recap) return { status: "not_simulated" };
  // One immutable public URL for this result + disclosure version, including
  // concurrent requests. No session, account, secret seed or record id in GET.
  const shareId = createHash("sha256").update(`${SHARE_VERSION}|${id}`).digest("hex").slice(0, 16);
  const prior = await (deps.get || getJSON)(`re:${shareId}`);
  let created = false;
  if (!prior) {
    created = !!(await (deps.set || setNX)(`re:${shareId}`, recap, SHARE_TTL));
    if (!created && !(await (deps.get || getJSON)(`re:${shareId}`))) return { status: "store_unavailable" };
  }
  return { status: "published", created, id: shareId, path: `/card/${shareId}`, disclosure: "Public score, both lineups and game performers; no account name or hidden draft." };
}

export const shareModel = (r) => ({
  title: r.headline || "Basketball across eras", subtitle: r.scope || "Public recap",
  score: r.score || null, goldName: r.kind === "82" ? "WINS" : "GOLD FIVE", blueName: r.kind === "82" ? "LOSSES" : "BLUE FIVE",
  players: r.players || { gold: [], blue: [] }, performers: r.performers || [],
  footer: "Run it back with your five · EraClash Basketball",
});
