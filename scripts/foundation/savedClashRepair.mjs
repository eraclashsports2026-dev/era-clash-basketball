#!/usr/bin/env node
// ── Saved-Clash field repair: generate the SQL from the application's own code ─
//   node scripts/foundation/savedClashRepair.mjs sql          → supabase/repairs/2026-09-24-saved-clash-fields.sql
//   node scripts/foundation/savedClashRepair.mjs equivalence  → SQL that proves, on a scratch row built from the
//                                                              captured Candidate 4 record, that the repair writes
//                                                              exactly what buildSavedClash writes (Preview only)
//
// The repair fills ONLY what the old mapping left empty, from the row's own
// result_snapshot, using the same rules as api/_lib/resultContract.js:
//   candidate_id / calibration_version / candidate_core_hash ← snapshot.candidate.{candidateId,
//     possessionCalibrationVersion, coreHash} when snapshot.preview = true
//   gold_coach / blue_coach ← { id, name } from snapshot.coachIds and the coach catalog (neutral stays null)
//   gold_roster / blue_roster names/positions ← the snapshot's own box-score line for the same id
// It never overwrites a non-null value, never invents a value, never re-runs a
// simulation, and touches no rating, XP, achievement, Challenge or Rivalry row.
// The coach catalog is emitted from src/v3/coaches.js, so no name is typed by hand.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { COACHES, NEUTRAL_COACH } from "../../src/v3/coaches.js";

const MODE = process.argv[2] || "sql";
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const catalog = COACHES.filter((c) => c.id !== NEUTRAL_COACH.id).map((c) => `(${lit(c.id)}, ${lit(String(c.name).slice(0, 40))})`).join(",\n  ");

// The repair body, shared by the production file and the equivalence proof. `:scope` narrows it to rows.
const repairBody = (scope = "true") => `
create temporary table if not exists _coach_catalog (id text primary key, name text not null) on commit drop;
insert into _coach_catalog (id, name) values
  ${catalog}
on conflict (id) do nothing;

-- candidate identity (preview-engine snapshots only; never overwrite)
update public.saved_clashes sc set
  candidate_id        = left(sc.result_snapshot->'candidate'->>'candidateId', 40),
  calibration_version = left(sc.result_snapshot->'candidate'->>'possessionCalibrationVersion', 20),
  candidate_core_hash = left(sc.result_snapshot->'candidate'->>'coreHash', 64)
where (${scope}) and sc.candidate_id is null and sc.calibration_version is null and sc.candidate_core_hash is null
  and sc.result_snapshot->>'preview' = 'true' and sc.result_snapshot->'candidate'->>'candidateId' is not null;

-- coaches: the catalog coach for the recorded id; neutral / absent stays null (no coach chosen)
update public.saved_clashes sc set gold_coach = jsonb_build_object('id', left(k.id, 40), 'name', left(cat.name, 40))
from (select s.id as row_id, s.result_snapshot->'coachIds'->>'gold' as id from public.saved_clashes s) k
join _coach_catalog cat on cat.id = k.id
where (${scope}) and k.row_id = sc.id and sc.gold_coach is null;
update public.saved_clashes sc set blue_coach = jsonb_build_object('id', left(k.id, 40), 'name', left(cat.name, 40))
from (select s.id as row_id, s.result_snapshot->'coachIds'->>'blue' as id from public.saved_clashes s) k
join _coach_catalog cat on cat.id = k.id
where (${scope}) and k.row_id = sc.id and sc.blue_coach is null;

-- rosters: every entry keeps its id and order; a null name/pos is filled from the snapshot's own box line for that id.
-- Only rows whose every roster id has a box line are touched (anything else is left for a catalog-aware pass).
update public.saved_clashes sc set gold_roster = (
  select jsonb_agg(jsonb_build_object('id', e->>'id',
           'name', coalesce(e->>'name', left(b->>'name', 40)), 'pos', coalesce(e->>'pos', left(b->>'pos', 4))) order by ord)
  from jsonb_array_elements(sc.gold_roster) with ordinality as r(e, ord)
  left join lateral (select l from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'gold') l where l->>'id' = e->>'id' limit 1) bx(b) on true)
where (${scope}) and exists (select 1 from jsonb_array_elements(sc.gold_roster) e where e->>'name' is null or e->>'pos' is null)
  and not exists (select 1 from jsonb_array_elements(sc.gold_roster) e where not exists (
        select 1 from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'gold') l where l->>'id' = e->>'id'));
update public.saved_clashes sc set blue_roster = (
  select jsonb_agg(jsonb_build_object('id', e->>'id',
           'name', coalesce(e->>'name', left(b->>'name', 40)), 'pos', coalesce(e->>'pos', left(b->>'pos', 4))) order by ord)
  from jsonb_array_elements(sc.blue_roster) with ordinality as r(e, ord)
  left join lateral (select l from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'blue') l where l->>'id' = e->>'id' limit 1) bx(b) on true)
where (${scope}) and exists (select 1 from jsonb_array_elements(sc.blue_roster) e where e->>'name' is null or e->>'pos' is null)
  and not exists (select 1 from jsonb_array_elements(sc.blue_roster) e where not exists (
        select 1 from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'blue') l where l->>'id' = e->>'id'));
`;

