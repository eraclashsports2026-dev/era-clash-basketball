// ── Reopening a saved Clash from My EraClash → History ────────────────────────
// The History list reads a light projection of saved_clashes (no snapshot: the
// snapshot is the whole stored result and can be large). Reopening one Clash
// reads that account's full row through the provider — `getSavedClash`, a
// select under the table's owner-only RLS policy — so another account, or an
// id that is not the viewer's, answers null and the report says it cannot be
// opened, with nothing about why.
//
// Before Clash Breakdown V1 the UI opened the LIST row directly; for a real
// account that row has no snapshot, so no saved report could be reopened. The
// in-memory test adapter returned every column from its list and hid it; both
// now share SAVED_CLASH_LIST_COLUMNS.
export const SAVED_CLASH_LIST_COLUMNS = Object.freeze([
  "id", "result_id", "mode", "user_side", "outcome", "gold_score", "blue_score", "era_id", "gold_roster", "blue_roster",
  "gold_coach", "blue_coach", "mvp", "candidate_id", "calibration_version", "theme_version", "played_at", "claimed_from", "favorite", "favorited_at",
]);
export const SAVED_CLASH_LIST_SELECT = SAVED_CLASH_LIST_COLUMNS.join(", ");
/** A list row as the real provider returns it: only the list columns. */
export const listProjection = (row) => Object.fromEntries(SAVED_CLASH_LIST_COLUMNS.filter((k) => k in row).map((k) => [k, row[k]]));

/**
 * Resolve what the saved-report view should show for a History row.
 * `fetchFull(resultId)` is the owner-only read. Returns
 *   { state: "ready", clash }        the row with its snapshot
 *   { state: "unavailable", clash }  no row for this viewer, or no snapshot
 */
export const loadSavedReport = async (clash, fetchFull) => {
  if (!clash) return { state: "unavailable", clash: null };
  if (clash.result_snapshot?.core) return { state: "ready", clash };
  let full = null;
  try { full = await fetchFull(clash.result_id); } catch { full = null; }
  return full?.result_snapshot?.core ? { state: "ready", clash: { ...clash, ...full } } : { state: "unavailable", clash: { ...clash } };
};
