// ── Key moments, derived from the real possession ledger ──────────────────────
// Every moment below is a fact the simulation recorded: a scoring run of
// consecutive scoring possessions, the last lead change, the game's decisive
// stretch, and a repeatedly-punished mismatch. Nothing is invented, and no game
// clock is fabricated — the engine records PERIODS and possession order, not a
// wall clock, so moments are labeled by period ("Q3", "OT") and by what
// actually happened. If the ledger cannot support a moment, it is not emitted.
//
// Lives in the API layer, not src/v3: the simulation core stays byte-frozen.
// `regulation` is the number of REGULATION periods (4), never the total played:
// period 5 is the first overtime, not "Q5".
const PERIOD = (p, regulation = 4) => (p <= regulation ? `Q${p}` : regulation === p - 1 ? "OT" : `OT${p - regulation}`);
const NAME = (id, cards) => cards.get(id)?.name ?? id;
const SIDE = (s) => (s === "gold" ? "Gold" : "Blue");
const ACTION_TEXT = {
  PICK_AND_ROLL: "out of the pick-and-roll", ISOLATION: "in isolation", POST_UP: "from the post",
  SPOT_UP: "on a spot-up", CUT: "on a cut", HANDOFF: "off a handoff",
  OFF_BALL_SCREEN: "off an off-ball screen", TRANSITION: "in transition", GENERIC_HALF_COURT: "in the half court",
};
const MISMATCH_TEXT = {
  SPEED_MISMATCH: "speed mismatch", SIZE_MISMATCH: "size mismatch", STRENGTH_MISMATCH: "strength mismatch",
  MOVEMENT_SHOOTING_MISMATCH: "movement-shooting mismatch", SHOOTING_MISMATCH: "shooting mismatch",
};

/**
 * @param ledger  possessionLedger from runPossessionGame({includeLedger:true})
 * @param cards   Map of cardId → {name}
 * @param periods number of regulation periods (4)
 * @returns compact, ordered moments — safe to store on the result record
 */
export const deriveKeyMoments = (ledger, cards, periods = 4) => {
  if (!Array.isArray(ledger) || !ledger.length) return [];
  const moments = [];
  const scored = (e) => Number(e.points) > 0;

  // 1. The longest run of consecutive scoring possessions by one side.
  let best = null, cur = null;
  for (const e of ledger) {
    if (!scored(e)) { cur = null; continue; }
    if (cur && cur.side === e.offense) { cur.points += e.points; cur.count += 1; cur.end = e; }
    else cur = { side: e.offense, points: e.points, count: 1, start: e, end: e };
    if (!best || cur.points > best.points) best = { ...cur };
  }
  if (best && best.count >= 3) {
    moments.push({ period: PERIOD(best.start.period, periods), side: best.side, kind: "RUN",
      text: `${SIDE(best.side)} scored on ${best.count} straight possessions for ${best.points} points.` });
  }

  // 2. The last lead change — the swing the game never came back from.
  let g = 0, b = 0, lead = 0, last = null;
  for (const e of ledger) {
    if (scored(e)) { if (e.offense === "gold") g += e.points; else b += e.points; }
    const now = Math.sign(g - b);
    if (now !== 0 && now !== lead) { lead = now; last = { e, g, b }; }
  }
  if (last) {
    const side = last.g > last.b ? "gold" : "blue";
    moments.push({ period: PERIOD(last.e.period, periods), side, kind: "LEAD_CHANGE",
      text: `${SIDE(side)} took the lead for the last time at ${Math.max(last.g, last.b)}-${Math.min(last.g, last.b)}.` });
  }

  // 3. The highest-value made shot of the final period played.
  const finalPeriod = Math.max(...ledger.map((e) => e.period));
  const late = ledger.filter((e) => e.period === finalPeriod && e.outcome === "MADE_FG" && e.points >= 2);
  const dagger = late.sort((x, y) => (y.points - x.points) || (y.step - x.step))[0];
  if (dagger) {
    moments.push({ period: PERIOD(dagger.period, periods), side: dagger.offense, kind: "SHOT",
      text: `${NAME(dagger.primary, cards)} hit a ${dagger.points === 3 ? "three" : "two"} ${ACTION_TEXT[dagger.action] ?? "in the half court"}${dagger.assist ? `, set up by ${NAME(dagger.assist, cards)}` : ""}.` });
  }

  // 4. The mismatch the offense punished most often (severe, and it scored).
  const tally = new Map();
  for (const e of ledger) {
    if (e.mismatchSeverity !== "SEVERE" || !e.mismatchType || !scored(e)) continue;
    const k = `${e.offense}|${e.mismatchType}|${e.primary}`;
    const t = tally.get(k) ?? { n: 0, points: 0, e };
    t.n += 1; t.points += e.points; tally.set(k, t);
  }
  const worst = [...tally.values()].sort((x, y) => (y.points - x.points) || (y.n - x.n))[0];
  if (worst && worst.n >= 3) {
    moments.push({ period: "GAME", side: worst.e.offense, kind: "MISMATCH",
      text: `${SIDE(worst.e.offense)} attacked a ${MISMATCH_TEXT[worst.e.mismatchType] ?? "mismatch"} with ${NAME(worst.e.primary, cards)} ${worst.n} times for ${worst.points} points.` });
  }

  // Ordered by when they happened; the game-long mismatch note sits last.
  const rank = (m) => (m.period === "GAME" ? 99 : Number(String(m.period).replace(/\D/g, "")) + (String(m.period).startsWith("OT") ? 10 : 0));
  return moments.sort((a, b2) => rank(a) - rank(b2)).slice(0, 5);
};
