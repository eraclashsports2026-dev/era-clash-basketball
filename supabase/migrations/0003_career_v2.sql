-- ═══════════════════════════════════════════════════════════════════════════
-- EraClash Basketball · Phase 9B.2 · My EraClash Career V2
--
-- Two new user-owned tables (saved_rosters, user_preferences), favorites on
-- saved Clashes and rosters, and two derived views (longest win streak, recent
-- account activity).
--
-- The rule from 0001 still holds: a browser never writes AUTHORITATIVE game
-- data. What it may write here is its own preferences — a roster it wants to
-- keep, a name for it, a flag, a setting. None of that influences a
-- simulation: a roster snapshot holds player IDENTITY (id, name, position) and
-- nothing else, so a client-supplied rating can never become truth, and the
-- game reconstructs every player from the canonical registry at play time.
--
-- Every table has RLS enabled, every policy is `user_id = auth.uid()`,
-- anon gets nothing, and 0002's default-privilege revoke means every grant
-- below is explicit and narrow.
--
-- Applied with:  supabase db push      (or the SQL editor, in order)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Shape guards, as IMMUTABLE functions so they can back check constraints ──
-- A roster snapshot: an array of one to five objects, each carrying an id and
-- optionally a name and a position, and NOTHING else. The key allowlist is the
-- point: a snapshot with a `rating`, `ovr` or any other field is rejected at
-- the table, so no stored roster can smuggle a capability into a game.
create or replace function public.roster_snapshot_ok(s jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(s) = 'array'
     and jsonb_array_length(s) between 1 and 5
     and not exists (
       select 1 from jsonb_array_elements(s) e
       where jsonb_typeof(e) <> 'object'
          or not (e ? 'id')
          or jsonb_typeof(e -> 'id') <> 'string'
          or char_length(e ->> 'id') not between 1 and 40
          or exists (select 1 from jsonb_object_keys(e) k where k not in ('id', 'name', 'pos'))
          or (e ? 'name' and jsonb_typeof(e -> 'name') not in ('string', 'null'))
          or (e ? 'name' and jsonb_typeof(e -> 'name') = 'string' and char_length(e ->> 'name') > 40)
          or (e ? 'pos'  and jsonb_typeof(e -> 'pos')  not in ('string', 'null'))
          or (e ? 'pos'  and jsonb_typeof(e -> 'pos')  = 'string' and char_length(e ->> 'pos') > 4)
     );
$$;

create or replace function public.coach_snapshot_ok(s jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(s) = 'object'
     and not exists (select 1 from jsonb_object_keys(s) k where k not in ('id', 'name'))
     and (not (s ? 'id')   or jsonb_typeof(s -> 'id')   in ('string', 'null'))
     and (not (s ? 'name') or jsonb_typeof(s -> 'name') in ('string', 'null'))
     and char_length(coalesce(s ->> 'id', ''))   <= 40
     and char_length(coalesce(s ->> 'name', '')) <= 40;
$$;

-- Preferences are a CLOSED vocabulary. A key not named here is refused, so a
-- preference for a feature that does not exist cannot be stored, and nothing
-- resembling a fingerprint, a token or free text can ride along.
create or replace function public.prefs_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_object_keys(p) k
       where k not in ('reduced_motion', 'default_result_tab', 'career_density', 'lobby_landing')
     )
     and (not (p ? 'reduced_motion')     or p ->> 'reduced_motion'     in ('system', 'reduce', 'allow'))
     and (not (p ? 'career_density')     or p ->> 'career_density'     in ('compact', 'expanded'))
     and (not (p ? 'lobby_landing')      or p ->> 'lobby_landing'      in ('lobby', 'last_mode'))
     and (not (p ? 'default_result_tab') or (jsonb_typeof(p -> 'default_result_tab') = 'string'
                                             and (p ->> 'default_result_tab') ~ '^[a-z_]{1,24}$'));
$$;

-- ── saved_rosters ──────────────────────────────────────────────────────────
-- A five a player wants to keep. Identity references only; the snapshot is
-- immutable once written (delete and save again to change it), the name, era
-- preference and favorite flag are the player's to edit.
create table if not exists public.saved_rosters (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  display_name      text not null,
  source_mode       text,
  source_result_id  text,
  roster_snapshot   jsonb not null,
  coach_snapshot    jsonb,
  era_preference    text,
  snapshot_version  integer not null default 1,
  favorite          boolean not null default false,
  favorited_at      timestamptz,
  renamed_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint saved_rosters_name_len          check (char_length(display_name) between 1 and 40),
  constraint saved_rosters_name_clean        check (display_name !~ '[<>]' and display_name = btrim(display_name)),
  constraint saved_rosters_source_mode_shape check (source_mode is null or source_mode ~ '^[a-z0-9_]{1,20}$'),
  constraint saved_rosters_source_result     check (source_result_id is null or source_result_id ~ '^(pv_)?[a-z0-9]{6,16}$'),
  constraint saved_rosters_era_shape         check (era_preference is null or era_preference ~ '^[A-Za-z0-9_-]{1,24}$'),
  constraint saved_rosters_snapshot_shape    check (public.roster_snapshot_ok(roster_snapshot)),
  constraint saved_rosters_coach_shape       check (coach_snapshot is null or public.coach_snapshot_ok(coach_snapshot)),
  constraint saved_rosters_snapshot_version  check (snapshot_version >= 1)
);

create index if not exists saved_rosters_user_updated_idx  on public.saved_rosters (user_id, updated_at desc);
create index if not exists saved_rosters_user_favorite_idx on public.saved_rosters (user_id) where favorite;

comment on table public.saved_rosters is 'User-owned roster bookmarks. Identity references only (id, name, pos); never ratings. Written by the owner under RLS.';

-- The free-account limit. Mirrored by SAVED_ROSTER_LIMIT_FREE in
-- src/accounts/careerV2.js; a contract test pins the two to the same number.
-- Under RLS the count sees only the caller''s own rows, which is the count that
-- matters. Kept out of src/entitlements.js so that frozen policy file is
-- untouched: a roster count is an account limit, not a gameplay entitlement.
create or replace function public.enforce_saved_roster_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.saved_rosters where user_id = new.user_id) >= 10 then
    raise exception 'ROSTER_LIMIT_REACHED'
      using errcode = 'P0001', detail = 'A free account keeps up to 10 saved rosters. Delete one before saving another.';
  end if;
  return new;
