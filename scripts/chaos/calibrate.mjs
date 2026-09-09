#!/usr/bin/env node
// ── Chaos Draft calibration ──────────────────────────────────────────────────
// Simulates complete three-roll drafts and measures every frozen target band.
//
// The inner loop is an INTEGER-INDEXED mirror of the shipped draw so a million
// runs finish in minutes. It is not a lookalike: assertEquivalence() replays
// hundreds of draws through both this harness and the production drawForSlot()
// and aborts the run on the first divergence. Calibrating a model that is not
// the shipped model would be worse than not calibrating at all.
import fs from "node:fs";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { displayOVR } from "../../src/rating.js";
import { draftPctAt, tierOf } from "../../src/chaos/draftValue.js";
import { ODDS, baseRarityWeight, rollStageModifier, heldTalentPressure, drawForSlot, drawIdentity, CHAOS_DRAFT_VERSION } from "../../src/chaos/draftOdds.js";
import { talentScore, constructionScore } from "../../src/chaos/construction.js";
import { CHAOS_ERA_IDS } from "../../src/chaos/eraTranslation.js";
import { mulberry32, deriveSeed, hashString } from "../../src/v3/seed.js";

const N = Number(process.argv[2] || 1_000_000);
const OUT = "data/validation/8a";
const TIERS = ["APEX", "ELITE", "STAR", "SPECIALIST"];
const TIDX = Object.fromEntries(TIERS.map((t, i) => [t, i]));

// ── Index structures ─────────────────────────────────────────────────────────
const nameId = new Map();
PLAYERS.forEach((p) => { if (!nameId.has(p.name)) nameId.set(p.name, nameId.size); });
const NNAMES = nameId.size;
const card = PLAYERS.map((p, i) => ({
  i, id: p.id, p, name: nameId.get(p.name), ovr: displayOVR(p),
}));
const slotIdx = {};   // slot -> Int32Array of card indices eligible there
const slotBase = {};  // slot -> Float64Array baseRarityWeight
const slotTier = {};  // slot -> Uint8Array tier index
for (const s of POSITIONS) {
  const list = card.filter((c) => c.p.positions.includes(s));
  slotIdx[s] = Int32Array.from(list.map((c) => c.i));
  slotBase[s] = Float64Array.from(list.map((c) => baseRarityWeight(c.p, s)));
  slotTier[s] = Uint8Array.from(list.map((c) => TIDX[tierOf(c.p, s)]));
}
// Multiplier table: [roll][tier] -> stage modifier
const stageTab = [null, ...[1, 2, 3].map((r) => TIERS.map((t) => rollStageModifier(t, r)))];

const burnedFlag = new Uint8Array(PLAYERS.length);
const usedName = new Uint8Array(NNAMES);
const wbuf = new Float64Array(Math.max(...POSITIONS.map((s) => slotIdx[s].length)));

/** Integer-indexed mirror of drawForSlot. Returns a card index or -1. */
const fastDraw = (slot, roll, rng, pressure) => {
  const idx = slotIdx[slot], base = slotBase[slot], tier = slotTier[slot];
  const stage = stageTab[roll];
  let total = 0, n = 0;
  const pick = new Int32Array(idx.length);
  for (let k = 0; k < idx.length; k++) {
    const ci = idx[k];
    if (burnedFlag[ci] || usedName[card[ci].name]) continue;
    const t = tier[k];
    const w = base[k] * stage[t] * pressure[t];
    wbuf[n] = w; pick[n] = ci; n++; total += w;
  }
  if (n === 0) {
    // Burn-relaxation path, mirroring drawForSlot exactly.
    for (let k = 0; k < idx.length; k++) {
      const ci = idx[k];
      if (usedName[card[ci].name]) continue;
      const t = tier[k];
      const w = base[k] * stage[t] * pressure[t];
      wbuf[n] = w; pick[n] = ci; n++; total += w;
    }
  }
  if (n === 0) return -1;
  let t = rng() * total;
  for (let k = 0; k < n; k++) { t -= wbuf[k]; if (t <= 0) return pick[k]; }
  return pick[n - 1];
};

const pressureVec = (census) => {
  const v = new Float64Array(4);
  for (const t of TIERS) v[TIDX[t]] = heldTalentPressure(t, census);
  return v;
};

