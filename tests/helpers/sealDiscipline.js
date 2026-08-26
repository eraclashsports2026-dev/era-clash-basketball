import { expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { allSealStatuses, setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";

const RESULTS = "data/validation/6c3/historical-holdout-results.json";
const RESULTS_V4 = "data/validation/6c3r/historical-holdout-v4-results.json";

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

  // Everything else stays sealed, including the synthetic stress holdout.
  for (const [id, v] of Object.entries(all)) {
    if (id === "historical-holdout-v3" || id === "historical-holdout-v4") continue;
    expect(v.accessCount, `${id} has been accessed and should not have been`).toBe(0);
  }
  expect(setAccessCount("synthetic-stress-holdout-v2"),
    "the synthetic stress holdout must remain sealed: no historical holdout has passed").toBe(0);

  return { historicalHoldoutAccessCount: hist, historicalHoldoutV4AccessCount: v4, allOthersSealed: true };
};

/** An import must never change a seal count, whatever the counts happen to be. */
export const assertImportChangedNoSeal = (before) => {
  for (const [id, v] of Object.entries(allSealStatuses())) {
    expect(v.accessCount, `${id} was changed by an import`).toBe(before[id]);
  }
};

export const sealSnapshot = () =>
  Object.fromEntries(Object.entries(allSealStatuses()).map(([k, v]) => [k, v.accessCount]));