end $$;

-- What may change after a roster is saved, and what may not.
create or replace function public.saved_rosters_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'ROSTER_OWNER_IMMUTABLE' using errcode = 'P0001';
  end if;
  if new.roster_snapshot <> old.roster_snapshot or new.snapshot_version <> old.snapshot_version then
    raise exception 'ROSTER_SNAPSHOT_IMMUTABLE' using errcode = 'P0001',
      detail = 'A saved roster''s five cannot be edited in place. Save a new roster instead.';
  end if;
  if new.display_name <> old.display_name then new.renamed_at := now(); end if;
  if new.favorite and not old.favorite then new.favorited_at := now(); end if;
  if not new.favorite then new.favorited_at := null; end if;
  return new;
end $$;

drop trigger if exists saved_rosters_limit on public.saved_rosters;
create trigger saved_rosters_limit before insert on public.saved_rosters
  for each row execute function public.enforce_saved_roster_limit();
drop trigger if exists saved_rosters_guard_trg on public.saved_rosters;
create trigger saved_rosters_guard_trg before update on public.saved_rosters
  for each row execute function public.saved_rosters_guard();
drop trigger if exists saved_rosters_touch_updated_at on public.saved_rosters;
create trigger saved_rosters_touch_updated_at before update on public.saved_rosters
  for each row execute function public.touch_updated_at();

-- ── user_preferences ───────────────────────────────────────────────────────
create table if not exists public.user_preferences (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  prefs       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint user_preferences_shape check (public.prefs_ok(prefs))
);
comment on table public.user_preferences is 'Closed-vocabulary UI preferences, owner-written under RLS. Cloud truth wins over a local cache after sign-in.';

drop trigger if exists user_preferences_touch_updated_at on public.user_preferences;
create trigger user_preferences_touch_updated_at before update on public.user_preferences
  for each row execute function public.touch_updated_at();

-- ── favorites on saved Clashes ─────────────────────────────────────────────
-- The one column a browser may change on a saved Clash. The grant is
-- column-scoped (the same pattern profiles.display_name uses), so the update
-- policy below can only ever touch `favorite`; the timestamp is set here, not
-- by the client, so it cannot be backdated.
alter table public.saved_clashes
  add column if not exists favorite     boolean not null default false,
  add column if not exists favorited_at timestamptz;

create index if not exists saved_clashes_user_favorite_idx on public.saved_clashes (user_id) where favorite;
create index if not exists saved_clashes_user_outcome_idx  on public.saved_clashes (user_id, outcome, played_at desc);
create index if not exists saved_clashes_user_era_idx      on public.saved_clashes (user_id, era_id, played_at desc);

create or replace function public.saved_clashes_favorite_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.favorite and not old.favorite then new.favorited_at := now(); end if;
  if not new.favorite then new.favorited_at := null; end if;
  return new;
