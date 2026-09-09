// ── Narrative evidence packet and claim validation ───────────────────────────
// Phase 7B. The recap is written by a model from a finished result. Two things
// must hold and previously did not:
//
//  1. EVIDENCE CLASSIFICATION. What the simulation recorded (score, lines,
//     period scores, assignments, adjustments) is OBSERVED. Simple arithmetic
//     over it is DERIVED. Everything else — fatigue, intimidation, "held him
//     below his average", psychological momentum — is INFERRED and may not be
//     stated as fact.
//  2. CLAIM VALIDATION. A recap that contradicts the authoritative result is
//     rejected outright, not shown with a caveat. The deterministic summary is
//     always available as the fallback, so rejecting costs the reader nothing.
//
// Duplicate people (the same person on both teams as different era cards) must
// always be written with their side, or the sentence is ambiguous by
// construction.

/** Words that assert a causal/mental mechanism the simulation never records. */
const INFERRED_PATTERNS = [
  /\bfatigu\w+/i, /\btired\b/i, /\bgassed\b/i, /\bwore (?:them |him )?down\b/i,
  /\bconfidence\b/i, /\bmoraled?\b/i, /\bintimidat\w+/i, /\brattled\b/i,
  /\bmomentum shift\w*\b/i, /\bwilled\b/i, /\bheart\b/i, /\bclutch gene\b/i,
];

export const EVIDENCE_CLASSES = ["OBSERVED", "DERIVED", "INFERRED", "UNAVAILABLE"];

/**
 * Build the packet a narrative may draw on. Only OBSERVED and DERIVED facts
 * are handed to the writer; INFERRED is listed so the prompt can forbid it.
 */
export const buildEvidencePacket = (result) => {
  const core = result?.core ?? {};
  const v3 = result?.v3 ?? null;
  const gold = v3?.fullBox?.gold ?? [];
  const blue = v3?.fullBox?.blue ?? [];
  const total = (lines, k) => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  const margin = Math.abs((core.finalScore?.gold ?? 0) - (core.finalScore?.blue ?? 0));

  const observed = {
    winner: core.winner ?? null,
    finalScore: core.finalScore ?? null,
    seriesResult: core.seriesResult ?? null,
    mvp: core.mvp ?? null,
    periodScores: v3?.periodScores ?? null,
    goldLines: gold, blueLines: blue,
    defensiveAssignments: v3?.assignments ?? null,
    recordedAdjustments: v3?.adjustments ?? null,
    keyMoments: v3?.keyMoments ?? [],
    matchupPatterns: v3?.matchupPatterns ?? [],
  };
  const derived = {
    margin,
    marginBand: margin >= 20 ? "blowout" : margin >= 10 ? "double-digit" : margin >= 5 ? "comfortable" : "close",
    possessions: v3?.possessions ?? null,
    teamTotals: gold.length ? {
      gold: { pts: total(gold, "pts"), reb: total(gold, "oreb") + total(gold, "dreb"), ast: total(gold, "ast"), to: total(gold, "to") },
      blue: { pts: total(blue, "pts"), reb: total(blue, "oreb") + total(blue, "dreb"), ast: total(blue, "ast"), to: total(blue, "to") },
    } : null,
  };
  // Every N-N pair the record actually contains. The validator previously
  // allowed ONLY the final score, so a recap that cited a real quarter score
  // ("a 34-20 second quarter") or a real shooting line ("13-23") was rejected
  // as a fabrication — which is why every generated narrative failed.
  const scorePairs = new Set();
  const addPair = (a, b) => {
    if (a == null || b == null) return;
    scorePairs.add(`${a}-${b}`); scorePairs.add(`${b}-${a}`);
  };
  if (core.finalScore) addPair(core.finalScore.gold, core.finalScore.blue);
  let cg = 0, cb = 0;
  for (const p of v3?.periodScores ?? []) {
    addPair(p.gold, p.blue);              // the period itself
    cg += p.gold; cb += p.blue;
    addPair(cg, cb);                      // the score after that period
  }
  for (const l of [...gold, ...blue]) {
    addPair(l.fgm, l.fga); addPair(l.tpm, l.tpa); addPair(l.ftm, l.fta);
    addPair(l.oreb, l.dreb);
  }
  // Team shooting totals appear in recaps just as often as individual ones.
  for (const side of [gold, blue]) {
    if (!side.length) continue;
    addPair(total(side, "fgm"), total(side, "fga"));
    addPair(total(side, "tpm"), total(side, "tpa"));
    addPair(total(side, "ftm"), total(side, "fta"));
  }

  // People appearing on BOTH sides — every mention must name the side.
  const names = (l) => new Set(l.map((x) => x.name));
  const duplicates = [...names(gold)].filter((n) => names(blue).has(n));
  return {
    narrativeEvidenceVersion: 2,
    observed, derived,
    scorePairs: [...scorePairs],
    inferredForbidden: ["fatigue", "confidence", "intimidation", "momentum as a cause", "unobserved counterfactuals"],
    duplicatePeople: duplicates,
  };
};

