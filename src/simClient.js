// ── Simulation client ──────────────────────────────────────────────────────────
// Single path for every LLM-backed simulation:
//   validate input → dedupe in-flight → call /api/simulate (idempotent by
//   simulation_id) → parse → VALIDATE the model output → retry once → track.
// Never assume the JSON is valid, fields exist, or totals reconcile.
import { track } from "./analytics.js";
import { reportError } from "./errors.js";
import { VERSIONS } from "./versions.js";
import { teamRating, analyzeBalance } from "./rating.js";
import { matchupEdges } from "./engine.js";

const newSimId = () => {
  try { return crypto.randomUUID(); } catch { return `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};

// ── Model-output validation ────────────────────────────────────────────────────
// Returns { ok, errors[] }. A sim that fails here is treated as a failed API
// call (retry / graceful error) — never shown to the user as a real result.
export const validateSim = (sim, myTeam, oppTeam, seriesType) => {
  const errors = [];
  if (!sim || typeof sim !== "object") return { ok: false, errors: ["not an object"] };

  const winner = String(sim.winner || "").toLowerCase();
  if (!winner.includes("gold") && !winner.includes("blue")) errors.push("winner missing/invalid");

  const box = (stats, label) => {
    if (!Array.isArray(stats) || stats.length !== 5) { errors.push(`${label} box missing`); return null; }
    for (const s of stats) {
      if (!s || typeof s.name !== "string") { errors.push(`${label} row invalid`); return null; }
      for (const k of ["pts", "reb", "ast", "stl", "blk"]) {
        const v = Number(s[k]);
        if (!Number.isFinite(v) || v < 0 || v > 120) { errors.push(`${label} ${k} out of range`); return null; }
        s[k] = v;
      }
    }
    return stats;
  };
  const boxA = box(sim.teamAStats, "teamA");
  const boxB = box(sim.teamBStats, "teamB");

  if (boxA && boxB) {
    const totA = boxA.reduce((s, r) => s + r.pts, 0);
    const totB = boxB.reduce((s, r) => s + r.pts, 0);
    const goldWon = winner.includes("gold");
    // winner's box must out-total the loser's (per prompt contract)
    if ((goldWon && totA <= totB) || (!goldWon && totB <= totA)) errors.push("winner/box mismatch");
  }

  if (seriesType === "series7") {
    const m = String(sim.seriesResult || "").match(/^(\d)\s*-\s*(\d)$/);
    if (!m) errors.push("seriesResult not W-L");
    else {
      const [w, l] = [Number(m[1]), Number(m[2])];
      const hi = Math.max(w, l), lo = Math.min(w, l);
      if (hi !== 4 || lo > 3) errors.push("series winner must have exactly 4 wins");
      else {
        const goldWon = winner.includes("gold");
        if ((goldWon && w !== 4) || (!goldWon && l !== 4)) errors.push("series score contradicts winner");
      }
    }
  }

  if (sim.mvp) {
    const names = [...myTeam, ...oppTeam].map((p) => p.name.toLowerCase());
    if (!names.some((n) => String(sim.mvp).toLowerCase().includes(n.split(" ").slice(-1)[0]))) {
      errors.push("MVP not in game");
    }
  } else errors.push("mvp missing");

  return { ok: errors.length === 0, errors };
};

const parseModelText = (raw) => {
  const cleaned = String(raw).replace(/```json|```/g, "");
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
};

// ── In-flight dedupe ───────────────────────────────────────────────────────────
// A double-click on SIMULATE reuses the same promise — one network call, one
// model bill. Keyed by team ids + mode.
const inflight = new Map();
const flightKey = (myTeam, oppTeam, seriesType) =>
  `${myTeam.map((p) => p.id).join(",")}|${oppTeam.map((p) => p.id).join(",")}|${seriesType}`;

// ── Main entry ─────────────────────────────────────────────────────────────────
// runSimulation(myTeam, oppTeam, seriesType, {mode}) → structured result:
// the validated model sim + engine-computed edges/ratings + version metadata.
export const runSimulation = (myTeam, oppTeam, seriesType, { mode = "single", maxRetries = 1 } = {}) => {
  const key = flightKey(myTeam, oppTeam, seriesType);
  if (inflight.has(key)) return inflight.get(key);
  const p = _run(myTeam, oppTeam, seriesType, mode, maxRetries).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

async function _run(myTeam, oppTeam, seriesType, mode, maxRetries) {
  const simulation_id = newSimId();
  const started = Date.now();
  const myRating = teamRating(myTeam);
  const chem = analyzeBalance(myTeam);
  track("simulation_started", { mode, simulation_id, series_type: seriesType, team_rating: myRating, chemistry_multiplier: chem.multiplier });

  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          myTeam: myTeam.filter(Boolean),
          oppTeam: oppTeam.filter(Boolean),
          seriesType,
          simulationId: simulation_id,
        }),
      });
      if (res.status === 429) throw Object.assign(new Error("You're simulating too fast — give it a few seconds."), { friendly: true, noRetry: true });
      if (!res.ok) throw new Error(`sim http ${res.status}`);
      const payload = await res.json();
      const sim = parseModelText(payload.text || "");
      const check = validateSim(sim, myTeam, oppTeam, seriesType);
      if (!check.ok) throw new Error(`invalid model output: ${check.errors.join("; ")}`);

      const latency = Date.now() - started;
      track("simulation_completed", {
        mode, simulation_id, series_type: seriesType, latency_ms: latency,
        retry_count: attempt, cached: !!payload.cached,
        result: String(sim.winner).toLowerCase().includes("gold") ? "win" : "loss",
        team_rating: myRating, opp_rating: teamRating(oppTeam),
        chemistry_multiplier: chem.multiplier,
      });

      return {
        ...sim,
        simulation_id,
        engine: "llm",
        versions: { ...VERSIONS },
        edges: matchupEdges(myTeam, oppTeam),
        ratings: { gold: myRating, blue: teamRating(oppTeam) },
        chemistry: { gold: chem, blue: analyzeBalance(oppTeam) },
      };
    } catch (err) {
      lastErr = err;
      if (err.noRetry) break;
    }
  }

  track("simulation_failed", { mode, simulation_id, series_type: seriesType, latency_ms: Date.now() - started, error: String(lastErr?.message).slice(0, 120) });
  reportError("simulation", lastErr);
  throw lastErr?.friendly ? lastErr : new Error("Simulation failed. Your attempt was not used — please try again.");
}
