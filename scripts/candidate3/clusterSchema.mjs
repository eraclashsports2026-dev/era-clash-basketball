// ── Hard-fail cluster schema enforcement (prospective) ───────────────────────
// The V6 cluster recorder read t.observed / t.reference while the trait schema
// names those fields subjectMean / referenceMean, so every formal cluster
// carried null means. This helper is the enforcement the schema-correction
// artifact promised: a future recorder that reads an absent field, or emits a
// hard-fail cluster with a null mean, fails loudly instead of recording nulls.
export const TRAIT_SCHEMA_FIELDS = Object.freeze(["traitId", "metric", "direction", "surface",
  "subjectMean", "referenceMean", "diff", "z", "ci95", "result", "hardFail",
  "practicalMargin", "beyondPracticalMargin", "statisticallyOpposite", "indeterminate", "reportedState"]);

export const REQUIRED_CLUSTER_FIELDS = Object.freeze(["matchupId", "side", "metricId",
  "measurementSurface", "expectedDirection", "subjectMean", "referenceMean",
  "difference", "practicalMargin", "zScore"]);

export class ClusterSchemaError extends Error {
  constructor(message, code) { super(message); this.name = "ClusterSchemaError"; this.code = code; }
}

/** Read a field from a trait record; an unknown field name is a hard fail. */
export const readTraitField = (trait, field) => {
  if (!TRAIT_SCHEMA_FIELDS.includes(field)) {
    throw new ClusterSchemaError(`cluster recorder read "${field}", which is not a trait-schema field`, "UNKNOWN_TRAIT_FIELD");
  }
  return trait[field];
};

/** Validate one hard-fail cluster before it is recorded. */
export const validateHardFailCluster = (cluster) => {
  for (const f of REQUIRED_CLUSTER_FIELDS) {
    if (!(f in cluster)) throw new ClusterSchemaError(`hard-fail cluster missing ${f}`, "MISSING_CLUSTER_FIELD");
  }
  if (cluster.subjectMean == null || cluster.referenceMean == null) {
    throw new ClusterSchemaError("hard-fail cluster carries a null mean — the exact V6 recording defect", "NULL_MEAN");
  }
  return true;
};
