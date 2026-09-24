begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa-repair@example.invalid','x',now(),now(),now(),'{}','{}');
insert into public.saved_clashes (user_id, result_id, mode, user_side, outcome, gold_score, blue_score, era_id, gold_roster, blue_roster, gold_coach, blue_coach, candidate_id, calibration_version, candidate_core_hash, result_snapshot, claimed_from, played_at)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'pv_bmz3049rci', 'chaos', 'gold', 'win', 143, 145, '1960s', '[{"id":"beal-20s","name":null,"pos":null},{"id":"mullin-90s","name":null,"pos":null},{"id":"bowen-2ks","name":null,"pos":null},{"id":"nance-90s","name":null,"pos":null},{"id":"bob-mc-70s","name":null,"pos":null}]'::jsonb, '[{"id":"conley-10s","name":null,"pos":null},{"id":"durant-10s","name":null,"pos":null},{"id":"bird-80s","name":null,"pos":null},{"id":"dave-c-70s","name":null,"pos":null},{"id":"gobert-10s","name":null,"pos":null}]'::jsonb, null, null, null, null, null, '{"id":"pv_bmz3049rci","preview":true,"candidate":{"candidateId":"Candidate 4","coreHash":"55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff","possessionCalibrationVersion":"1.4.0","actionLibraryVersion":"2.1.0","possessionEngineVersion":"1.2.0","fallbackEngine":"production engineVersion 3.2.0"},"coachIds":{"gold":"doc-rivers","blue":"gregg-popovich"},"goldIds":["beal-20s","mullin-90s","bowen-2ks","nance-90s","bob-mc-70s"],"blueIds":["conley-10s","durant-10s","bird-80s","dave-c-70s","gobert-10s"],"v3":{"fullBox":{"gold":[{"id":"beal-20s","name":"Bradley Beal","pos":"PG"},{"id":"mullin-90s","name":"Chris Mullin","pos":"SG"},{"id":"bowen-2ks","name":"Bruce Bowen","pos":"SF"},{"id":"nance-90s","name":"Larry Nance","pos":"PF"},{"id":"bob-mc-70s","name":"Bob McAdoo","pos":"C"}],"blue":[{"id":"conley-10s","name":"Mike Conley","pos":"PG"},{"id":"durant-10s","name":"Kevin Durant","pos":"SG"},{"id":"bird-80s","name":"Larry Bird","pos":"SF"},{"id":"dave-c-70s","name":"Dave Cowens","pos":"PF"},{"id":"gobert-10s","name":"Rudy Gobert","pos":"C"}]}}}'::jsonb, 'signed_in', now());
create temporary table _qa (n serial, step text, out jsonb) on commit drop;

create temporary table if not exists _coach_catalog (id text primary key, name text not null) on commit drop;
insert into _coach_catalog (id, name) values
  ('billy-cunningham', 'Billy Cunningham'),
  ('red-auerbach', 'Red Auerbach'),
  ('john-kundla', 'John Kundla'),
  ('red-holzman', 'Red Holzman'),
  ('tom-heinsohn', 'Tom Heinsohn'),
  ('bill-sharman', 'Bill Sharman'),
  ('pat-riley', 'Pat Riley'),
  ('lenny-wilkens', 'Lenny Wilkens'),
  ('jack-ramsay', 'Jack Ramsay'),
  ('kc-jones', 'K.C. Jones'),
  ('chuck-daly', 'Chuck Daly'),
  ('don-nelson', 'Don Nelson'),
  ('jerry-sloan', 'Jerry Sloan'),
  ('phil-jackson', 'Phil Jackson'),
  ('larry-brown', 'Larry Brown'),
  ('rudy-tomjanovich', 'Rudy Tomjanovich'),
  ('gregg-popovich', 'Gregg Popovich'),
  ('rick-adelman', 'Rick Adelman'),
  ('george-karl', 'George Karl'),
  ('rick-carlisle', 'Rick Carlisle'),
  ('mike-dantoni', 'Mike D''Antoni'),
  ('doc-rivers', 'Doc Rivers'),
  ('steve-kerr', 'Steve Kerr'),
  ('erik-spoelstra', 'Erik Spoelstra'),
  ('nick-nurse', 'Nick Nurse'),
  ('doug-moe', 'Doug Moe'),
  ('mike-fratello', 'Mike Fratello'),
  ('hubie-brown', 'Hubie Brown'),
  ('tom-thibodeau', 'Tom Thibodeau'),
  ('stan-van-gundy', 'Stan Van Gundy')
on conflict (id) do nothing;

-- candidate identity (preview-engine snapshots only; never overwrite)
update public.saved_clashes sc set
  candidate_id        = left(sc.result_snapshot->'candidate'->>'candidateId', 40),
  calibration_version = left(sc.result_snapshot->'candidate'->>'possessionCalibrationVersion', 20),
  candidate_core_hash = left(sc.result_snapshot->'candidate'->>'coreHash', 64)
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and sc.candidate_id is null and sc.calibration_version is null and sc.candidate_core_hash is null
  and sc.result_snapshot->>'preview' = 'true' and sc.result_snapshot->'candidate'->>'candidateId' is not null;

