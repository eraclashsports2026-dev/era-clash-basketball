// ── AI narrative layer (never authoritative) ───────────────────────────────────
// Generates the enhanced recap FROM a stored, immutable core result. The model
// explains; it cannot change winners, scores, or stats. Wrapped in: explicit
// timeout, bounded retry with jitter, global per-minute/per-day budgets, and a
// circuit breaker so provider outages never cascade into gameplay failures.
import { PLAYERS } from "../../src/players.js";
import { hasStore, cmd, dayKey } from "./store.js";
import { limits } from "./flags.js";

// Exported so the narrative cache identity can name the exact model that
// produced a narrative. Swapping models MUST produce a cache miss — text
// written by a different model is a different artefact.
export const MODEL = "claude-sonnet-4-6";
export const PROVIDER = "anthropic";
const MODEL_NAME = MODEL;

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

// V3 records carry possession truths instead of V2 chemistry notes — the
// narrative is grounded in whichever engine actually decided the game.
const v3Notes = (result) => {
  const v = result.v3;
  const roleLine = (side) => (v.usage?.[side] || []).map((u) => `${nameOf(u.id)} ${Math.round(u.share * 100)}% (${u.role})`).join(", ");
  const adj = [...(v.adjustments?.gold || []).map((a) => `Gold: ${a}`), ...(v.adjustments?.blue || []).map((a) => `Blue: ${a}`)];
  return `Era Style: ${result.eraId} environment, ${v.possessions} possessions${v.overtimes ? ` (${v.overtimes} OT)` : ""}. Pre-game read: ${v.expectedBand || "even"}; outcome class: ${v.outcomeClass || "n/a"} (never rewrite the pre-game read to flatter the winner).
Gold offensive roles (usage): ${roleLine("gold")}
Blue offensive roles (usage): ${roleLine("blue")}
Shot quality (expected points from the looks each team generated): Gold ${Math.round(v.expectedPoints?.gold ?? 0)}, Blue ${Math.round(v.expectedPoints?.blue ?? 0)}. CONCLUSION (already computed — state this, do not re-derive it): ${(() => {
    const g = v.expectedPoints?.gold ?? 0, b = v.expectedPoints?.blue ?? 0, w = result.core.winner;
    const wx = w === "Gold" ? g : b, lx = w === "Gold" ? b : g;
    if (Math.abs(g - b) < 4) return `both teams generated similar shot quality, so the difference was conversion and possessions — do NOT claim either side won on shot quality.`;
    return wx > lx
      ? `Team ${w} won AND generated the better looks — their shot quality, not luck, drove it.`
      : `Team ${w} won DESPITE generating worse looks — they won on shot-making, converting tougher shots. Say this honestly; do not credit them with better shot quality.`;
  })()}
In-game coaching adjustments that actually happened: ${adj.length ? adj.join(" | ") : "none"}
There are no chemistry bonuses in this engine — explain the result through possessions, roles, matchups, and the era environment only.`;
};

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
Positional duels and WHO ACTUALLY GUARDED WHOM (from the engine — never contradict these matchups or invent your own): ${(core.slotDuels || []).map((d) => `${d.pos}: ${d.gold.name} (${d.gold.pts}p/${d.gold.reb}r/${d.gold.ast}a${d.gold.guardedBy ? `, guarded by ${d.gold.guardedBy}` : ""}) vs ${d.blue.name} (${d.blue.pts}p/${d.blue.reb}r/${d.blue.ast}a${d.blue.guardedBy ? `, guarded by ${d.blue.guardedBy}` : ""})`).join(" | ") || "(not recorded — do NOT invent defensive matchups; write about the box score instead)"}
${result.v3 ? v3Notes(result) : `Gold chemistry notes: +${(result.goldChem?.strengths || []).join(", +") || "none"}; -${(result.goldChem?.weaknesses || []).join(", -") || "none"}
Blue chemistry notes: +${(result.blueChem?.strengths || []).join(", +") || "none"}; -${(result.blueChem?.weaknesses || []).join(", -") || "none"}`}

Respond ONLY with valid JSON (no markdown):
{"summary":"4-6 analytical sentences explaining WHY Team ${core.winner} won. REQUIRED: break down at least two specific positional duels BY NAME from the list above, and when you say a defender guarded someone it MUST match the 'guarded by' pairings above exactly — never assert a matchup that is not listed (who outplayed whom, citing their actual lines), name the losing side's best individual performance and why it wasn't enough, and tie it to the structural edges. No generic praise — every claim must trace to the numbers above. Max 160 words.","teamAStrengths":["max 10 words","max 10 words","max 10 words"],"teamAWeaknesses":["max 10 words","max 10 words"],"teamBStrengths":["max 10 words","max 10 words","max 10 words"],"teamBWeaknesses":["max 10 words","max 10 words"],"mvpReason":"2-3 sentences explaining WHY ${core.mvp} earned MVP: cite the actual line above, what that production did to the opposing defense, and how it decided the outcome. Max 70 words.","turningPoint":"4-6 sentences describing the pivotal stretch: what shifted, which specific positional duel drove it (BY NAME, consistent with the duels and the 'guarded by' pairings above), how the opponent's best player tried to answer and why it failed, and how it decided the ${result.mode === "best7" ? "series" : "game"}. No invented exact timestamps. Max 150 words."}`;
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

  // Two budgets, both tied to the platform function limit (vercel.json
  // maxDuration): aiTotalBudgetMs caps the WHOLE handler so we always return a
  // clean MODEL_TIMEOUT instead of a raw platform 504, and aiTimeoutMs caps a
  // single attempt. The per-attempt cap must exceed real recap latency — when
  // it was set below it, attempt 1 always aborted and the retry doubled the
  // user's wait for no reason.
  const deadline = Date.now() + limits().aiTotalBudgetMs;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await sleep(400 + Math.random() * 400); // backoff + jitter
      if (Date.now() >= deadline - 2000) break; // no time for a real second try
    }
    const controller = new AbortController();
    const remaining = deadline - Date.now();
    const timer = setTimeout(() => controller.abort(), Math.max(2000, Math.min(aiTimeoutMs, remaining)));
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
          model: MODEL_NAME, max_tokens: 1100,
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
        model: MODEL_NAME,
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
