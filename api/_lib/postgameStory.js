// ── Postgame story layer ─────────────────────────────────────────────────────
// Turns the possession ledger into an account a basketball fan would recognise.
// Everything here is DERIVED from recorded facts: no clock is invented (the
// engine records periods and possession order, never a wall clock), no score is
// imagined, and a moment that the ledger cannot support is simply not emitted.
//
// Lives in the API layer so the simulation core stays byte-frozen.
const NAME = (id, cards) => cards.get(id)?.name ?? id;
const SIDE = (s) => (s === "gold" ? "Gold" : "Blue");
const PERIOD = (p, regulation = 4) => (p <= regulation ? `Q${p}` : regulation === p - 1 ? "OT" : `OT${p - regulation}`);
const scored = (e) => Number(e.points) > 0;

/**
 * Early / Mid / Late from POSSESSION POSITION within the period. The engine has
 * no game clock, so "Q3 6:42" would be fiction; "Mid Q3" is a fact about where
 * in the period the possession fell.
 */
export const phaseOf = (e, periodBounds) => {
  const b = periodBounds.get(e.period);
  if (!b || b.last === b.first) return "Mid";
  const f = (e.i - b.first) / (b.last - b.first);
  return f < 0.34 ? "Early" : f < 0.67 ? "Mid" : "Late";
};

export const periodBoundsOf = (ledger) => {
  const m = new Map();
  for (const e of ledger) {
    const b = m.get(e.period);
    if (!b) m.set(e.period, { first: e.i, last: e.i });
    else { b.first = Math.min(b.first, e.i); b.last = Math.max(b.last, e.i); }
  }
  return m;
};

/** Running score after each possession, so every claim can cite a real score. */
const runningScore = (ledger) => {
  let g = 0, b = 0;
  return ledger.map((e) => {
    if (scored(e)) { if (e.offense === "gold") g += e.points; else b += e.points; }
    return { e, gold: g, blue: b };
  });
};

// ── SALIENT KEY MOMENTS ──────────────────────────────────────────────────────
// The previous selector emitted "the last lead change" unconditionally, which
// surfaced an 8-7 Q1 swing as a headline moment while a 32-16 fourth quarter
// went unmentioned. Salience is now SCORED, and the score is dominated by how
// much the game actually turned on the event and when it happened.

export const SALIENCE_FLOOR = 6;

const CATEGORY = {
  TEAM_RUN: "Team run", PLAYER_BURST: "Player burst", QUARTER_TAKEOVER: "Quarter takeover",
  DEFENSIVE_STAND: "Defensive stand", GLASS: "Rebounding", MISMATCH: "Matchup",
  GO_AHEAD: "Go-ahead", COLLAPSE: "Collapse", BIG_PERFORMANCE: "Performance",
};

/** Later periods carry more weight; a Q1 event must clear a far higher bar. */
const periodWeight = (p, regulation) => (p > regulation ? 1.6 : [0.35, 0.55, 0.8, 1.25][p - 1] ?? 0.6);

/** Closeness at the time: a swing in a tied game matters more than in a rout. */
const leverage = (gold, blue) => {
  const margin = Math.abs(gold - blue);
  return margin <= 4 ? 1 : margin <= 9 ? 0.78 : margin <= 15 ? 0.5 : 0.28;
};

