#!/usr/bin/env node
// ── Typed target-entry access ────────────────────────────────────────────────
// Every target field is an entry object {value, availability, provenance,
// formula}. The 6C3R census read availability by OBJECT TRUTHINESS — an entry
// with value:null is still truthy — and reported 30/30 fixtures available when
// the usable truth was a fraction of that. This accessor is the only sanctioned
// way to read a target value: it types the entry, requires a finite number,
// and requires a value-bearing availability status. Object truthiness is not
// evidence.

/** Availability statuses under which a target entry legitimately carries a value. */
export const VALUE_BEARING = Object.freeze([
  "RECORDED_STATISTIC",
  "DERIVED_FROM_AUTHORIZED_TOTALS",
]);

/** Availability statuses under which value MUST be null. */
export const NULL_BEARING = Object.freeze([
  "NOT_RECORDED_IN_ERA",
  "SOURCE_BLOCKED_LICENSING",
]);

/**
 * Read one target entry. Never throws; returns a typed verdict:
 *   { usable: true,  value: number, availability }                — safe to use
 *   { usable: false, value: null,   availability, reason }        — do not use
 * A malformed entry (missing keys, non-finite value under a value-bearing
 * status, or a value under a null-bearing status) is reported as SCHEMA_VIOLATION
 * so a census can distinguish "legitimately null" from "the store is broken".
 */
export const readTargetValue = (entry) => {
  if (entry === null || entry === undefined || typeof entry !== "object" || Array.isArray(entry))
    return { usable: false, value: null, availability: null, reason: "MISSING_ENTRY" };
  if (!("value" in entry) || !("availability" in entry))
    return { usable: false, value: null, availability: entry.availability ?? null, reason: "SCHEMA_VIOLATION" };
  const { value, availability } = entry;
  if (VALUE_BEARING.includes(availability)) {
    if (typeof value === "number" && Number.isFinite(value)) return { usable: true, value, availability };
    return { usable: false, value: null, availability, reason: "SCHEMA_VIOLATION" };
  }
  if (NULL_BEARING.includes(availability)) {
    if (value === null) return { usable: false, value: null, availability, reason: "LEGITIMATELY_NULL" };
    return { usable: false, value: null, availability, reason: "SCHEMA_VIOLATION" };
  }
  return { usable: false, value: null, availability, reason: "UNKNOWN_AVAILABILITY" };
};

/** The naive truthiness read this module replaces — kept only so audits can
 *  quantify exactly what the defect misreported. Never use it to read data. */
export const naiveTruthinessRead = (entry) => Boolean(entry);
