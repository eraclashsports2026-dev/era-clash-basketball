import { expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { allSealStatuses, setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";

const RESULTS = "data/validation/6c3/historical-holdout-results.json";
const RESULTS_V4 = "data/validation/6c3r/historical-holdout-v4-results.json";
const RESULTS_V5 = "data/validation/6c4b1/historical-holdout-v5-results.json";
const RESULTS_V6 = "data/validation/6c4c2/historical-v6-results.json";

/**
 * The seal invariant that replaced six separate "every accessCount is 0"
 * assertions when Phase 6C3 opened the historical holdout.
 *
 * Those assertions each meant "MY phase opened nothing", which is still true of
 * every phase that wrote one. What they literally checked stopped being true the
 * moment a later phase legitimately opened a set, and deleting them would have
 * removed the only guard on the thing that matters most in this project.
 *
 * The replacement verifies more than the bare zero did:
 *
 *   - `historical-holdout-v3` is at most 1 — a set is opened ONCE.
 *   - If it is 1, the opening is ATTRIBUTABLE: a results artifact exists, its
 *     recorded before/after counts are 0 and 1, and it carries an operator, a
 *     reason and the commit it was opened at.
 *   - Every OTHER sealed set is still exactly 0.
 *
 * A silent, unattributed, or repeated opening still fails.
 */
export const assertSealDiscipline = () => {
  const all = allSealStatuses();
  const hist = setAccessCount("historical-holdout-v3");

  expect(hist, "a sealed set is opened at most once").toBeLessThanOrEqual(1);

  if (hist === 1) {
    expect(existsSync(RESULTS), "an opened holdout must leave a results artifact").toBe(true);
    const d = JSON.parse(readFileSync(RESULTS, "utf8")).data;
    expect(d.set).toBe("historical-holdout-v3");
    expect(d.accessCountBefore).toBe(0);
    expect(d.accessCountAfter).toBe(1);
    expect(d.accessEvent.actor, "the access event must name an operator").toBeTruthy();
    expect(String(d.accessEvent.reason).length, "the access event must carry a reason").toBeGreaterThan(20);
    expect(d.accessEvent.openedAtCommit, "the access event must record the commit").toBeTruthy();
  }

  // Phase 6C3R opened the replacement set once; the same attributability rules
  // bind it that bind V3.
  const v4 = setAccessCount("historical-holdout-v4");
  expect(v4, "a sealed set is opened at most once").toBeLessThanOrEqual(1);
  if (v4 === 1) {
    expect(existsSync(RESULTS_V4), "an opened V4 must leave a results artifact").toBe(true);
    const d = JSON.parse(readFileSync(RESULTS_V4, "utf8")).data;
    expect(d.set).toBe("historical-holdout-v4");
    expect(d.accessCountBefore).toBe(0);
    expect(d.accessCountAfter).toBe(1);
    expect(d.accessEvent.actor).toBeTruthy();
    expect(String(d.accessEvent.reason).length).toBeGreaterThan(20);
  }

  // Phase 6C4B2R opened Historical V5 once, on Candidate 1. Same rules, plus
  // one more that only applies from V5 onward: the run must name the candidate
  // it scored, because Candidate 0 and Candidate 1 share a parameter-set hash
  // and only the core hash separates them.
  const v5 = setAccessCount("historical-holdout-v5");
  expect(v5, "a sealed set is opened at most once").toBeLessThanOrEqual(1);
  if (v5 === 1) {
    expect(existsSync(RESULTS_V5), "an opened V5 must leave a results artifact").toBe(true);
    const d = JSON.parse(readFileSync(RESULTS_V5, "utf8")).data;
    expect(d.set).toBe("historical-holdout-v5");
    expect(d.accessCountBefore).toBe(0);
    expect(d.accessCountAfter).toBe(1);
    expect(d.accessEvent.actor).toBeTruthy();
    expect(String(d.accessEvent.reason).length).toBeGreaterThan(20);
    expect(d.accessEvent.openedAtCommit).toBeTruthy();
    expect(d.identity?.candidateId, "an opened set must name the candidate it scored").toBeTruthy();
    expect(d.identity?.coreHash, "and the core hash that identifies it").toMatch(/^[0-9a-f]{64}$/);
    expect(["HISTORICAL_HOLDOUT_V5_PASS", "HISTORICAL_HOLDOUT_V5_FAIL", "HISTORICAL_HOLDOUT_V5_INVALID_RUN"])
      .toContain(d.verdict);
  }

  // Phase 6C4C3 opened Historical V6 once, on Candidate 2. Same rules as V5,
  // because the reason V5 needed them applies at least as strongly here: three
  // candidates now share a parameter-set hash lineage and only the core hash
  // separates them.
  const v6 = setAccessCount("historical-holdout-v6");
  expect(v6, "a sealed set is opened at most once").toBeLessThanOrEqual(1);
  if (v6 === 1) {
    expect(existsSync(RESULTS_V6), "an opened V6 must leave a results artifact").toBe(true);
    const d = JSON.parse(readFileSync(RESULTS_V6, "utf8")).data;
    expect(d.set).toBe("historical-holdout-v6");
    expect(d.accessCountBefore).toBe(0);
    expect(d.accessCountAfter).toBe(1);
    expect(d.accessEvent.actor).toBeTruthy();
    expect(String(d.accessEvent.reason).length).toBeGreaterThan(20);
    expect(d.accessEvent.openedAtCommit).toBeTruthy();
    expect(d.identity?.candidateId, "an opened set must name the candidate it scored").toBeTruthy();
    expect(d.identity?.coreHash, "and the core hash that identifies it").toMatch(/^[0-9a-f]{64}$/);
    expect(["HISTORICAL_HOLDOUT_V6_PASS", "HISTORICAL_HOLDOUT_V6_FAIL", "HISTORICAL_HOLDOUT_V6_INVALID_RUN"])
      .toContain(d.verdict);
    expect(d.runStatus, "an opened set must reach a terminal run state").toBe("COMPLETE");
  }

  // Everything else stays sealed, including the synthetic stress holdout.
  const OPENED = ["historical-holdout-v3", "historical-holdout-v4", "historical-holdout-v5",
    "historical-holdout-v6"];
  for (const [id, v] of Object.entries(all)) {
    if (OPENED.includes(id)) continue;
    expect(v.accessCount, `${id} has been accessed and should not have been`).toBe(0);
  }
  // The synthetic stress holdout opens only after a historical holdout PASSES.
  // V5 has now been opened, so the condition is no longer "none has run" but
  // "none has passed" — which is what the frozen stage order actually requires.
  const v5Verdict = v5 === 1 && existsSync(RESULTS_V5)
    ? JSON.parse(readFileSync(RESULTS_V5, "utf8")).data.verdict : null;
  const v6Verdict = v6 === 1 && existsSync(RESULTS_V6)
    ? JSON.parse(readFileSync(RESULTS_V6, "utf8")).data.verdict : null;
  // The condition is "no historical holdout has PASSED", not "none has run".
  // Both V5 and V6 have now run and both failed, so the synthetic set must still
  // be at zero — which is the frozen stage order, stated as the code checks it.
  const aHistoricalHoldoutPassed = v5Verdict === "HISTORICAL_HOLDOUT_V5_PASS"
    || v6Verdict === "HISTORICAL_HOLDOUT_V6_PASS";
  if (!aHistoricalHoldoutPassed) {
    expect(setAccessCount("synthetic-stress-holdout-v2"),
      `the synthetic stress holdout must remain sealed: no historical holdout has passed (V5 ${v5Verdict ?? "not run"}, V6 ${v6Verdict ?? "not run"})`).toBe(0);
  } else {
    expect(setAccessCount("synthetic-stress-holdout-v2"),
      "a sealed set is opened at most once").toBeLessThanOrEqual(1);
  }

  return { historicalHoldoutAccessCount: hist, historicalHoldoutV4AccessCount: v4,
    historicalHoldoutV5AccessCount: v5, historicalHoldoutV5Verdict: v5Verdict,
    historicalHoldoutV6AccessCount: v6, historicalHoldoutV6Verdict: v6Verdict,
    syntheticStressSealed: setAccessCount("synthetic-stress-holdout-v2") === 0,
    allOthersSealed: true };
};

/** An import must never change a seal count, whatever the counts happen to be. */
export const assertImportChangedNoSeal = (before) => {
  for (const [id, v] of Object.entries(allSealStatuses())) {
    expect(v.accessCount, `${id} was changed by an import`).toBe(before[id]);
  }
};

export const sealSnapshot = () =>
  Object.fromEntries(Object.entries(allSealStatuses()).map(([k, v]) => [k, v.accessCount]));