-- coaches: the catalog coach for the recorded id; neutral / absent stays null (no coach chosen)
update public.saved_clashes sc set gold_coach = jsonb_build_object('id', left(k.id, 40), 'name', left(cat.name, 40))
from (select s.id as row_id, s.result_snapshot->'coachIds'->>'gold' as id from public.saved_clashes s) k
join _coach_catalog cat on cat.id = k.id
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and k.row_id = sc.id and sc.gold_coach is null;
update public.saved_clashes sc set blue_coach = jsonb_build_object('id', left(k.id, 40), 'name', left(cat.name, 40))
from (select s.id as row_id, s.result_snapshot->'coachIds'->>'blue' as id from public.saved_clashes s) k
join _coach_catalog cat on cat.id = k.id
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and k.row_id = sc.id and sc.blue_coach is null;

-- rosters: every entry keeps its id and order; a null name/pos is filled from the snapshot's own box line for that id.
-- Only rows whose every roster id has a box line are touched (anything else is left for a catalog-aware pass).
update public.saved_clashes sc set gold_roster = (
  select jsonb_agg(jsonb_build_object('id', e->>'id',
           'name', coalesce(e->>'name', left(b->>'name', 40)), 'pos', coalesce(e->>'pos', left(b->>'pos', 4))) order by ord)
  from jsonb_array_elements(sc.gold_roster) with ordinality as r(e, ord)
  left join lateral (select l from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'gold') l where l->>'id' = e->>'id' limit 1) bx(b) on true)
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and exists (select 1 from jsonb_array_elements(sc.gold_roster) e where e->>'name' is null or e->>'pos' is null)
  and not exists (select 1 from jsonb_array_elements(sc.gold_roster) e where not exists (
        select 1 from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'gold') l where l->>'id' = e->>'id'));
update public.saved_clashes sc set blue_roster = (
  select jsonb_agg(jsonb_build_object('id', e->>'id',
           'name', coalesce(e->>'name', left(b->>'name', 40)), 'pos', coalesce(e->>'pos', left(b->>'pos', 4))) order by ord)
  from jsonb_array_elements(sc.blue_roster) with ordinality as r(e, ord)
  left join lateral (select l from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'blue') l where l->>'id' = e->>'id' limit 1) bx(b) on true)
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and exists (select 1 from jsonb_array_elements(sc.blue_roster) e where e->>'name' is null or e->>'pos' is null)
  and not exists (select 1 from jsonb_array_elements(sc.blue_roster) e where not exists (
        select 1 from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'blue') l where l->>'id' = e->>'id'));

insert into _qa (step, out) select 'first run equals buildSavedClash', to_jsonb(jsonb_build_object('candidate_id', candidate_id, 'calibration_version', calibration_version, 'candidate_core_hash', candidate_core_hash, 'gold_coach', gold_coach, 'blue_coach', blue_coach, 'gold_roster', gold_roster, 'blue_roster', blue_roster) = '{"candidate_id":"Candidate 4","calibration_version":"1.4.0","candidate_core_hash":"55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff","gold_coach":{"id":"doc-rivers","name":"Doc Rivers"},"blue_coach":{"id":"gregg-popovich","name":"Gregg Popovich"},"gold_roster":[{"id":"beal-20s","name":"Bradley Beal","pos":"PG"},{"id":"mullin-90s","name":"Chris Mullin","pos":"SG"},{"id":"bowen-2ks","name":"Bruce Bowen","pos":"SF"},{"id":"nance-90s","name":"Larry Nance","pos":"PF"},{"id":"bob-mc-70s","name":"Bob McAdoo","pos":"C"}],"blue_roster":[{"id":"conley-10s","name":"Mike Conley","pos":"PG"},{"id":"durant-10s","name":"Kevin Durant","pos":"SG"},{"id":"bird-80s","name":"Larry Bird","pos":"SF"},{"id":"dave-c-70s","name":"Dave Cowens","pos":"PF"},{"id":"gobert-10s","name":"Rudy Gobert","pos":"C"}]}'::jsonb) from public.saved_clashes where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
insert into _qa (step, out) select 'repaired values', jsonb_build_object('candidate_id', candidate_id, 'gold_coach', gold_coach, 'blue_coach', blue_coach, 'gold_names', (select jsonb_agg(e->>'name') from jsonb_array_elements(gold_roster) e)) from public.saved_clashes where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
create temporary table _snap on commit drop as select to_jsonb(s) - 'created_at' as row from public.saved_clashes s where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