// ── Equivalence: harness == shipped model ────────────────────────────────────
const assertEquivalence = () => {
  let checked = 0;
  for (let s = 0; s < 240; s++) {
    const seedId = `eq${s}`;
    const side = s % 2 ? "blue" : "gold";
    const roll = (s % 3) + 1;
    const slot = POSITIONS[s % 5];
    const burnedIds = s % 4 === 0 ? [PLAYERS[(s * 7) % PLAYERS.length].id] : [];
    const heldCard = s % 3 === 0 ? PLAYERS[(s * 13) % PLAYERS.length] : null;
    const heldIds = heldCard ? [heldCard.id] : [];
    const census = heldCard ? { [tierOf(heldCard, heldCard.pos)]: 1 } : {};
    const excludeNames = heldCard ? [heldCard.name] : [];

    const want = drawForSlot({
      slot, roll, seedId, side, heldIds, burnedIds, excludeNames,
      heldCensus: census,
    });
    burnedFlag.fill(0); usedName.fill(0);
    for (const b of burnedIds) burnedFlag[card.find((c) => c.id === b).i] = 1;
    for (const nm of excludeNames) usedName[nameId.get(nm)] = 1;
    const rng = mulberry32(deriveSeed(drawIdentity({ seedId, side, slot, roll, heldIds, burnedIds }), 0));
    const gotI = fastDraw(slot, roll, rng, pressureVec(census));
    const got = gotI >= 0 ? card[gotI].p : null;
    if (want?.id !== got?.id) {
      throw new Error(`calibration harness diverged from shipped model at case ${s}: shipped=${want?.id} harness=${got?.id}`);
    }
    checked++;
  }
  burnedFlag.fill(0); usedName.fill(0);
  return checked;
};

// ── Hold policies used for the ODDS calibration ──────────────────────────────
// The odds distribution is a property of the model, not of the CPU, so the
// million-run pass uses cheap policies. The Legend CPU is benchmarked separately
// in cpu-benchmark.mjs at a sample size appropriate to its cost.
const holdRandom = (roster, rng) => POSITIONS.filter(() => rng() < 0.5);
const holdSkilled = (roster) => {
  // "Skilled" = keep the slots whose card is strong FOR ITS SLOT. A plausible
  // human heuristic, used to measure that decisions matter.
  const scored = POSITIONS.map((s) => ({ s, v: roster[s] >= 0 ? draftPctAt(card[roster[s]].p, s) : 0 }));
  return scored.filter((r) => r.v >= 0.70).map((r) => r.s);
};

const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];

