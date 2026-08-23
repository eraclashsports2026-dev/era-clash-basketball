// ── AI narrative layer (never authoritative) ───────────────────────────────────
// Generates the enhanced recap FROM a stored, immutable core result. The model
// explains; it cannot change winners, scores, or stats. Wrapped in: explicit
// timeout, bounded retry with jitter, global per-minute/per-day budgets, and a
// circuit breaker so provider outages never cascade into gameplay failures.
import { PLAYERS } from "../../src/players.js";
import { hasStore, cmd, dayKey } from "./store.js";
import { limits } from "./flags.js";

const MODEL = "claude-sonnet-4-6";

// ── Circuit breaker (KV-backed fixed window; in-memory fallback) ──────────────
const memCircuit = { window: 0, fails: 0 };
const windowId = (sec) => Math.floor(Date.now() / (sec * 1000));

export const circuitState = async () => {
  const { aiFailThreshold, aiCircuitWindowSec } = limits();
  const w = windowId(aiCircuitWindowSec);
  let fails;
  if (hasStore()) fails = Number(await cmd("GET", `circuit:ai:${w}`)) || 0;
  else fails = memCircuit.window === w ? memCircuit.fails : 0;
  // OPEN while the current window has ≥ threshold failures; a new window is
  // automatically HALF_OPEN (fresh counter lets a few test calls through).
  return fails >= aiFailThreshold ? "OPEN" : fails > 0 ? "HALF_OPEN" : "CLOSED";
};

const recordFailure = async () => {
  const { aiCircuitWindowSec } = limits();
  const w = windowId(aiCircuitWindowSec);
  if (hasStore()) {
    const n = await cmd("INCR", `circuit:ai:${w}`);
    if (Number(n) === 1) await cmd("EXPIRE", `circuit:ai:${w}`, aiCircuitWindowSec * 2);
  } else {
    if (memCircuit.window !== w) { memCircuit.window = w; memCircuit.fails = 0; }
    memCircuit.fails++;
  }
};

// ── Global AI budgets ──────────────────────────────────────────────────────────
export const aiBudgetAvailable = async () => {
  const { maxAiPerMinute, maxAiPerDay } = limits();
  if (!hasStore()) return true; // fail open; per-IP limits still apply
  const minute = Math.floor(Date.now() / 60000);
  const [m, d] = await Promise.all([
    cmd("INCR", `ai:min:${minute}`),
    cmd("INCR", `ai:day:${dayKey()}`),
  ]);
  await cmd("EXPIRE", `ai:min:${minute}`, 120);
  await cmd("EXPIRE", `ai:day:${dayKey()}`, 60 * 60 * 48);
  return Number(m) <= maxAiPerMinute && Number(d) <= maxAiPerDay;
};

// ── Prompt: explain a decided game — cannot change it ──────────────────────────
const nameOf = (id) => PLAYERS.find((p) => p.id === id)?.name || id;

const buildPrompt = (result) => {
  const core = result.core;
  const line = (row) => `${row.name}: ${row.pts}pts ${row.reb}reb ${row.ast}ast ${row.stl}stl ${row.blk}blk`;
  return `You are an expert NBA broadcast analyst. A simulated ${result.mode === "best7" ? "best-of-7 series" : "game"} between Team Gold and Team Blue has ALREADY been decided by the game engine. Your job is to explain and dramatize the FIXED result below. You must not contradict any number or the winner.

FINAL (authoritative, do not alter): winner=Team ${core.winner}, result=${core.seriesResult}
Team Gold lineup: ${result.goldIds.map(nameOf).join(", ")}
Team Blue lineup: ${(result.blueIds || []).map(nameOf).join(", ")}
Team Gold box: ${core.teamAStats.map(line).join(" | ")}
Team Blue box: ${core.teamBStats.map(line).join(" | ")}
MVP (fixed): ${core.mvp}
Pre-game edges: ${core.edges.map((e) => `${e.category}: ${e.edge === 0 ? "even" : `${e.edge > 0 ? "Gold" : "Blue"} +${Math.abs(e.edge)}`}`).join(", ")} (never write negative edge numbers — always name the side with the advantage)
Positional duels (Gold vs Blue, same slot): ${(core.slotDuels || []).map((d) => `${d.pos}: ${d.gold.name} (${d.gold.pts}p/${d.gold.reb}r/${d.gold.ast}a) vs ${d.blue.name} (${d.blue.pts}p/${d.blue.reb}r/${d.blue.ast}a)`).join(" | ")}
Gold chemistry notes: +${result.goldChem.strengths.join(", +") || "none"}; -${result.goldChem.weaknesses.join(", -") || "none"}
Blue chemistry notes: +${(result.blueChem?.strengths || []).join(", +") || "none"}; -${(result.blueChem?.weaknesses || []).join(", -") || "none"}

Respond ONLY with valid JSON (no markdown):
{"summary":"4-6 analytical sentences explaining WHY Team ${core.winner} won. REQUIRED: break down at least two specific positional duels BY NAME from the list above (who outplayed whom, citing their actual lines), name the losing side's best individual performance and why it wasn't enough, and tie it to the structural edges. No generic praise — every claim must trace to the numbers above. Max 160 words.","teamAStrengths":["max 10 words","max 10 words","max 10 words"],"teamAWeaknesses":["max 10 words","max 10 words"],"teamBStrengths":["max 10 words","max 10 words","max 10 words"],"teamBWeaknesses":["max 10 words","max 10 words"],"mvpReason":"2-3 sentences explaining WHY ${core.mvp} earned MVP: cite the actual line above, what that production did to the opposing defense, and how it decided the outcome. Max 70 words.","turningPoint":"4-6 sentences describing the pivotal stretch: what shifted, which specific positional duel drove it (BY NAME, consistent with the duels above), how the opponent's best player tried to answer and why it failed, and how it decided the ${result.mode === "best7" ? "series" : "game"}. No invented exact timestamps. Max 150 words."}`;
};

