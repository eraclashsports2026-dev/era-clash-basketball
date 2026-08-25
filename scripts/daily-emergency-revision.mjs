#!/usr/bin/env node
// ── Issue an emergency replacement for one UTC date's official Daily ──────────
// This is the ONLY way a date gets a second official Daily. No deployment, no
// version change, and no automatic path may do this — that is the entire point
// of the revision model.
//
//   npm run daily:emergency-revision -- --date=20260825 \
//     --operator="ops:jj" --reason="coach option pool contained a retired id"
//
// The prior revision is preserved and stays readable, so its results and
// leaderboard remain attributable to the puzzle they were actually played on.
import { issueEmergencyRevision, officialDailyConfig, readPointer } from "../api/_lib/dailyOfficial.js";
import { hasStore } from "../api/_lib/store.js";

const arg = (name) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const main = async () => {
  const date = arg("date");
  const reason = arg("reason");
  const operator = arg("operator");
  const confirm = process.argv.includes("--confirm");

  if (!/^\d{8}$/.test(String(date))) {
    console.error("--date=YYYYMMDD (UTC) is required");
    process.exit(1);
  }
  if (!hasStore()) {
    console.error("No store configured. An emergency revision must be durable — refusing.");
    process.exit(1);
  }

  const current = await readPointer(date);
  const existing = await officialDailyConfig(date);
  console.log(`UTC date:            ${date}`);
  console.log(`Current revision:    ${current ?? "(none)"}`);
  console.log(`Current official id: ${existing.config.officialDailyId}`);
  console.log(`Current era style:   ${existing.config.officialEraStyleId}`);
  console.log(`Current coaches:     ${existing.config.coachOptionIds.join(", ")}`);
  console.log(`Reason:              ${reason ?? "(missing)"}`);
  console.log(`Operator:            ${operator ?? "(missing)"}`);

  if (!confirm) {
    console.log("\nDry run. This will REPLACE the official Daily for that date and start a");
    console.log("separate leaderboard identity. Re-run with --confirm to proceed.");
    return;
  }

  const rev = await issueEmergencyRevision({ date: undefined, utcDate: date, reason, operator });
  console.log(`\n✓ Issued revision ${rev.revision} (was ${rev.previousRevision})`);
  console.log(`  New official id:   ${rev.config.officialDailyId}`);
  console.log(`  Replaces:          ${rev.config.replaces}`);
  console.log(`  New era style:     ${rev.config.officialEraStyleId}`);
  console.log(`  New coaches:       ${rev.config.coachOptionIds.join(", ")}`);
  console.log(`  Prior preserved:   ${rev.priorPreserved ? "yes" : "NO — investigate"}`);
};

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
