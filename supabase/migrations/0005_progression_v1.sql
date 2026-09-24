-- ── 0005_progression_v1 — Phase 9D: Progression, XP and Achievements V1
--
-- Career XP, career level and achievement unlocks. Three tables:
--   progression_profiles  one row per account: total XP and the level it earns
--   xp_ledger             every XP award, once — the unique constraint IS the
--                         idempotency rule (refresh, retry, concurrency,
--                         backfill and reconciliation all insert into it)
--   achievement_unlocks   one unlock per achievement per account
--
-- Authority. A browser may read its own rows and nothing else (RLS + grants).
-- Every write happens inside ONE database function, progression_apply(),
-- callable by the service role alone: it inserts awards ON CONFLICT DO NOTHING,
-- recomputes the total FROM the ledger, derives the level from the versioned
-- curve mirrored below, and refuses to run for anyone but a real user. Two
-- guards make forgery impossible even for a mistaken server: the ledger is
-- immutable after insert, and a profile whose total or level disagrees with
-- the ledger is rejected by a trigger.
--
-- PROGRESSION_POWER_EFFECT = 0. Nothing here is read by any game table,
-- function or route that decides a roll, a draft, an era, a coach or a score.

-- ── progression_profiles ─────────────────────────────────────────────────────
create table if not exists public.progression_profiles (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  total_xp             bigint  not null default 0,
  career_level         integer not null default 1,
  progression_version  text    not null,
  level_curve_version  text    not null,
  reconciled_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint progression_profiles_xp_nonneg  check (total_xp >= 0),
  constraint progression_profiles_level_range check (career_level between 1 and 100),
  constraint progression_profiles_version_shape check (progression_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$' and level_curve_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$')
);
comment on table public.progression_profiles is 'Phase 9D. Career XP and level, recomputed from xp_ledger inside progression_apply(). Never written by a browser; never read by game logic.';