// Validate narrative output: text-only fields, capped lengths. The narrative
// can NEVER alter core numbers because we only accept these string fields.
const validateNarrative = (n) => {
  if (!n || typeof n !== "object") return null;
  const str = (s, max) => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null);
  const arr = (a, count, max) => Array.isArray(a) ? a.slice(0, count).map((s) => str(s, max)).filter(Boolean) : [];
  const summary = str(n.summary, 1400);
  if (!summary) return null;
  return {
    summary,
    teamAStrengths: arr(n.teamAStrengths, 3, 80),
    teamAWeaknesses: arr(n.teamAWeaknesses, 2, 80),
    teamBStrengths: arr(n.teamBStrengths, 3, 80),
    teamBWeaknesses: arr(n.teamBWeaknesses, 2, 80),
    mvpReason: str(n.mvpReason, 550),
    turningPoint: str(n.turningPoint, 1400),
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Generate a narrative for a stored result. Returns
//   { ok:true, narrative, usage } | { ok:false, code }
export const generateNarrative = async (result, apiKey, chaos) => {
  if ((await circuitState()) === "OPEN") return { ok: false, code: "MODEL_UNAVAILABLE" };
  if (!(await aiBudgetAvailable())) return { ok: false, code: "MODEL_RATE_LIMITED" };

  const { aiTimeoutMs } = limits();
  const prompt = buildPrompt(result);
  let lastCode = "MODEL_UNAVAILABLE";

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(500 + Math.random() * 1000); // backoff + jitter
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), aiTimeoutMs);
    try {
      // chaos hooks (test/dev only — gated in the handler)
      if (chaos === "ai-timeout") { await sleep(aiTimeoutMs + 500); throw Object.assign(new Error("chaos"), { name: "AbortError" }); }
      if (chaos === "ai-500") throw new Error("chaos 500");
      const started = Date.now();
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL, max_tokens: 1400,
          messages: [{ role: "user", content: chaos === "ai-invalid" ? "Reply with the word banana only." : prompt }],
        }),
      });
      clearTimeout(timer);
      if (res.status === 429) { lastCode = "MODEL_RATE_LIMITED"; await recordFailure(); continue; }
      if (!res.ok) { lastCode = "MODEL_UNAVAILABLE"; await recordFailure(); continue; }
      const data = await res.json();
      const text = data.content?.find((b) => b.type === "text")?.text || "";
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      let parsed = null;
      try { parsed = JSON.parse(text.slice(s, e + 1)); } catch { /* invalid */ }
      const narrative = validateNarrative(parsed);
      if (!narrative) { lastCode = "MODEL_INVALID_OUTPUT"; await recordFailure(); continue; }
      const usage = {
        model: MODEL,
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        latency_ms: Date.now() - started,
        retries: attempt,
      };
      if (hasStore()) {
        await cmd("HINCRBY", "ai:usage", "calls", 1);
        await cmd("HINCRBY", "ai:usage", "tokens", usage.input_tokens + usage.output_tokens);
      }
      return { ok: true, narrative, usage };
    } catch (err) {
      clearTimeout(timer);
      lastCode = err?.name === "AbortError" ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE";
      await recordFailure();
    }
  }
  return { ok: false, code: lastCode };
};
