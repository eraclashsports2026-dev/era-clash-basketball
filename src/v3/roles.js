// ── Finite usage allocation & role economics ───────────────────────────────────
// Basketball has one ball. Team usage shares MUST sum to 1, so five historical
// 30%-usage stars cannot all keep their diets — someone sacrifices. There is
// no "superstar stacking penalty" constant anywhere in this file: the cost
// emerges from (a) the finite budget, (b) an efficiency-vs-usage curve, and
// (c) off-ball skills determining who keeps value when compressed.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// How much offense this player WANTS to run (their natural diet).
export const usageDemand = (dna) =>
  dna.usageTendency * 0.55 + dna.ballDominance * 0.25 + dna.creation * 0.20;

// Natural (historical-ish) usage share this player is built for.
export const naturalShare = (dna) => clamp(0.10 + usageDemand(dna) * 0.024, 0.12, 0.34);

// Allocate the finite budget. concentration (beta) comes from the coach:
// star-empowerment/iso coaches sharpen the hierarchy; ball-movement coaches
// flatten it. Returns shares summing to 1 plus per-player role economics.
export const allocateUsage = (dnas, { concentration = 1.0 } = {}) => {
  const beta = clamp(concentration, 0.6, 1.6);
  const weights = dnas.map((d) => Math.pow(Math.max(0.5, usageDemand(d)), 1.35 * beta));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let shares = weights.map((w) => w / wSum);
  // hard basketball floors/ceilings with cap-respecting renormalization:
  // iterate clamp→redistribute so no share ever escapes [0.08, 0.34]
  for (let iter = 0; iter < 8; iter++) {
    shares = shares.map((s) => clamp(s, 0.08, 0.34));
    const sum = shares.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) < 1e-6) break;
    const residual = 1 - sum;
    const adjustable = shares.map((s) => (residual > 0 ? s < 0.34 - 1e-9 : s > 0.08 + 1e-9));
    const pool = shares.reduce((a, s, i) => a + (adjustable[i] ? s : 0), 0) || 1;
    shares = shares.map((s, i) => (adjustable[i] ? s + residual * (s / pool) : s));
  }

  return dnas.map((d, i) => {
    const share = shares[i];
    const nat = naturalShare(d);
    const compression = Math.max(0, (nat - share) / nat);   // star squeezed below diet
    const strain = Math.max(0, (share - nat) / Math.max(nat, 0.12)); // role player forced up
    // Compressed stars lose value in proportion to how ball-dependent they
    // are; movement shooters / cutters / connectors keep theirs.
    const offBallRetention = 0.45 + d.offBall * 0.055; // 0.45 (ball-only) → 1.0 (elite off-ball)
    const compressionLoss = compression * (1 - Math.min(1, offBallRetention)) * 0.5;
    // Overstretched role players force worse shots than their skill supports.
    const strainLoss = Math.min(0.22, strain * 0.16);
    const effMult = clamp(1 - compressionLoss - strainLoss, 0.72, 1.06);
    return { dna: d, share, natural: nat, compression, strain, effMult };
  });
};

// Team creation supply vs demand: teams without enough on-ball creation eat
// worse shot quality and more turnovers; the check is capability-based, not a
// named penalty.
export const creationBalance = (alloc) => {
  const supply = alloc.reduce((s, a) => s + a.dna.creation * a.share, 0); // usage-weighted creation
  const passing = alloc.reduce((s, a) => s + a.dna.passing, 0) / alloc.length;
  // supply ~[2..9]; 5+ is healthy. Quality factor ±8%, TO factor ±15%.
  const shotQuality = clamp(0.92 + (supply - 5) * 0.02 + (passing - 5) * 0.008, 0.88, 1.06);
  const turnoverFactor = clamp(1.12 - (supply - 4) * 0.035 - (passing - 5) * 0.012, 0.85, 1.18);
  return { supply, passing, shotQuality, turnoverFactor };
};

// Human-readable role labels for postgame/preview (derived, not stored).
export const roleLabel = (a) => {
  const d = a.dna;
  if (a.share >= 0.26 && d.creation >= 7) return "Primary Creator";
  if (a.share >= 0.21 && d.creation >= 6) return "Secondary Creator";
  if (d.passing >= 7 && a.share < 0.21) return "Connector";
  if (d.postScoring >= 7 && d.pos !== "PG") return "Post Hub";
  if (d.threeTendency >= 7 && d.offBall >= 7) return "Movement Shooter";
  if (d.offBall >= 7 && d.finishing >= 7) return "Cutter / Roll Threat";
  if (d.outsideShooting >= 6) return "Spot-Up Threat";
  if (d.rimProtection >= 7) return "Rim Anchor";
  return "Role Player";
};