export const deriveSalientMoments = (ledger, cards, regulation = 4, opts = {}) => {
  if (!Array.isArray(ledger) || !ledger.length) return [];
  const bounds = periodBoundsOf(ledger);
  const track = runningScore(ledger);
  const finalPeriod = Math.max(...ledger.map((e) => e.period));
  const cand = [];

  const push = (c) => { if (c && c.text) cand.push(c); };

  // 1. UNANSWERED RUNS — points one side scored while the other scored none.
  //    Consecutive *scoring possessions* (the old measure) counted a 2-0 spurt
  //    the same way as a 12-0 one.
  {
    let cur = null;
    for (const row of track) {
      const e = row.e;
      if (!scored(e)) continue;
      if (cur && cur.side === e.offense) { cur.points += e.points; cur.end = row; }
      else {
        if (cur && cur.points >= 6) push(runMoment(cur, regulation));
        cur = { side: e.offense, points: e.points, start: row, end: row };
      }
    }
    if (cur && cur.points >= 6) push(runMoment(cur, regulation));
  }
  function runMoment(r, reg) {
    const at = r.end;
    return {
      kind: "TEAM_RUN", category: CATEGORY.TEAM_RUN, side: r.side, period: PERIOD(r.end.e.period, reg),
      periodNum: r.end.e.period, phase: phaseOf(r.end.e, bounds),
      score: `${Math.max(at.gold, at.blue)}-${Math.min(at.gold, at.blue)}`,
      salience: r.points * 1.0 * periodWeight(r.end.e.period, reg) * leverage(r.start.gold, r.start.blue),
      text: `${SIDE(r.side)} scored ${r.points} without reply, moving it to ${at.gold}-${at.blue}.`,
    };
  }

  // 2. QUARTER TAKEOVER — one player's scoring inside a single period.
  {
    const per = new Map();
    for (const e of ledger) {
      if (!scored(e) || !e.primary) continue;
      const k = `${e.period}|${e.primary}`;
      const t = per.get(k) ?? { period: e.period, id: e.primary, side: e.offense, pts: 0 };
      t.pts += e.points; per.set(k, t);
    }
    for (const t of per.values()) {
      if (t.pts < 11) continue;
      push({
        kind: "QUARTER_TAKEOVER", category: CATEGORY.QUARTER_TAKEOVER, side: t.side,
        period: PERIOD(t.period, regulation), periodNum: t.period, phase: "",
        salience: t.pts * 1.15 * periodWeight(t.period, regulation),
        text: `${NAME(t.id, cards)} scored ${t.pts} in ${PERIOD(t.period, regulation)} alone.`,
      });
    }
  }

  // 3. PERIOD DOMINATION — a lopsided quarter is the most legible turn there is.
  {
    const per = new Map();
    for (const e of ledger) {
      const t = per.get(e.period) ?? { gold: 0, blue: 0 };
      if (scored(e)) t[e.offense] += e.points;
      per.set(e.period, t);
    }
    for (const [p, t] of per) {
      const diff = Math.abs(t.gold - t.blue);
      if (diff < 8) continue;
      const side = t.gold > t.blue ? "gold" : "blue";
      push({
        kind: "PERIOD_DOMINATION", category: CATEGORY.TEAM_RUN, side,
        period: PERIOD(p, regulation), periodNum: p, phase: "",
        salience: diff * 1.35 * periodWeight(p, regulation),
        text: `${SIDE(side)} won ${PERIOD(p, regulation)} ${Math.max(t.gold, t.blue)}-${Math.min(t.gold, t.blue)}.`,
      });
    }
  }

  // 4. DEFENSIVE STAND — a stretch where one side got nothing.
  {
    let cur = null;
    for (const row of track) {
      const e = row.e;
      if (scored(e)) {
        if (cur && cur.side === e.offense) {
          if (cur.n >= 5) push(standMoment(cur, regulation));
          cur = null;
        }
        continue;
      }
      if (cur && cur.side === e.offense) cur.n += 1;
      else cur = { side: e.offense, n: 1, start: row, end: row };
      if (cur) { cur.end = row; }
    }
    if (cur && cur.n >= 5) push(standMoment(cur, regulation));
  }
  function standMoment(r, reg) {
    const stopper = r.side === "gold" ? "blue" : "gold";
    return {
      kind: "DEFENSIVE_STAND", category: CATEGORY.DEFENSIVE_STAND, side: stopper,
      period: PERIOD(r.end.e.period, reg), periodNum: r.end.e.period, phase: phaseOf(r.end.e, bounds),
      salience: r.n * 2.6 * periodWeight(r.end.e.period, reg) * leverage(r.end.gold, r.end.blue),
      text: `${SIDE(stopper)}'s defense held ${SIDE(r.side)} without a point on ${r.n} straight possessions.`,
    };
  }

  // 5. GO-AHEAD — the score that put the eventual winner ahead to stay.
  {
    const last = track[track.length - 1];
    const winner = last.gold > last.blue ? "gold" : last.blue > last.gold ? "blue" : null;
    if (winner) {
      let idx = -1;
      for (let i = track.length - 1; i >= 0; i--) {
        const t = track[i];
        const ahead = winner === "gold" ? t.gold > t.blue : t.blue > t.gold;
        if (!ahead) { idx = i + 1; break; }
      }
      const go = idx > 0 && idx < track.length ? track[idx] : null;
      if (go && scored(go.e) && go.e.offense === winner) {
        const margin = Math.abs(go.gold - go.blue);
        push({
          kind: "GO_AHEAD", category: CATEGORY.GO_AHEAD, side: winner,
          period: PERIOD(go.e.period, regulation), periodNum: go.e.period, phase: phaseOf(go.e, bounds),
          // A go-ahead score matters in proportion to how LATE it came and how
          // little was left to answer it. Going ahead 8-7 in the first quarter
          // is not a moment, and this is where that used to slip through.
          // Weighted by how late it came AND how close the game was at the
          // time. A wire-to-wire winner "goes ahead to stay" at 6-3 in the
          // first quarter, which is not a moment in any real sense.
          salience: 14 * periodWeight(go.e.period, regulation)
            * (go.e.period >= regulation ? 1.3 : 0.45)
            * leverage(go.gold, go.blue),
          text: `${NAME(go.e.primary, cards)} put ${SIDE(winner)} ahead to stay at ${Math.max(go.gold, go.blue)}-${Math.min(go.gold, go.blue)}.`,
        });
      }
    }
  }

  // A repeatedly-hunted mismatch is GAME-LONG behaviour and belongs in Matchup
  // Patterns, not here. Emitting it in both places printed the same sentence on
  // two tabs and crowded out an actual discrete moment.

  // 6. A GAME NOBODY COULD SHAKE — many lead changes is itself the story, and
  //    without it a genuinely close game produced only one moment.
  {
    let lead = 0, changes = 0, lastRow = null;
    for (const row of track) {
      const now = Math.sign(row.gold - row.blue);
      if (now !== 0 && now !== lead) { if (lead !== 0) { changes++; lastRow = row; } lead = now; }
    }
    if (changes >= 6 && lastRow) {
      push({
        kind: "BACK_AND_FORTH", category: CATEGORY.COLLAPSE, side: null,
        period: PERIOD(lastRow.e.period, regulation), periodNum: lastRow.e.period, phase: "",
        salience: changes * 1.9,
        text: `The lead changed hands ${changes} times before it settled.`,
      });
    }
  }

  // 7. THE CLOSING STRETCH — how the winner actually finished it.
  {
    const last = track[track.length - 1];
    const winner = last.gold > last.blue ? "gold" : last.blue > last.gold ? "blue" : null;
    const tail = track.filter((r) => r.e.period === finalPeriod);
    if (winner && tail.length >= 6) {
      const closing = tail.slice(Math.floor(tail.length * 0.66));
      const w = closing.reduce((a, r) => a + (scored(r.e) && r.e.offense === winner ? r.e.points : 0), 0);
      const l = closing.reduce((a, r) => a + (scored(r.e) && r.e.offense !== winner ? r.e.points : 0), 0);
      if (w - l >= 4) {
        push({
          kind: "CLOSING_STRETCH", category: CATEGORY.DEFENSIVE_STAND, side: winner,
          period: PERIOD(finalPeriod, regulation), periodNum: finalPeriod, phase: "Late",
          salience: (w - l) * 2.4 * leverage(closing[0].gold, closing[0].blue),
          text: `${SIDE(winner)} outscored ${SIDE(winner === "gold" ? "blue" : "gold")} ${w}-${l} over the closing possessions.`,
        });
      }
    }
  }

  // 8. UNUSUAL PERFORMANCE — a scoring night that stands on its own.
  if (opts.topScorer && opts.topScorer.pts >= 40) {
    push({
      kind: "BIG_PERFORMANCE", category: CATEGORY.BIG_PERFORMANCE, side: opts.topScorer.side,
      // Labelled FINAL, not Q4: this describes the whole night, and stamping a
      // period on it would claim a discrete event that never happened.
      period: "FINAL", periodNum: finalPeriod + 1, phase: "",
      salience: opts.topScorer.pts * 0.85,
      text: `${opts.topScorer.name} finished with ${opts.topScorer.pts}.`,
    });
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  // Highest salience, one per category, at most five — and nothing below the
  // floor. Padding a short list with a trivial candidate ("put Gold ahead to
  // stay at 15-14" in the first quarter) is exactly the defect this model
  // exists to remove, so three real moments beat five with filler.
  const seenCat = new Set(), out = [];
  for (const c of [...cand].sort((a, b) => b.salience - a.salience)) {
    if (c.salience < SALIENCE_FLOOR) continue;
    if (seenCat.has(c.category)) continue;
    seenCat.add(c.category);
    out.push(c);
    if (out.length === 5) break;
  }
  // Read in the order they happened; whole-game performances close the list.
  return out
    .sort((a, b) => (a.periodNum - b.periodNum) || 0)
    .map(({ salience, periodNum, ...rest }) => ({ ...rest, salience: Math.round(salience * 10) / 10 }));
};

// ── QUARTER-BY-QUARTER FLOW ──────────────────────────────────────────────────
export const deriveQuarterFlow = (ledger, cards, regulation = 4) => {
  if (!Array.isArray(ledger) || !ledger.length) return [];
  const bounds = periodBoundsOf(ledger);
  const track = runningScore(ledger);
  const periods = [...new Set(ledger.map((e) => e.period))].sort((a, b) => a - b);
  const out = [];
  for (const p of periods) {
    const rows = track.filter((r) => r.e.period === p);
    if (!rows.length) continue;
    const first = rows[0], last = rows[rows.length - 1];
    const gold = last.gold - (first.gold - (scored(first.e) && first.e.offense === "gold" ? first.e.points : 0));
    const blue = last.blue - (first.blue - (scored(first.e) && first.e.offense === "blue" ? first.e.points : 0));
    // Leading scorer of the period.
    const per = new Map();
    for (const r of rows) {
      if (!scored(r.e) || !r.e.primary) continue;
      per.set(r.e.primary, (per.get(r.e.primary) || 0) + r.e.points);
    }
    const top = [...per.entries()].sort((a, b) => b[1] - a[1])[0];
    // Biggest unanswered run inside the period.
    let bestRun = null, cur = null;
    for (const r of rows) {
      if (!scored(r.e)) continue;
      if (cur && cur.side === r.e.offense) cur.points += r.e.points;
      else cur = { side: r.e.offense, points: r.e.points };
      if (!bestRun || cur.points > bestRun.points) bestRun = { ...cur };
    }
    const oreb = { gold: 0, blue: 0 };
    for (const r of rows) if (r.e.outcome === "MISS_OREB") oreb[r.e.offense] += 1;
    out.push({
      period: PERIOD(p, regulation),
      gold, blue,
      scoreAfter: `${last.gold}-${last.blue}`,
      state: last.gold === last.blue ? "Tied" : `${SIDE(last.gold > last.blue ? "gold" : "blue")} leading ${Math.max(last.gold, last.blue)}-${Math.min(last.gold, last.blue)}`,
      leadingScorer: top ? { name: NAME(top[0], cards), pts: top[1] } : null,
      run: bestRun && bestRun.points >= 6 ? { side: bestRun.side, points: bestRun.points } : null,
      reboundEdge: Math.abs(oreb.gold - oreb.blue) >= 4 ? (oreb.gold > oreb.blue ? "gold" : "blue") : null,
    });
  }
  return out;
};

// ── DETERMINISTIC OPENING SUMMARY ────────────────────────────────────────────
// Player-centered, available instantly, and never dependent on a provider. It
// deliberately does NOT open with the pregame prediction, a generic "comfortable
// win", chemistry, or any internal rating.
export const buildDeterministicSummary = ({ record, quarterFlow, moments, patterns }) => {
  const core = record?.core;
  if (!core) return null;
  const winner = core.winner === "Gold" ? "gold" : "blue";
  const wName = SIDE(winner);
  const gs = core.finalScore?.gold ?? 0, bs = core.finalScore?.blue ?? 0;
  const win = Math.max(gs, bs), lose = Math.min(gs, bs);
  const margin = win - lose;
  const mvp = core.mvpLine;
  const parts = [];

  // 1. Lead with the performance that decided it.
  if (mvp?.name) {
    const bits = [`${mvp.pts} points`];
    if (mvp.reb >= 10) bits.push(`${mvp.reb} rebounds`);
    if (mvp.ast >= 7) bits.push(`${mvp.ast} assists`);
    if (mvp.blk >= 4) bits.push(`${mvp.blk} blocks`);
    parts.push(`${mvp.name} controlled the game with ${bits.join(", ")}.`);
  }

  // 2. The mechanism — a targeted matchup, movement, or the glass.
  const mismatch = (patterns || []).find((p) => p.kind === "MISMATCH" && p.side === winner);
  const target = (patterns || []).find((p) => p.kind === "TARGET" && p.side === winner);
  const glass = (patterns || []).find((p) => p.kind === "GLASS" && p.side === winner);
  if (mismatch) parts.push(mismatch.text);
  else if (target) parts.push(target.text);
  else if (glass) parts.push(glass.text);

  // 3. Where the game turned.
  const swing = (moments || []).filter((m) => m.side === winner)
    .sort((a, b) => (b.salience || 0) - (a.salience || 0))[0];
  if (swing) parts.push(swing.text);

  // 4. How it closed.
  const lastQ = (quarterFlow || [])[(quarterFlow || []).length - 1];
  if (lastQ) {
    const wq = winner === "gold" ? lastQ.gold : lastQ.blue;
    const lq = winner === "gold" ? lastQ.blue : lastQ.gold;
    if (wq > lq) parts.push(`${wName} closed it out ${wq}-${lq} in the ${lastQ.period.startsWith("OT") ? "extra period" : "fourth"}.`);
  }

  const headline = `How ${wName} Won`;
  const body = parts.slice(0, 4).join(" ")
    || `${wName} won ${win}-${lose}.`;
  return { headline, body, margin, winner };
};

// ── DRAFT CONSEQUENCES ───────────────────────────────────────────────────────
// Only claims supported by an actual before/after roster evaluation. It never
// says "you would have won if" — the unchosen branch was never simulated.
export const deriveDraftConsequences = ({ chaosDraft, record, cards }) => {
  if (!chaosDraft?.rolls?.length) return null;
  const out = [];
  const finalIds = new Set(chaosDraft.finalGold || []);
  const box = record?.core?.teamAStats || [];
  const statOf = (name) => box.find((b) => b.name === name) || null;

  // BEST HOLD — the earliest-held card that ended up producing the most.
  const heldEarly = [];
  for (const r of chaosDraft.rolls) {
    for (const slot of r.goldHeld || []) {
      const idx = ["PG", "SG", "SF", "PF", "C"].indexOf(slot);
      const id = r.goldRoster?.[idx];
      if (id && finalIds.has(id)) heldEarly.push({ id, roll: r.roll });
    }
  }
  const scoredHolds = heldEarly
    .map((h) => ({ ...h, name: NAME(h.id, cards), s: statOf(NAME(h.id, cards)) }))
    .filter((h) => h.s)
    .sort((a, b) => (b.s.pts + b.s.reb) - (a.s.pts + a.s.reb));
  if (scoredHolds[0]) {
    const h = scoredHolds[0];
    out.push({ card: "BEST HOLD", text: `Keeping ${h.name} after Roll ${h.roll} carried through to ${h.s.pts} points and ${h.s.reb} rebounds.` });
  }

  // BIGGEST GAMBLE — what the final roll actually changed.
  const lastRoll = chaosDraft.rolls[chaosDraft.rolls.length - 1];
  if (lastRoll) {
    const before = lastRoll.goldConstructionTier, kept = (lastRoll.goldHeld || []).length;
    out.push({
      card: "BIGGEST GAMBLE",
      text: kept === 5
        ? "You stood pat on the final roll and took the roster you had."
        : `You sent ${5 - kept} ${5 - kept === 1 ? "player" : "players"} back on the final roll, moving off a ${before} build.`,
    });
  }

  // ERA ADAPTATION — decisions made after the era was known.
  if (chaosDraft.revealedEraStyleId) {
    const finalHold = chaosDraft.rolls.find((r) => r.roll === 2);
    if (finalHold) {
      out.push({
        card: "ERA ADAPTATION",
        text: `With the ${chaosDraft.revealedEraStyleId} revealed, you kept ${(finalHold.goldHeld || []).length} of five and let the rest go.`,
      });
    }
  }

  // COACH DECISION — which of the three offers was taken.
  const chosen = (chaosDraft.coachOffers?.gold || []).find((o) => o.coachId === chaosDraft.selectedCoaches?.gold);
  if (chosen) out.push({ card: "COACH DECISION", text: `You hired ${chosen.name} as your ${String(chosen.role).replace("_", " ").toLowerCase()}.` });

  // CPU DECISION — what Legend did with its own three offers.
  const cpu = (chaosDraft.coachOffers?.blue || []).find((o) => o.coachId === chaosDraft.selectedCoaches?.blue);
  if (cpu) out.push({ card: "CPU DECISION", text: `Legend took ${cpu.name} from its own three offers.` });

  return out.length ? out : null;
};
