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
// Each period carries two or three MEANINGFUL events when the ledger supports
// them. A single "X led the quarter with N" line is not a story, and padding
// with ordinary shots would be worse than saying less.
const phaseLabel = (e, bounds) => phaseOf(e, bounds);

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
    const gold = rows.reduce((a, r) => a + (scored(r.e) && r.e.offense === "gold" ? r.e.points : 0), 0);
    const blue = rows.reduce((a, r) => a + (scored(r.e) && r.e.offense === "blue" ? r.e.points : 0), 0);
    const leaderOf = (row) => (row.gold === row.blue ? "Tied" : `${SIDE(row.gold > row.blue ? "gold" : "blue")} leading`);
    const stateAt = (row) => `${leaderOf(row)} ${Math.max(row.gold, row.blue)}-${Math.min(row.gold, row.blue)}`;

    const events = [];

    // 1. The period's biggest unanswered run, with who scored in it.
    {
      let cur = null, best = null;
      for (const r of rows) {
        if (!scored(r.e)) continue;
        if (cur && cur.side === r.e.offense) { cur.points += r.e.points; cur.rows.push(r); }
        else cur = { side: r.e.offense, points: r.e.points, rows: [r] };
        if (!best || cur.points > best.points) best = { ...cur, rows: [...cur.rows] };
      }
      if (best && best.points >= 5) {
        const byName = new Map();
        for (const r of best.rows) if (r.e.primary) byName.set(r.e.primary, (byName.get(r.e.primary) || 0) + r.e.points);
        const top = [...byName.entries()].sort((a, b) => b[1] - a[1])[0];
        const at = best.rows[best.rows.length - 1];
        // Name the player only when they actually carried the run; otherwise the
        // run is the story and a 4-of-12 contributor is a distraction.
        const carried = top && top[1] / best.points >= 0.4;
        events.push({
          kind: "RUN", at: at.e.i,
          when: `${phaseLabel(at.e, bounds)} ${PERIOD(p, regulation)}`,
          state: stateAt(at),
          text: carried
            ? `${NAME(top[0], cards)} scored ${top[1]} of a ${best.points}-point ${SIDE(best.side)} run.`
            : `${SIDE(best.side)} put together a ${best.points}-point run.`,
        });
      }
    }

    // 2. The period's leading scorer, when the total is worth naming.
    {
      const per = new Map();
      for (const r of rows) if (scored(r.e) && r.e.primary) per.set(r.e.primary, (per.get(r.e.primary) || 0) + r.e.points);
      const top = [...per.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 6 && !events.some((ev) => ev.text.startsWith(NAME(top[0], cards)))) {
        const side = rows.find((r) => r.e.primary === top[0])?.e.offense;
        events.push({
          kind: "SCORER", at: last.e.i + 1,
          when: PERIOD(p, regulation),
          state: stateAt(last),
          text: `${NAME(top[0], cards)} led ${SIDE(side)} with ${top[1]} in the period.`,
        });
      }
    }

    // 3. A defensive stretch: consecutive empty possessions forced.
    {
      let cur = null, best = null;
      for (const r of rows) {
        if (scored(r.e)) { cur = null; continue; }
        if (cur && cur.side === r.e.offense) cur.n += 1;
        else cur = { side: r.e.offense, n: 1, at: r };
        cur.at = r;
        if (!best || cur.n > best.n) best = { ...cur };
      }
      if (best && best.n >= 3) {
        const stopper = best.side === "gold" ? "blue" : "gold";
        events.push({
          kind: "STOP", at: best.at.e.i,
          when: `${phaseLabel(best.at.e, bounds)} ${PERIOD(p, regulation)}`,
          state: stateAt(best.at),
          text: `${SIDE(stopper)} forced ${best.n} straight empty possessions.`,
        });
      }
    }

    // 4. Second chances, when one side genuinely owned the glass.
    {
      const oreb = { gold: 0, blue: 0 };
      for (const r of rows) if (r.e.outcome === "MISS_OREB") oreb[r.e.offense] += 1;
      const diff = Math.abs(oreb.gold - oreb.blue);
      if (diff >= 4) {
        const side = oreb.gold > oreb.blue ? "gold" : "blue";
        events.push({
          kind: "GLASS", at: last.e.i + 1, when: PERIOD(p, regulation), state: stateAt(last),
          text: `${SIDE(side)} kept ${oreb[side]} possessions alive on the offensive glass.`,
        });
      }
    }

    // 4b. A mismatch the period was built on.
    {
      const tally = new Map();
      for (const r of rows) {
        const e = r.e;
        if (!scored(e) || e.mismatchSeverity !== "SEVERE" || !e.primary) continue;
        const t = tally.get(e.primary) || { n: 0, pts: 0, side: e.offense };
        t.n += 1; t.pts += e.points; tally.set(e.primary, t);
      }
      const top = [...tally.entries()].sort((a, b) => b[1].pts - a[1].pts)[0];
      if (top && top[1].n >= 3) {
        events.push({
          kind: "MISMATCH", at: last.e.i + 1, when: PERIOD(p, regulation), state: stateAt(last),
          text: `${SIDE(top[1].side)} went at a mismatch with ${NAME(top[0], cards)} ${top[1].n} times for ${top[1].pts} in the period.`,
        });
      }
    }

    // 4c. Ball movement that actually produced points.
    {
      const MOVEMENT = new Set(["OFF_BALL_SCREEN", "CUT", "HANDOFF"]);
      for (const side of ["gold", "blue"]) {
        const hits = rows.filter((r) => r.e.offense === side && MOVEMENT.has(r.e.action) && scored(r.e) && r.e.assist);
        if (hits.length >= 4) {
          const pts = hits.reduce((a, r) => a + r.e.points, 0);
          events.push({
            kind: "MOVEMENT", at: last.e.i + 1, when: PERIOD(p, regulation), state: stateAt(last),
            text: `${SIDE(side)} scored ${pts} off ${hits.length} assisted cuts and screens.`,
          });
        }
      }
    }

    // 5. A lead that changed hands repeatedly.
    {
      let lead = Math.sign(first.gold - first.blue), changes = 0;
      for (const r of rows) {
        const now = Math.sign(r.gold - r.blue);
        if (now !== 0 && now !== lead) { if (lead !== 0) changes++; lead = now; }
      }
      if (changes >= 4) {
        events.push({
          kind: "SWING", at: last.e.i + 1, when: PERIOD(p, regulation), state: stateAt(last),
          text: `The lead changed hands ${changes} times inside the period.`,
        });
      }
    }

    out.push({
      period: PERIOD(p, regulation),
      gold, blue,
      scoreAfter: `${last.gold}-${last.blue}`,
      state: last.gold === last.blue ? "Tied" : `${SIDE(last.gold > last.blue ? "gold" : "blue")} leading ${Math.max(last.gold, last.blue)}-${Math.min(last.gold, last.blue)}`,
      // Two or three events, read in the order they happened and never padded
      // with ordinary shots.
      events: [...events].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(0, 3),
      leadingScorer: (() => {
        const per = new Map();
        for (const r of rows) if (scored(r.e) && r.e.primary) per.set(r.e.primary, (per.get(r.e.primary) || 0) + r.e.points);
        const top = [...per.entries()].sort((a, b) => b[1] - a[1])[0];
        return top ? { name: NAME(top[0], cards), pts: top[1] } : null;
      })(),
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


// ── DETERMINISTIC EXPANDED ANALYSIS ──────────────────────────────────────────
// The long-form read, built entirely from the record. When an external
// narrative provider is unavailable this IS the enhanced analysis, so the
// feature is never an empty panel — and it is labelled honestly as
// DETERMINISTIC_EXPANDED rather than pretending to be AI-assisted.
export const buildExpandedAnalysis = ({ record, quarterFlow, moments, patterns, coaching, eraId }) => {
  const core = record?.core;
  if (!core) return null;
  const winner = core.winner === "Gold" ? "gold" : "blue";
  const wName = SIDE(winner), lName = SIDE(winner === "gold" ? "blue" : "gold");
  const gs = core.finalScore?.gold ?? 0, bs = core.finalScore?.blue ?? 0;
  const win = Math.max(gs, bs), lose = Math.min(gs, bs), margin = win - lose;
  const box = record?.v3?.fullBox;
  const totals = record?.v3?.teamTotals;
  const sections = [];

  // 1. The result and the shape of it.
  {
    const shape = margin >= 20 ? "never seriously threatened"
      : margin >= 10 ? "pulled clear late" : "had to hold on";
    sections.push({
      heading: "The result",
      body: `${wName} won ${win}-${lose} and ${shape}. `
        + (quarterFlow?.length
          ? `The quarters went ${quarterFlow.map((q) => `${q.gold}-${q.blue}`).join(", ")}.`
          : ""),
    });
  }

  // 2. Who decided it.
  {
    const all = [...(box?.gold ?? []).map((l) => ({ ...l, side: "gold" })), ...(box?.blue ?? []).map((l) => ({ ...l, side: "blue" }))];
    const top = [...all].sort((a, b) => b.pts - a.pts).slice(0, 3);
    const lines = top.map((l) => {
      const bits = [`${l.pts} points`];
      if (l.oreb + l.dreb >= 10) bits.push(`${l.oreb + l.dreb} rebounds`);
      if (l.ast >= 6) bits.push(`${l.ast} assists`);
      return `${l.name} (${SIDE(l.side)}) had ${bits.join(", ")} on ${l.fgm}-${l.fga} shooting`;
    });
    if (lines.length) sections.push({ heading: "Who decided it", body: `${lines.join(". ")}.` });
  }

  // 3. How the winner generated offense.
  {
    const mine = (patterns || []).filter((p) => p.side === winner);
    const body = mine.length
      ? mine.map((p) => p.text).join(" ")
      : `${wName} produced its points without one dominant repeated pattern.`;
    sections.push({ heading: `How ${wName} scored`, body });
  }

  // 4. The turning points.
  if (moments?.length) {
    sections.push({
      heading: "Where it turned",
      body: moments.map((m) => `${m.period === "FINAL" ? "" : `${m.period}: `}${m.text}`).join(" "),
    });
  }

  // 5. What the staffs did about it.
  {
    const bits = [];
    for (const side of ["gold", "blue"]) {
      const c = coaching?.[side];
      if (!c) continue;
      const applied = (c.adjustments || []).length;
      bits.push(`${c.coach || SIDE(side)} ${applied ? `made ${applied} recorded ${applied === 1 ? "adjustment" : "adjustments"}` : "made no recorded adjustment"}`
        + (c.defense?.shell ? `, opening in ${String(c.defense.shell).toLowerCase()}` : "") + ".");
    }
    if (bits.length) sections.push({ heading: "The benches", body: bits.join(" ") });
  }

  // 6. The rules environment, stated as fact.
  if (eraId) {
    sections.push({ heading: "The era", body: eraImpactLine(eraId) });
  }

  // 7. The numbers that carried it.
  if (totals?.gold && totals?.blue) {
    const t = (k) => `${totals.gold[k] ?? 0}-${totals.blue[k] ?? 0}`;
    sections.push({
      heading: "The margins",
      body: `Rebounds ${t("reb")}, assists ${t("ast")}, turnovers ${t("to")} (Gold-Blue).`,
    });
  }

  return {
    analysisSource: "DETERMINISTIC_EXPANDED",
    headline: `How ${wName} beat ${lName}`,
    sections,
  };
};

/** A factual sentence about what the era's rules meant, never a cause claim. */
export const eraImpactLine = (eraId) => {
  const facts = {
    "1950s": "No three-point line and a 24-second clock: every field goal counted two, and the game lived inside the arc.",
    "1960s": "No three-point line, zones illegal: post scoring and offensive rebounding carried more weight than perimeter volume.",
    "1970s": "No three-point line. Every perimeter make counted for two, while post scoring and offensive rebounding carried greater strategic value.",
    "1980s": "The three-point line existed but was lightly used, and hand-checking was legal on the perimeter.",
    "1990s": "Hand-checking was legal and zones were illegal, which rewarded physical man defense and one-on-one scoring.",
    "2000s": "Zone defense was legal and hand-checking was restricted, favouring half-court creation over pace-and-space.",
    "2010s": "A high-volume three-point environment with legal zones and no hand-checking.",
    "2020s": "The most perimeter-heavy environment in the game's history, with spacing at a premium.",
  };
  return `${eraId} impact: ${facts[eraId] || "The era's rules shaped what each offense could attempt."}`;
};