// Typographic apostrophes must not defeat the "Gold's X" disambiguation check.
const norm = (s) => String(s ?? "").replace(/[\u2018\u2019\u02BC]/g, "'").replace(/\s+/g, " ").trim();

/**
 * Validate generated narrative text against the packet.
 * → { ok: true } | { ok: false, violations: [...] }
 */
export const validateNarrativeClaims = (narrative, packet) => {
  const v = [];
  if (!narrative || !packet) return { ok: false, violations: ["no narrative or evidence"] };
  const text = norm([narrative.summary, narrative.turningPoint, narrative.mvpReason,
    ...(narrative.teamAStrengths ?? []), ...(narrative.teamAWeaknesses ?? []),
    ...(narrative.teamBStrengths ?? []), ...(narrative.teamBWeaknesses ?? [])].filter(Boolean).join(" "));
  const { observed, derived, duplicatePeople } = packet;

  // 1. Winner. The losing side may not be described as winning.
  const loser = observed.winner === "Gold" ? "Blue" : "Gold";
  if (new RegExp(`Team ${loser}[^.]{0,40}\\b(won|wins|victory|took the win)\\b`, "i").test(text)) {
    v.push(`names Team ${loser} as the winner`);
  }

  // 2. Any score written as N-N must be one the game actually produced —
  //    including period scores, running scores and made-attempted lines, all of
  //    which are real facts a good recap naturally cites.
  const real = new Set(packet.scorePairs ?? []);
  if (observed.finalScore) {
    real.add(`${observed.finalScore.gold}-${observed.finalScore.blue}`);
    real.add(`${observed.finalScore.blue}-${observed.finalScore.gold}`);
  }
  if (observed.seriesResult) real.add(norm(observed.seriesResult).replace(/\s/g, ""));
  // Single-digit sides are matched too: an invented "12-4 run" was previously
  // invisible to this rule because it required two digits on both sides.
  for (const m of text.match(/\b\d{1,3}\s?-\s?\d{1,3}\b/g) ?? []) {
    const pair = m.replace(/\s/g, "");
    // A run (one side unanswered) is derived, not stated by the record, so it is
    // only rejected when it claims to be a SCORE the record contradicts.
    if (real.has(pair)) continue;
    if (/\brun\b/i.test(text.slice(Math.max(0, text.indexOf(m) - 40), text.indexOf(m) + m.length + 40))) continue;
    v.push(`states a score (${m}) the game did not produce`);
  }

  // 3. Margin language must match the real margin.
  if (derived.margin < 10 && /\b(double.digit|blew (?:them|it) out|blowout|runaway|never (?:in )?doubt|wire.to.wire)\b/i.test(text)) {
    v.push(`uses blowout language for a ${derived.margin}-point game`);
  }
  if (derived.margin >= 20 && /\b(nail.?biter|down to the wire|last.second|one.possession game)\b/i.test(text)) {
    v.push(`calls a ${derived.margin}-point game close`);
  }

  // 4. Player scoring claims must match the box score.
  const pts = new Map();
  for (const l of [...(observed.goldLines ?? []), ...(observed.blueLines ?? [])]) {
    if (!pts.has(l.name)) pts.set(l.name, new Set());
    pts.get(l.name).add(Number(l.pts));
  }
  for (const [name, set] of pts) {
    const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.]{0,40}?\\b(\\d{1,3})\\s*(?:points|pts)\\b`, "ig");
    let m;
    while ((m = re.exec(text))) {
      if (!set.has(Number(m[1]))) v.push(`credits ${name} with ${m[1]} points; the box score says ${[...set].join("/")}`);
    }
  }

  // 5. A person on both rosters must never be named without their side.
  for (const name of duplicatePeople ?? []) {
    const bare = new RegExp(`(?<!Gold's )(?<!Blue's )(?<!Team Gold's )(?<!Team Blue's )\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    if (bare.test(text)) v.push(`refers to ${name} without a side, but ${name} plays for both teams`);
  }

  // 6. Inferred mechanisms may not be asserted.
  for (const p of INFERRED_PATTERNS) {
    if (p.test(text)) { v.push(`asserts an unrecorded cause (${String(p).slice(1, 24)}…)`); break; }
  }
  return v.length ? { ok: false, violations: v } : { ok: true };
};