// The read-only audit, run before and after: counts only.
const AUDIT = `
select
  count(*)                                                                                             as saved_total,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_id is null)                 as candidate_missing_recoverable,
  count(*) filter (where result_snapshot->>'preview' is distinct from 'true' and candidate_id is null)  as candidate_null_production_engine,
  count(*) filter (where gold_coach is null and coalesce(result_snapshot->'coachIds'->>'gold','neutral') <> 'neutral') as gold_coach_missing,
  count(*) filter (where blue_coach is null and coalesce(result_snapshot->'coachIds'->>'blue','neutral') <> 'neutral') as blue_coach_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_roster) e where e->>'name' is null))           as gold_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_roster) e where e->>'name' is null))           as blue_names_missing,
  count(*) filter (where gold_coach is not null and gold_coach->>'id' <> result_snapshot->'coachIds'->>'gold')         as gold_coach_mismatch,
  count(*) filter (where candidate_id is not null and candidate_id <> result_snapshot->'candidate'->>'candidateId')      as candidate_mismatch
from public.saved_clashes;`;

if (MODE === "sql") {
  const sql = `-- ── 2026-09-24 saved-Clash field repair (generated by scripts/foundation/savedClashRepair.mjs) ──
-- Rows saved before the field-mapping fix carry null candidate identity, null
-- coaches and nameless rosters although their own result_snapshot records all
-- three. This fills ONLY those nulls from the snapshot. Idempotent: a second run
-- changes nothing. It never overwrites a value, never guesses, and touches no
-- rating, XP, achievement, Challenge or Rivalry row.

-- 0) audit (read-only) — run before and after
${AUDIT}

-- 1) backup (private schema; no client role can read it)
create schema if not exists ops_backup;
revoke all on schema ops_backup from public, anon, authenticated;
create table if not exists ops_backup.saved_clashes_20260924 as table public.saved_clashes;
revoke all on ops_backup.saved_clashes_20260924 from public, anon, authenticated;
create table if not exists ops_backup.repair_log (
  id bigserial primary key, repair text not null, ran_at timestamptz not null default now(),
  before jsonb not null, after jsonb not null);
revoke all on ops_backup.repair_log from public, anon, authenticated;

-- 2) repair (one transaction)
begin;
create temporary table _before on commit drop as ${AUDIT.trim().replace(/;$/, "")};
${repairBody()}
insert into ops_backup.repair_log (repair, before, after)
select 'saved-clash-fields-2026-09-24', (select to_jsonb(b) from _before b), (select to_jsonb(a) from (${AUDIT.trim().replace(/;$/, "")}) a);
commit;

-- 3) audit again (expected: every *_missing = 0, every *_mismatch = 0)
${AUDIT}
`;
  mkdirSync("supabase/repairs", { recursive: true });
  writeFileSync("supabase/repairs/2026-09-24-saved-clash-fields.sql", sql);
  console.log("wrote supabase/repairs/2026-09-24-saved-clash-fields.sql");
}

