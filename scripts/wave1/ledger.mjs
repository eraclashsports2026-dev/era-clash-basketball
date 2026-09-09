// ── Phase 6C6 resolution ledger ───────────────────────────────────────────────
import { readFileSync, existsSync, writeFileSync } from "node:fs";
export const DIR = "data/validation/6c6";
export const LEDGER_PATH = `${DIR}/phase6c6-resolution-ledger.json`;
export const readLedger = () => JSON.parse(readFileSync(LEDGER_PATH, "utf8")).data;
export const SEED = [
  ["w01","prior preview keys exposed in phase 6C5 conversation output","CRITICAL"],
  ["w02","old key revocation (deployed proof)","HIGH"],
  ["w03","new owner key","HIGH"],
  ["w04","five unique tester keys","HIGH"],
  ["w05","raw-key storage (gitignored, 0600, never committed/logged)","CRITICAL"],
  ["w06","cookie/session security (raw key stored in browser cookie)","CRITICAL"],
  ["w07","tester identity attribution (pseudonymous, server-authoritative)","HIGH"],
  ["w08","individual revocation without collateral","HIGH"],
  ["w09","session expiration + reauthentication","HIGH"],
  ["w10","stable preview address","HIGH"],
  ["w11","stable alias redeploy proof","HIGH"],
  ["w12","scenario launcher","HIGH"],
  ["w13","scenario validity (cards, coaches, positions, dup-person, no preset winner)","HIGH"],
  ["w14","feedback attribution (testerId + resultId, key never stored)","HIGH"],
  ["w15","feedback deduplication + resubmission behavior","MEDIUM"],
  ["w16","feedback privacy (no key/cookie/PII in records)","HIGH"],
  ["w17","feedback report command","MEDIUM"],
  ["w18","product metrics report command","MEDIUM"],
  ["w19","access audit command","MEDIUM"],
  ["w20","existing feedback review (P0-P4 classification)","HIGH"],
  ["w21","desktop QA (deployed)","HIGH"],
  ["w22","mobile QA (deployed)","HIGH"],
  ["w23","access gate QA (deployed, rotated credentials)","HIGH"],
  ["w24","preview namespace isolation (unchanged surfaces)","HIGH"],
  ["w25","production isolation","HIGH"],
  ["w26","per-request fallback (unchanged path, re-verified)","HIGH"],
  ["w27","emergency-off availability (documented, unchanged)","MEDIUM"],
  ["w28","tester guide","MEDIUM"],
  ["w29","operator guide","MEDIUM"],
  ["w30","Wave 1 invite package + launch record","HIGH"],
];
export const applyClosures = (closures) => {
  const prior = existsSync(LEDGER_PATH) ? readLedger() : { items: SEED.map(([issueId, description, severity]) => ({ issueId, description, severity })) };
  const items = prior.items.map((i) => { const c = closures.find((x) => x.issueId === i.issueId); return c ? { ...i, ...c } : i; });
  for (const c of closures) if (!items.some((i) => i.issueId === c.issueId)) items.push(c);
  const open = items.filter((i) => !["FIXED_AND_VERIFIED","NOT_REPRODUCIBLE_WITH_EVIDENCE","EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK"].includes(i.resolutionStatus));
  writeFileSync(LEDGER_PATH, JSON.stringify({ artifact: "phase6c6-resolution-ledger",
    data: { items, unresolvedTechnicalFailures: open.length, unresolvedIds: open.map((i) => i.issueId) } }, null, 2) + "\n");
  return { unresolved: open.length, ids: open.map((i) => i.issueId) };
};
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = applyClosures([]);
  console.log(`ledger: ${r.unresolved} open of ${SEED.length}`);
}