end $$;
drop trigger if exists saved_clashes_favorite_trg on public.saved_clashes;
create trigger saved_clashes_favorite_trg before update on public.saved_clashes
  for each row execute function public.saved_clashes_favorite_guard();

-- ── derived views ──────────────────────────────────────────────────────────
-- Longest win streak: gaps-and-islands over the outcome sequence. A user with
-- no win has no row; the client reads that as 0 rather than inventing one.
create or replace view public.career_longest_win_streak
with (security_invoker = true) as
with ordered as (
  select user_id, outcome, played_at,
         row_number() over (partition by user_id order by played_at, created_at)          as rn,
         row_number() over (partition by user_id, outcome order by played_at, created_at) as rn_o
  from public.saved_clashes
),
islands as (
  select user_id, outcome, count(*)::int as len
  from ordered
  group by user_id, outcome, rn - rn_o
)
select user_id, max(len)::int as longest_win_streak
from islands
where outcome = 'win'
group by user_id;

-- Recent account activity, derived from what already exists — no event table,
-- so nothing here can drift from the data it describes. Deliberately EXCLUDES
-- sign-ins, sign-outs and anything security-related: those are not dashboard
-- material.
create or replace view public.account_activity
with (security_invoker = true) as
  select user_id, 'clash_saved'::text as kind, created_at as occurred_at, result_id as ref, mode as label
    from public.saved_clashes
  union all
  select user_id, 'clash_favorited', favorited_at, result_id, mode
    from public.saved_clashes where favorite and favorited_at is not null
  union all
  select user_id, 'roster_saved', created_at, id::text, display_name
    from public.saved_rosters
  union all
  select user_id, 'roster_renamed', renamed_at, id::text, display_name
    from public.saved_rosters where renamed_at is not null
  union all
  select user_id, 'roster_favorited', favorited_at, id::text, display_name
    from public.saved_rosters where favorite and favorited_at is not null
  union all
  select user_id, 'display_name_changed', updated_at, null, display_name
    from public.profiles where updated_at > created_at + interval '2 seconds';

-- ── row level security ─────────────────────────────────────────────────────
alter table public.saved_rosters    enable row level security;
alter table public.user_preferences enable row level security;

drop policy if exists saved_rosters_select_own on public.saved_rosters;
create policy saved_rosters_select_own on public.saved_rosters
  for select to authenticated using (user_id = auth.uid());
drop policy if exists saved_rosters_insert_own on public.saved_rosters;
create policy saved_rosters_insert_own on public.saved_rosters
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists saved_rosters_update_own on public.saved_rosters;
create policy saved_rosters_update_own on public.saved_rosters
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists saved_rosters_delete_own on public.saved_rosters;
create policy saved_rosters_delete_own on public.saved_rosters
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
  for select to authenticated using (user_id = auth.uid());
drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A saved Clash stays server-written; the owner may flip ONE column on it.
drop policy if exists saved_clashes_update_own_favorite on public.saved_clashes;
create policy saved_clashes_update_own_favorite on public.saved_clashes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── grants: explicit and narrow (0002 revoked the defaults) ────────────────
revoke all on public.saved_rosters    from anon, authenticated;
revoke all on public.user_preferences from anon, authenticated;
revoke all on public.career_longest_win_streak, public.account_activity from anon, authenticated;

grant select, insert, update, delete on public.saved_rosters    to authenticated;
grant select, insert, update         on public.user_preferences to authenticated;
grant update (favorite)              on public.saved_clashes    to authenticated;
grant select on public.career_longest_win_streak, public.account_activity to authenticated;

-- Check-constraint functions run with the caller's privileges, so the writer
-- must be able to execute them. Trigger functions are fired by the system and
-- need no grant, so they stay locked like touch_updated_at.
revoke execute on function public.roster_snapshot_ok(jsonb)  from public, anon;
revoke execute on function public.coach_snapshot_ok(jsonb)   from public, anon;
revoke execute on function public.prefs_ok(jsonb)            from public, anon;
grant  execute on function public.roster_snapshot_ok(jsonb), public.coach_snapshot_ok(jsonb), public.prefs_ok(jsonb) to authenticated;
revoke execute on function public.enforce_saved_roster_limit()   from public, anon, authenticated;
revoke execute on function public.saved_rosters_guard()          from public, anon, authenticated;
revoke execute on function public.saved_clashes_favorite_guard() from public, anon, authenticated;

insert into public.schema_migrations (version) values ('0003_career_v2') on conflict do nothing;