if (MODE === "equivalence") {
  // Build the scratch row exactly as the OLD mapping saved it (nulls), from the captured record,
  // then compute what the NEW buildSavedClash writes for the same record: the SQL must equal it.
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  const { buildSavedClash } = await import("../../api/_lib/cloudAccounts.js");
  const rec = JSON.parse(readFileSync("tests/fixtures/saved-clash/candidate4-chaos-record.json", "utf8"));
  const slim = { id: rec.id, preview: rec.preview, candidate: rec.candidate, coachIds: rec.coachIds, goldIds: rec.goldIds, blueIds: rec.blueIds, v3: { fullBox: { gold: rec.v3.fullBox.gold.map(({ id, name, pos }) => ({ id, name, pos })), blue: rec.v3.fullBox.blue.map(({ id, name, pos }) => ({ id, name, pos })) } } };
  const expected = buildSavedClash({ record: { ...rec, session: "x" }, userId: "u", claimedFrom: "signed_in" });
  const want = { candidate_id: expected.candidate_id, calibration_version: expected.calibration_version, candidate_core_hash: expected.candidate_core_hash, gold_coach: expected.gold_coach, blue_coach: expected.blue_coach, gold_roster: expected.gold_roster, blue_roster: expected.blue_roster };
  const oldRoster = (ids) => ids.map((id) => ({ id, name: null, pos: null }));
  const U = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const sql = `begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('${U}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa-repair@example.invalid','x',now(),now(),now(),'{}','{}');
insert into public.saved_clashes (user_id, result_id, mode, user_side, outcome, gold_score, blue_score, era_id, gold_roster, blue_roster, gold_coach, blue_coach, candidate_id, calibration_version, candidate_core_hash, result_snapshot, claimed_from, played_at)
values ('${U}', ${lit(rec.id)}, 'chaos', 'gold', 'win', ${rec.core.finalScore.gold}, ${rec.core.finalScore.blue}, ${lit(rec.eraId)}, ${lit(JSON.stringify(oldRoster(rec.goldIds)))}::jsonb, ${lit(JSON.stringify(oldRoster(rec.blueIds)))}::jsonb, null, null, null, null, null, ${lit(JSON.stringify(slim))}::jsonb, 'signed_in', now());
create temporary table _qa (n serial, step text, out jsonb) on commit drop;
${repairBody(`sc.user_id = '${U}'`)}
insert into _qa (step, out) select 'first run equals buildSavedClash', to_jsonb(jsonb_build_object('candidate_id', candidate_id, 'calibration_version', calibration_version, 'candidate_core_hash', candidate_core_hash, 'gold_coach', gold_coach, 'blue_coach', blue_coach, 'gold_roster', gold_roster, 'blue_roster', blue_roster) = ${lit(JSON.stringify(want))}::jsonb) from public.saved_clashes where user_id = '${U}';
insert into _qa (step, out) select 'repaired values', jsonb_build_object('candidate_id', candidate_id, 'gold_coach', gold_coach, 'blue_coach', blue_coach, 'gold_names', (select jsonb_agg(e->>'name') from jsonb_array_elements(gold_roster) e)) from public.saved_clashes where user_id = '${U}';
create temporary table _snap on commit drop as select to_jsonb(s) - 'created_at' as row from public.saved_clashes s where user_id = '${U}';
${repairBody(`sc.user_id = '${U}'`)}
insert into _qa (step, out) select 'second run changed nothing', to_jsonb((select row from _snap) = (to_jsonb(s) - 'created_at')) from public.saved_clashes s where user_id = '${U}';
select step, out::text from _qa order by n;
rollback;`;
  mkdirSync("data/validation/foundation", { recursive: true });
  writeFileSync("data/validation/foundation/repair-equivalence.sql", sql);
  writeFileSync("data/validation/foundation/repair-equivalence-expected.json", JSON.stringify(want, null, 2) + "\n");
  console.log(`wrote data/validation/foundation/repair-equivalence.sql (${sql.length} chars) and the expected JSON`);
}