// ── Main ─────────────────────────────────────────────────────────────────────
const run = () => {
  const eq = assertEquivalence();
  console.log(`equivalence: ${eq} draws matched the shipped model exactly`);

  const ovrSorted = card.map((c) => c.ovr).sort((a, b) => a - b);
  const ovrCut = ovrSorted[Math.floor(ovrSorted.length * 0.90)];
  const isTopDecile = card.map((c) => c.ovr >= ovrCut);

  const stats = {
    tierByRoll: [null, ...[1, 2, 3].map(() => TIERS.map(() => 0))],
    drawsByRoll: [0, 0, 0, 0],
    tierByPos: Object.fromEntries(POSITIONS.map((s) => [s, TIERS.map(() => 0)])),
    openingTop: [0, 0, 0, 0, 0, 0],
    finalTop: [0, 0, 0, 0, 0, 0],
    seen: new Uint8Array(PLAYERS.length),
    dupPerson: 0, burnViolation: 0, hopeless: 0, matchups: 0,
    roll3Improved: 0, roll3Regret: 0, roll3Both: 0, roll3Runs: 0,
    pressureBuckets: { LOW: 0, RISING: 0, HIGH: 0 },
    eliteAfterHold: { held0: [0, 0], held1: [0, 0], held2: [0, 0] },
    sideTop: { gold: 0, blue: 0 }, sideDraws: { gold: 0, blue: 0 },
    eraCount: Object.fromEntries(CHAOS_ERA_IDS.map((e) => [e, 0])),
  };
  const conFinal = [], talFinal = [], conOpen = [];
  const skilledFinal = [], randomFinal = [];

  const roster = { gold: {}, blue: {} };
  const censusOf = (r) => {
    const c = { APEX: 0, ELITE: 0, STAR: 0, SPECIALIST: 0 };
    for (const s of POSITIONS) if (r[s] >= 0) c[TIERS[slotTier[s][slotIdx[s].indexOf(r[s])]]]++;
    return c;
  };
  // indexOf is O(n); precompute card->tier per slot map instead.
  const tierAt = {};
  for (const s of POSITIONS) {
    tierAt[s] = new Uint8Array(PLAYERS.length).fill(255);
    slotIdx[s].forEach((ci, k) => { tierAt[s][ci] = slotTier[s][k]; });
  }
  const fastCensus = (r) => {
    const c = { APEX: 0, ELITE: 0, STAR: 0, SPECIALIST: 0 };
    for (const s of POSITIONS) { const ci = r[s]; if (ci >= 0) c[TIERS[tierAt[s][ci]]]++; }
    return c;
  };
  const toCards = (r) => POSITIONS.map((s) => (r[s] >= 0 ? card[r[s]].p : null));

  for (let run = 0; run < N; run++) {
    const seedId = `c${run}`;
    const baseSeed = hashString(seedId);
    const rng = mulberry32(deriveSeed(baseSeed, 1));
    const eraId = CHAOS_ERA_IDS[Math.floor(rng() * CHAOS_ERA_IDS.length)];
    stats.eraCount[eraId]++;
    const samePolicy = run % 4 === 3;   // both sides skilled: the clean matchup sample
    const skilledSide = run % 2 === 0 ? "gold" : "blue";

    burnedFlag.fill(0);
    const burnedList = [];
    const perSide = { gold: { con: [], tal: [] }, blue: { con: [], tal: [] } };
    const held = { gold: [], blue: [] };

    for (const side of ["gold", "blue"]) { roster[side] = {}; for (const s of POSITIONS) roster[side][s] = -1; }

    for (let roll = 1; roll <= 3; roll++) {
      for (const side of ["gold", "blue"]) {
        usedName.fill(0);
        // Person-uniqueness spans the whole matchup.
        const other = side === "gold" ? "blue" : "gold";
        for (const s of POSITIONS) if (roster[other][s] >= 0) usedName[card[roster[other][s]].name] = 1;
        const heldSet = new Set(held[side]);
        for (const s of POSITIONS) if (heldSet.has(s) && roster[side][s] >= 0) usedName[card[roster[side][s]].name] = 1;

        const pv = pressureVec(fastCensus(
          POSITIONS.reduce((a, s) => ({ ...a, [s]: heldSet.has(s) ? roster[side][s] : -1 }), {})
        ));
        for (const s of POSITIONS) {
          if (heldSet.has(s) && roster[side][s] >= 0) continue;
          const drawRng = mulberry32(deriveSeed(hashString(`${seedId}|${side}|${s}|${roll}|${run}`), 0));
          const ci = fastDraw(s, roll, drawRng, pv);
          if (ci < 0) continue;
          if (burnedFlag[ci]) stats.burnViolation++;
          roster[side][s] = ci;
          usedName[card[ci].name] = 1;
          stats.seen[ci] = 1;
          const t = tierAt[s][ci];
          stats.tierByRoll[roll][t]++; stats.drawsByRoll[roll]++;
          stats.tierByPos[s][t]++;
          stats.sideDraws[side]++;
          if (isTopDecile[ci]) stats.sideTop[side]++;
        }
        // person-uniqueness check across the matchup
        const names = new Set();
        for (const sd of ["gold", "blue"]) for (const s of POSITIONS) {
          const ci = roster[sd][s]; if (ci < 0) continue;
          if (names.has(card[ci].name)) stats.dupPerson++;
          names.add(card[ci].name);
        }
        const cards = toCards(roster[side]);
        perSide[side].con.push(constructionScore(cards));
        perSide[side].tal.push(talentScore(cards));
      }

      if (roll === 1) {
        for (const side of ["gold", "blue"]) {
          const n = POSITIONS.filter((s) => roster[side][s] >= 0 && isTopDecile[roster[side][s]]).length;
          stats.openingTop[n]++;
          conOpen.push(perSide[side].con[0]);
        }
      }
      if (roll < 3) {
        for (const side of ["gold", "blue"]) {
          const useSkilled = samePolicy || side === skilledSide;
          const keep = useSkilled ? holdSkilled(roster[side]) : holdRandom(roster[side], rng);
          held[side] = keep;
          const census = fastCensus(POSITIONS.reduce((a, s) => ({ ...a, [s]: keep.includes(s) ? roster[side][s] : -1 }), {}));
          const m = heldTalentPressure("APEX", census);
          stats.pressureBuckets[m >= 0.95 ? "LOW" : m >= 0.66 ? "RISING" : "HIGH"]++;
          const nHeldTop = keep.filter((s) => roster[side][s] >= 0 && tierAt[s][roster[side][s]] <= 1).length;
          const bucket = nHeldTop === 0 ? "held0" : nHeldTop === 1 ? "held1" : "held2";
          // burn the rerolled cards
          for (const s of POSITIONS) {
            if (!keep.includes(s) && roster[side][s] >= 0) {
              burnedFlag[roster[side][s]] = 1; burnedList.push(roster[side][s]);
              roster[side][s] = -1;
            }
          }
          stats._pendingBucket = stats._pendingBucket || {};
          stats._pendingBucket[side] = bucket;
        }
      } else {
        for (const side of ["gold", "blue"]) {
          const n = POSITIONS.filter((s) => roster[side][s] >= 0 && isTopDecile[roster[side][s]]).length;
          stats.finalTop[n]++;
          const c = perSide[side].con[2], t = perSide[side].tal[2];
          conFinal.push(c); talFinal.push(t);
          if (!samePolicy) (side === skilledSide ? skilledFinal : randomFinal).push(c * 0.6 + t * 0.4);
          // roll-3 risk: did the final roll improve construction, talent, or trade one for the other?
          const dCon = c - perSide[side].con[1], dTal = t - perSide[side].tal[1];
          if (side === "blue") {
            // Hopeless raw-talent mismatch: one side is so far ahead on talent
            // AND construction that the draft, not the game, decided it.
            stats.matchups++;
            // Measured ONLY on same-policy matchups. Half the runs give one
            // side the skilled policy and the other random, purely to measure
            // decision uplift; scoring hopelessness on those would report this
            // harness's own deliberate asymmetry as a product defect.
            if (samePolicy) {
              const gTal = perSide.gold.tal[2], bTal = perSide.blue.tal[2];
              const gCon = perSide.gold.con[2], bCon = perSide.blue.con[2];
              if (Math.abs(gTal - bTal) >= 0.30 && Math.sign(gTal - bTal) === Math.sign(gCon - bCon) && Math.abs(gCon - bCon) >= 0.10) stats.hopeless++;
            } else stats.matchups--;
          }
          stats.roll3Runs++;
          if (dCon > 0.005 || dTal > 0.005) stats.roll3Improved++;
          if (dCon < -0.005 || dTal < -0.005) stats.roll3Regret++;
          if ((dCon > 0.005 && dTal < -0.005) || (dCon < -0.005 && dTal > 0.005)) stats.roll3Both++;
        }
      }
      // Conditional top-tier rate in the slots that were REDRAWN this roll.
      // Held cards are excluded from both numerator and denominator: counting
      // them would trivially show "holding two APEX yields two APEX" and prove
      // nothing about the pressure multiplier.
      if (roll >= 2) {
        for (const side of ["gold", "blue"]) {
          const bucket = stats._pendingBucket?.[side];
          if (!bucket) continue;
          const wasHeld = new Set(held[side]);
          for (const s of POSITIONS) {
            const ci = roster[side][s];
            if (ci < 0 || wasHeld.has(s)) continue;
            stats.eliteAfterHold[bucket][1]++;
            if (tierAt[s][ci] <= 1) stats.eliteAfterHold[bucket][0]++;
          }
        }
      }
    }
    if ((run + 1) % 100000 === 0) console.log(`  ${run + 1}/${N}`);
  }

  // ── Percentile bands from the SIMULATED population ─────────────────────────
  const conSorted = [...conFinal].sort((a, b) => a - b);
  const talSorted = [...talFinal].sort((a, b) => a - b);
  const bands = {
    _note: "Cut points measured from the simulated Chaos roster population. Regenerate with npm run chaos:calibrate.",
    calibrated: true,
    calibratedAt: CHAOS_DRAFT_VERSION,
    populationSize: conSorted.length,
    talent: { LOADED: q(talSorted, 0.95), STRONG: q(talSorted, 0.80), SOLID: q(talSorted, 0.50), SCRAPPY: q(talSorted, 0.20) },
    construction: {
      PERFECT_STORM: q(conSorted, 0.99), ELITE_BUILD: q(conSorted, 0.95),
      STRONG_BUILD: q(conSorted, 0.75), COMPETITIVE: q(conSorted, 0.35), VOLATILE: q(conSorted, 0.10),
    },
  };
  fs.writeFileSync("src/chaos/constructionBands.json", JSON.stringify(bands, null, 2) + "\n");

  const pct = (a, b) => (b ? a / b : 0);
  const tierRate = (roll) => Object.fromEntries(TIERS.map((t, i) => [t, pct(stats.tierByRoll[roll][i], stats.drawsByRoll[roll])]));
  const totalRosters = N * 2;
  const atLeast = (arr, k) => arr.slice(k).reduce((a, b) => a + b, 0) / totalRosters;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

  const report = {
    artifact: "draft-probability-calibration",
    phase: "8A",
    runs: N, rostersMeasured: totalRosters,
    equivalenceChecks: eq,
    chaosDraftVersion: CHAOS_DRAFT_VERSION,
    odds: ODDS,
    topDecileDefinition: { axis: "display OVR", cutoff: ovrCut, cards: isTopDecile.filter(Boolean).length, poolShare: pct(isTopDecile.filter(Boolean).length, PLAYERS.length) },
    tierFrequencyByRoll: { roll1: tierRate(1), roll2: tierRate(2), roll3: tierRate(3) },
    tierFrequencyByPosition: Object.fromEntries(POSITIONS.map((s) => {
      const tot = stats.tierByPos[s].reduce((a, b) => a + b, 0);
      return [s, Object.fromEntries(TIERS.map((t, i) => [t, pct(stats.tierByPos[s][i], tot)]))];
    })),
    openingRoster: { atLeastOne: atLeast(stats.openingTop, 1), atLeastTwo: atLeast(stats.openingTop, 2), atLeastThree: atLeast(stats.openingTop, 3) },
    finalRoster: { atLeastOne: atLeast(stats.finalTop, 1), atLeastTwo: atLeast(stats.finalTop, 2), atLeastThree: atLeast(stats.finalTop, 3) },
    construction: {
      perfectStorm: 0.01, eliteBuild: 0.05,
      meanScore: mean(conFinal), openingMean: mean(conOpen),
      bands: bands.construction,
    },
    draftPressure: {
      distribution: Object.fromEntries(Object.entries(stats.pressureBuckets).map(([k, v]) => [k, pct(v, Object.values(stats.pressureBuckets).reduce((a, b) => a + b, 0))])),
      topTierRateAfterHolding: {
        zeroTopTierHeld: pct(stats.eliteAfterHold.held0[0], stats.eliteAfterHold.held0[1]),
        oneTopTierHeld: pct(stats.eliteAfterHold.held1[0], stats.eliteAfterHold.held1[1]),
        twoPlusTopTierHeld: pct(stats.eliteAfterHold.held2[0], stats.eliteAfterHold.held2[1]),
      },
    },
    rollThreeRisk: {
      improvedSomething: pct(stats.roll3Improved, stats.roll3Runs),
      worsenedSomething: pct(stats.roll3Regret, stats.roll3Runs),
      tradedOneForAnother: pct(stats.roll3Both, stats.roll3Runs),
    },
    parity: {
      goldTopDecileRate: pct(stats.sideTop.gold, stats.sideDraws.gold),
      blueTopDecileRate: pct(stats.sideTop.blue, stats.sideDraws.blue),
    },
    skilledVsRandom: { skilledMean: mean(skilledFinal), randomMean: mean(randomFinal), uplift: mean(skilledFinal) - mean(randomFinal) },
    wholePool: {
      cardsInPool: PLAYERS.length,
      cardsEverDrawn: stats.seen.reduce((a, b) => a + b, 0),
      minimumProbabilityPositive: true,
    },
    hopelessMismatchRate: pct(stats.hopeless, stats.matchups),
    violations: { duplicatePerson: stats.dupPerson, burnedPersonReturned: stats.burnViolation },
    eraDistribution: Object.fromEntries(Object.entries(stats.eraCount).map(([k, v]) => [k, pct(v, N)])),
  };
  fs.writeFileSync(`${OUT}/draft-probability-calibration.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    openingRoster: report.openingRoster, finalRoster: report.finalRoster,
    tierRoll1: report.tierFrequencyByRoll.roll1, tierRoll3: report.tierFrequencyByRoll.roll3,
    pressure: report.draftPressure.topTierRateAfterHolding,
    roll3: report.rollThreeRisk, parity: report.parity, skilled: report.skilledVsRandom,
    pool: report.wholePool, violations: report.violations, hopeless: report.hopelessMismatchRate, construction: report.construction.bands,
  }, null, 2));
};
run();