create temporary table if not exists _coach_catalog (id text primary key, name text not null) on commit drop;
insert into _coach_catalog (id, name) values
  ('billy-cunningham', 'Billy Cunningham'),
  ('red-auerbach', 'Red Auerbach'),
  ('john-kundla', 'John Kundla'),
  ('red-holzman', 'Red Holzman'),
  ('tom-heinsohn', 'Tom Heinsohn'),
  ('bill-sharman', 'Bill Sharman'),
  ('pat-riley', 'Pat Riley'),
  ('lenny-wilkens', 'Lenny Wilkens'),
  ('jack-ramsay', 'Jack Ramsay'),
  ('kc-jones', 'K.C. Jones'),
  ('chuck-daly', 'Chuck Daly'),
  ('don-nelson', 'Don Nelson'),
  ('jerry-sloan', 'Jerry Sloan'),
  ('phil-jackson', 'Phil Jackson'),
  ('larry-brown', 'Larry Brown'),
  ('rudy-tomjanovich', 'Rudy Tomjanovich'),
  ('gregg-popovich', 'Gregg Popovich'),
  ('rick-adelman', 'Rick Adelman'),
  ('george-karl', 'George Karl'),
  ('rick-carlisle', 'Rick Carlisle'),
  ('mike-dantoni', 'Mike D''Antoni'),
  ('doc-rivers', 'Doc Rivers'),
  ('steve-kerr', 'Steve Kerr'),
  ('erik-spoelstra', 'Erik Spoelstra'),
  ('nick-nurse', 'Nick Nurse'),
  ('doug-moe', 'Doug Moe'),
  ('mike-fratello', 'Mike Fratello'),
  ('hubie-brown', 'Hubie Brown'),
  ('tom-thibodeau', 'Tom Thibodeau'),
  ('stan-van-gundy', 'Stan Van Gundy')
on conflict (id) do nothing;

-- candidate identity (preview-engine snapshots only; never overwrite)
update public.saved_clashes sc set
  candidate_id        = left(sc.result_snapshot->'candidate'->>'candidateId', 40),
  calibration_version = left(sc.result_snapshot->'candidate'->>'possessionCalibrationVersion', 20),
  candidate_core_hash = left(sc.result_snapshot->'candidate'->>'coreHash', 64)
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and sc.candidate_id is null and sc.calibration_version is null and sc.candidate_core_hash is null
  and sc.result_snapshot->>'preview' = 'true' and sc.result_snapshot->'candidate'->>'candidateId' is not null;

-- coaches: the catalog coach for the recorded id; neutral / absent stays null (no coach chosen)
update public.saved_clashes sc set gold_coach = jsonb_build_object('id', left(k.id, 40), 'name', left(cat.name, 40))
from (select s.id as row_id, s.result_snapshot->'coachIds'->>'gold' as id from public.saved_clashes s) k
join _coach_catalog cat on cat.id = k.id
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and k.row_id = sc.id and sc.gold_coach is null;
update public.saved_clashes sc set blue_coach = jsonb_build_object('id', left(k.id, 40), 'name', left(cat.name, 40))
from (select s.id as row_id, s.result_snapshot->'coachIds'->>'blue' as id from public.saved_clashes s) k
join _coach_catalog cat on cat.id = k.id
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and k.row_id = sc.id and sc.blue_coach is null;

-- rosters: every entry keeps its id and order; a null name/pos is filled from the snapshot's own box line for that id.
-- Only rows whose every roster id has a box line are touched (anything else is left for a catalog-aware pass).
update public.saved_clashes sc set gold_roster = (
  select jsonb_agg(jsonb_build_object('id', e->>'id',
           'name', coalesce(e->>'name', left(b->>'name', 40)), 'pos', coalesce(e->>'pos', left(b->>'pos', 4))) order by ord)
  from jsonb_array_elements(sc.gold_roster) with ordinality as r(e, ord)
  left join lateral (select l from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'gold') l where l->>'id' = e->>'id' limit 1) bx(b) on true)
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and exists (select 1 from jsonb_array_elements(sc.gold_roster) e where e->>'name' is null or e->>'pos' is null)
  and not exists (select 1 from jsonb_array_elements(sc.gold_roster) e where not exists (
        select 1 from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'gold') l where l->>'id' = e->>'id'));
update public.saved_clashes sc set blue_roster = (
  select jsonb_agg(jsonb_build_object('id', e->>'id',
           'name', coalesce(e->>'name', left(b->>'name', 40)), 'pos', coalesce(e->>'pos', left(b->>'pos', 4))) order by ord)
  from jsonb_array_elements(sc.blue_roster) with ordinality as r(e, ord)
  left join lateral (select l from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'blue') l where l->>'id' = e->>'id' limit 1) bx(b) on true)
where (sc.user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') and exists (select 1 from jsonb_array_elements(sc.blue_roster) e where e->>'name' is null or e->>'pos' is null)
  and not exists (select 1 from jsonb_array_elements(sc.blue_roster) e where not exists (
        select 1 from jsonb_array_elements(sc.result_snapshot->'v3'->'fullBox'->'blue') l where l->>'id' = e->>'id'));

insert into _qa (step, out) select 'second run changed nothing', to_jsonb((select row from _snap) = (to_jsonb(s) - 'created_at')) from public.saved_clashes s where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
select step, out::text from _qa order by n;
rollback;