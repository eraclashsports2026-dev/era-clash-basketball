// ── The calibration profile adapter contract ─────────────────────────────────
//
// buildCalibrationPlayerProfile (a frozen Candidate 2 core file) reads the
// fields below from a season record. Historical V6 handed it 13-field manifest
// rows, so 12 inputs silently vanished, spacingGravity pinned to one fallback
// value and every decade evaluated to "NaNs". The adapter itself cannot change
// without changing the candidate, so the contract is enforced HERE, before a
// record ever reaches it: an incomplete record is refused by the validation
// layer, not quietly absorbed by the core.
//
// Field list derived from the adapter source, not from a report.
export const ADAPTER_CONTRACT_VERSION = "1.0.0";

export const CONTRACT = Object.freeze([
  { fieldId: "calibrationPlayerId", domain: "identity", required: true, nullable: false, type: "string" },
  { fieldId: "calibrationPersonId", domain: "identity", required: true, nullable: false, type: "string" },
  { fieldId: "publicPersonId", domain: "identity", required: true, nullable: true, type: "string",
    confidenceEffect: "linkage enables person-prior inheritance" },
  { fieldId: "name", domain: "identity", required: true, nullable: false, type: "string" },
  { fieldId: "seasonStartYear", domain: "seasonStartYear", required: true, nullable: false, type: "integer",
    prohibition: "NaN here produces decade 'NaNs' downstream — the exact V6 defect" },
  { fieldId: "eraStyleId", domain: "identity", required: true, nullable: false, type: "string" },
  { fieldId: "primaryPosition", domain: "positions", required: true, nullable: false, type: "enum:PG|SG|SF|PF|C" },
  { fieldId: "secondaryPositions", domain: "positions", required: true, nullable: false, type: "string[]",
    defaultPolicy: "empty array is valid data (no secondary positions), not missing data" },
  { fieldId: "lineupRole", domain: "usage", required: true, nullable: false, type: "enum:STARTER|ROTATION|RESERVE|MARGINAL" },
  { fieldId: "basicStats", domain: "perGameStats", required: true, nullable: false, type: "object",
    fallbackPolicy: "individual stats may be null (unrecorded in era); the OBJECT itself must exist" },
  { fieldId: "rateStats", domain: "rateStats", required: true, nullable: true, type: "object" },
  { fieldId: "shootingProfile", domain: "shootingProfile", required: true, nullable: true, type: "object",
    prohibition: "an ABSENT object silently pinned spacingGravity to one fallback value across all sixteen V6 sides. Absent ⇒ refuse; explicitly null fields inside ⇒ allowed with confidence effect" },
  { fieldId: "offensiveRoles", domain: "offensiveRoles", required: true, nullable: false, type: "string[]",
    defaultPolicy: "empty array must carry roleResolution INSUFFICIENT_EVIDENCE via enrichment detail, never appear as silently-normal evidence" },
  { fieldId: "defensiveEvidence", domain: "defensiveEvidence", required: true, nullable: true, type: "object",
    fallbackPolicy: "null means no documented evidence; measured steals/blocks remain the evidence. Never becomes zero defense." },
  { fieldId: "physicalProfile", domain: "physical", required: true, nullable: true, type: "object" },
  { fieldId: "accolades", domain: "awards", required: false, nullable: true, type: "string[]",
    defaultPolicy: "optional list; absent on every store record by design" },
  { fieldId: "provenance", domain: "provenance", required: true, nullable: false, type: "object" },
  { fieldId: "confidence", domain: "confidence", required: true, nullable: false, type: "string" },
]);

export const REQUIRED_FIELDS = Object.freeze(CONTRACT.filter((f) => f.required).map((f) => f.fieldId));

export class AdapterContractError extends Error {
  constructor(message, code, detail) { super(message); this.name = "AdapterContractError"; this.code = code; this.detail = detail; }
}

/** Validate one season record BEFORE it reaches the frozen adapter. */
export const validateCalibrationRecord = (record) => {
  const problems = [];
  for (const f of CONTRACT) {
    if (!f.required) continue;
    if (!(f.fieldId in record)) { problems.push({ field: f.fieldId, code: "MISSING_FIELD" }); continue; }
    const val = record[f.fieldId];
    if (val == null && !f.nullable) problems.push({ field: f.fieldId, code: "NULL_NOT_ALLOWED" });
  }
  const y = record.seasonStartYear;
  if (y != null && (typeof y !== "number" || !Number.isFinite(y))) {
    problems.push({ field: "seasonStartYear", code: "NAN_OR_NON_NUMERIC", value: String(y) });
  }
  if (typeof y === "string") problems.push({ field: "seasonStartYear", code: "NUMERIC_STRING_REJECTED" });
  return { valid: problems.length === 0, problems };
};

/** Validate the adapter's OUTPUT for the prohibitions the contract names. */
export const validateBuiltProfile = (profile) => {
  const problems = [];
  if (String(profile.decade).includes("NaN")) problems.push({ field: "decade", code: "NAN_DECADE", value: profile.decade });
  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (typeof v === "number" && Number.isNaN(v)) problems.push({ field: `${path}.${k}`, code: "NAN_VALUE" });
    }
  };
  walk(profile.offense, "offense"); walk(profile.defense, "defense"); walk(profile.fit, "fit");
  return { valid: problems.length === 0, problems };
};
