// Closed saved-career presentation keys. The existing schema accepts text mode
// values; underscores also satisfy saved_rosters.source_mode's shape contract.
export const LOOP_CAREER_MODES = Object.freeze({
  'any-five': 'loop_any_five', daily: 'loop_daily', spin: 'loop_spin',
  'one-franchise': 'loop_one_franchise', 'one-per-era': 'loop_one_per_era',
  'no-mvps': 'loop_no_mvps', gauntlet: 'loop_gauntlet', lab: 'loop_lab',
  franchise: 'loop_franchise', tonight: 'loop_tonight',
});
const modesByKey = new Map(Object.entries(LOOP_CAREER_MODES).map(([mode, key]) => [key, mode]));
const careerKeys = new Map(Object.entries(LOOP_CAREER_MODES));
export function loopCareerMode(record) { return careerKeys.get(record?.loop?.mode) || null; }
export function loopModeFromCareer(clash) {
  const snapshotMode = clash?.result_snapshot?.loop?.mode;
  return careerKeys.has(snapshotMode) ? snapshotMode : modesByKey.get(clash?.mode) || null;
}