-- ── xp_ledger ────────────────────────────────────────────────────────────────
create table if not exists public.xp_ledger (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  source_type          text not null,
  source_id            text not null,
  reason               text not null,
  xp_delta             integer not null,
  progression_version  text not null,
  created_at           timestamptz not null default now(),
  constraint xp_ledger_source_type  check (source_type in ('clash', 'era', 'challenge_attempt', 'achievement')),
  constraint xp_ledger_reason       check (reason in ('completion', 'win', 'first_completion', 'victory', 'creator_response', 'unlock')),
  constraint xp_ledger_source_shape check (source_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  constraint xp_ledger_delta_range  check (xp_delta between 1 and 1000),
  -- ONE award per source per account. Refreshing, retrying, re-saving and a
  -- concurrent second request all collide here and insert nothing.
  constraint xp_ledger_one_award    unique (user_id, source_type, source_id, reason)
);
create index if not exists xp_ledger_user_created_idx on public.xp_ledger (user_id, created_at desc);
comment on table public.xp_ledger is 'Phase 9D. Every XP award, once. Immutable after insert. The unique constraint is the idempotency rule.';

-- ── achievement_unlocks ──────────────────────────────────────────────────────
create table if not exists public.achievement_unlocks (
  user_id              uuid not null references auth.users (id) on delete cascade,
  achievement_id       text not null,
  achievement_version  text not null,
  xp_awarded           integer not null default 0,
  unlocked_at          timestamptz not null default now(),
  constraint achievement_unlocks_pk        primary key (user_id, achievement_id, achievement_version),
  constraint achievement_unlocks_id_shape  check (achievement_id ~ '^[a-z0-9_]{1,40}$'),
  constraint achievement_unlocks_xp_nonneg check (xp_awarded >= 0)
);
create index if not exists achievement_unlocks_user_idx on public.achievement_unlocks (user_id, unlocked_at desc);
comment on table public.achievement_unlocks is 'Phase 9D. One unlock per achievement per account. Progress is derived from authoritative records, never stored.';

-- ── The level curve, mirrored from src/progression/contract.js ───────────────
-- Levels 1–10 reach at 0, 250, 550, 900, 1300, 1750, 2250, 2800, 3400, 4050;
-- the step from level L to L+1 (L ≥ 10) costs 650 + (L − 10) × 75; cap 100.
-- A contract test pins this function and the JavaScript curve to the same
-- answers across the whole range.
create or replace function public.progression_level_for(total bigint) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  thresholds bigint[] := array[0, 250, 550, 900, 1300, 1750, 2250, 2800, 3400, 4050];
  lvl integer := 1;
  cum bigint;
begin
  if total is null or total < 0 then return 1; end if;
  while lvl < 10 and total >= thresholds[lvl + 1] loop lvl := lvl + 1; end loop;
  if lvl < 10 then return lvl; end if;
  cum := thresholds[10];
  while lvl < 100 loop
    cum := cum + 650 + (lvl - 10) * 75;
    exit when total < cum;
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;
revoke execute on function public.progression_level_for(bigint) from public, anon, authenticated;

-- ── Guards ───────────────────────────────────────────────────────────────────
-- The ledger is append-only: an award is never edited. Deletion happens only
-- as a cascade from auth.users (account deletion), which fires no UPDATE.
create or replace function public.xp_ledger_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'XP_LEDGER_IMMUTABLE' using errcode = 'P0001', detail = 'An XP award is never edited. Missing progression is repaired by inserting, never by changing.';
end $$;
revoke execute on function public.xp_ledger_immutable() from public, anon, authenticated;
drop trigger if exists xp_ledger_immutable_trg on public.xp_ledger;
create trigger xp_ledger_immutable_trg before update on public.xp_ledger
  for each row execute function public.xp_ledger_immutable();

-- A profile can only ever say what the ledger says. total_xp must equal the
-- ledger's sum and career_level must be the curve's answer for it, so a
-- direct write of a forged total or level — by anyone — is refused.
create or replace function public.progression_profile_guard() returns trigger
language plpgsql set search_path = public as $$
declare ledger_total bigint;
begin
  select coalesce(sum(xp_delta), 0) into ledger_total from public.xp_ledger where user_id = new.user_id;
  if new.total_xp <> ledger_total then
    raise exception 'PROGRESSION_TOTAL_FORGED' using errcode = 'P0001', detail = 'total_xp must equal the sum of the account''s xp_ledger.';
  end if;
  if new.career_level <> public.progression_level_for(new.total_xp) then
    raise exception 'PROGRESSION_LEVEL_FORGED' using errcode = 'P0001', detail = 'career_level must be the level curve''s answer for total_xp.';
  end if;
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'PROGRESSION_OWNER_IMMUTABLE' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.progression_profile_guard() from public, anon, authenticated;
drop trigger if exists progression_profile_guard_trg on public.progression_profiles;
create trigger progression_profile_guard_trg before insert or update on public.progression_profiles
  for each row execute function public.progression_profile_guard();

-- ── progression_apply: the ONE write path ────────────────────────────────────
-- p_awards:  [{source_type, source_id, reason, xp_delta}]
-- p_unlocks: [{achievement_id, achievement_version, xp_delta}]
-- Inserts every award and unlock that does not already exist, then recomputes
-- the profile from the ledger, all in the caller's transaction. Per-account
-- advisory lock: two simultaneous calls for the same account run one after the
-- other, and the unique constraint decides any race the lock does not.
create or replace function public.progression_apply(
  p_user_id uuid, p_awards jsonb, p_unlocks jsonb, p_version text, p_curve_version text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a record;
  inserted jsonb := '[]'::jsonb;
  unlocked jsonb := '[]'::jsonb;
  n integer;
  total bigint;
  lvl integer;
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'PROGRESSION_USER_REQUIRED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('progression:' || p_user_id::text));

  insert into public.progression_profiles (user_id, total_xp, career_level, progression_version, level_curve_version)
  values (p_user_id, (select coalesce(sum(xp_delta), 0) from public.xp_ledger where user_id = p_user_id),
          public.progression_level_for((select coalesce(sum(xp_delta), 0) from public.xp_ledger where user_id = p_user_id)),
          p_version, p_curve_version)
  on conflict (user_id) do nothing;

  for a in select * from jsonb_to_recordset(coalesce(p_awards, '[]'::jsonb)) as x(source_type text, source_id text, reason text, xp_delta integer) loop
    insert into public.xp_ledger (user_id, source_type, source_id, reason, xp_delta, progression_version)
    values (p_user_id, a.source_type, a.source_id, a.reason, a.xp_delta, p_version)
    on conflict on constraint xp_ledger_one_award do nothing;
    get diagnostics n = row_count;
    if n > 0 then inserted := inserted || jsonb_build_object('sourceType', a.source_type, 'sourceId', a.source_id, 'reason', a.reason, 'xpDelta', a.xp_delta); end if;
  end loop;

  for a in select * from jsonb_to_recordset(coalesce(p_unlocks, '[]'::jsonb)) as x(achievement_id text, achievement_version text, xp_delta integer) loop
    -- one XP award per achievement id, whatever its version: the ledger row is
    -- keyed on the id alone, the unlock row on (id, version)
    insert into public.xp_ledger (user_id, source_type, source_id, reason, xp_delta, progression_version)
    values (p_user_id, 'achievement', a.achievement_id, 'unlock', a.xp_delta, p_version)
    on conflict on constraint xp_ledger_one_award do nothing;
    get diagnostics n = row_count;
    insert into public.achievement_unlocks (user_id, achievement_id, achievement_version, xp_awarded)
    values (p_user_id, a.achievement_id, a.achievement_version, case when n > 0 then a.xp_delta else 0 end)
    on conflict on constraint achievement_unlocks_pk do nothing;
    if n > 0 then
      inserted := inserted || jsonb_build_object('sourceType', 'achievement', 'sourceId', a.achievement_id, 'reason', 'unlock', 'xpDelta', a.xp_delta);
      unlocked := unlocked || jsonb_build_object('achievementId', a.achievement_id, 'achievementVersion', a.achievement_version, 'xpAwarded', a.xp_delta);
    end if;
  end loop;

  select coalesce(sum(xp_delta), 0) into total from public.xp_ledger where user_id = p_user_id;
  lvl := public.progression_level_for(total);
  update public.progression_profiles
     set total_xp = total, career_level = lvl, progression_version = p_version, level_curve_version = p_curve_version, reconciled_at = now()
   where user_id = p_user_id;

  return jsonb_build_object('totalXp', total, 'level', lvl, 'awarded', inserted, 'unlocked', unlocked);
end $$;
-- Service role only. A browser holding a valid session cannot call it.
revoke execute on function public.progression_apply(uuid, jsonb, jsonb, text, text) from public, anon, authenticated;

-- ── RLS and grants ───────────────────────────────────────────────────────────
alter table public.progression_profiles enable row level security;
alter table public.xp_ledger            enable row level security;
alter table public.achievement_unlocks  enable row level security;

revoke all on public.progression_profiles from anon, authenticated;
revoke all on public.xp_ledger            from anon, authenticated;
revoke all on public.achievement_unlocks  from anon, authenticated;
grant select on public.progression_profiles to authenticated;
grant select on public.xp_ledger            to authenticated;
grant select on public.achievement_unlocks  to authenticated;

drop policy if exists progression_profiles_select_own on public.progression_profiles;
create policy progression_profiles_select_own on public.progression_profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists xp_ledger_select_own on public.xp_ledger;
create policy xp_ledger_select_own on public.xp_ledger
  for select to authenticated using (user_id = auth.uid());
drop policy if exists achievement_unlocks_select_own on public.achievement_unlocks;
create policy achievement_unlocks_select_own on public.achievement_unlocks
  for select to authenticated using (user_id = auth.uid());
-- No insert, update or delete policy for any client role, on purpose.

-- ── Deletion ─────────────────────────────────────────────────────────────────
-- Every progression table cascades from auth.users: a deleted account leaves
-- no XP, no level and no unlock behind. (Challenge history anonymisation is
-- 0004's and unchanged.)

insert into public.schema_migrations (version) values ('0005_progression_v1') on conflict do nothing;
