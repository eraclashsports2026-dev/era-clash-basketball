// ── Chaos Clash client ───────────────────────────────────────────────────────
// Every action is a POST to /api/game. The client submits DECISIONS only: which
// slots to hold, which offered coach to take. It has no way to name a player,
// choose the era, or see a future card, because the server never sends one.
const post = async (body) => {
  const res = await fetch("/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status === 403 && json?.gated) return { gated: true, gate: json.gate, guestRunsUsed: json.guestRunsUsed };
  if (!res.ok) throw Object.assign(new Error(json?.error || "Chaos request failed"), { code: json?.code, status: res.status });
  return json;
};

export const startChaos = (opts = {}) => post({ chaosAction: "start", tier: opts.tier || "GUEST", challengeId: opts.challengeId || undefined });
export const viewChaos = (chaosRunId, tier) => post({ chaosAction: "view", chaosRunId, tier });
export const submitChaosHolds = (chaosRunId, holdSlots, tier) => post({ chaosAction: "holds", chaosRunId, holdSlots, tier });
export const submitChaosCoachHolds = (chaosRunId, holdRoles, tier) => post({ chaosAction: "coachHolds", chaosRunId, holdRoles, tier });
export const chooseChaosCoach = (chaosRunId, coachId, tier) => post({ chaosAction: "coach", chaosRunId, coachId, tier });
export const abandonChaos = (chaosRunId, tier) => post({ chaosAction: "abandon", chaosRunId, tier });
export const publishChaosChallenge = (chaosRunId, tier) => post({ chaosAction: "challenge", chaosRunId, tier });
export const simulateChaos = (chaosRunId, simulationId, tier) =>
  post({ chaosAction: "simulate", chaosRunId, simulationId, tier });
