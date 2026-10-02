-- Basketball Loop Foundation release bundle, 10-02-2026
-- SOURCE ONLY: not executed or validated on Preview/production in this session.
-- The owner must verify the production project name/ref in Dashboard first.
-- Current observed row counts: UNKNOWN. No fabricated before/after totals.
-- Ordered inherited prerequisites0001–0008; Loop storage uses existing KV, no new SQL tables.


-- BEGIN 0001_accounts.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- EraClash Basketball · Phase 9B.1 · real accounts and cloud career
--
-- Two user-owned tables and derived career views. Every table has RLS enabled
-- and no policy grants a client the ability to write authoritative game data:
-- a saved clash is inserted ONLY by the server (service role) after it has read
-- the authoritative result record and proved ownership. A signed-in browser can
-- read its own rows and edit its own display name. Nothing else.
--
-- Applied with:  supabase db push      (or the SQL editor, in order)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Schema version, so a preflight can report what is applied ───────────────
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ── profiles ───────────────────────────────────────────────────────────────
-- One row per authenticated user. The email is NEVER copied here: it stays in
-- auth.users, readable only by the user's own session through the auth API.
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Coach',
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 24),
  constraint profiles_display_name_clean check (display_name !~ '[<>]'),
  constraint profiles_avatar_url_shape check (avatar_url is null or avatar_url ~ '^https://')
);

comment on table public.profiles is 'Private per-user profile. Phase 9B.1: not public, no email column.';

-- ── saved_clashes ──────────────────────────────────────────────────────────
-- One immutable cloud-career record per (user, authoritative result). The
-- snapshot carries enough to re-render the saved report after the temporary
-- result cache expires. No raw preview key, no challenge seed — only a
-- non-reversible challenge fingerprint.
create table if not exists public.saved_clashes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  result_id            text not null,
  mode                 text not null,
  user_side            text not null default 'gold',
  outcome              text not null,
  gold_score           integer,
  blue_score           integer,
  era_id               text,
  gold_roster          jsonb not null default '[]'::jsonb,
  blue_roster          jsonb not null default '[]'::jsonb,
  gold_coach           jsonb,
  blue_coach           jsonb,
  mvp                  jsonb,
  candidate_id         text,
  calibration_version  text,
  candidate_core_hash  text,
  theme_version        text,
  build_stamp          text,
  challenge_fingerprint text,
  claimed_from         text not null default 'signed_in',
  result_snapshot      jsonb not null,
  played_at            timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  constraint saved_clashes_unique_result unique (user_id, result_id),
  constraint saved_clashes_outcome check (outcome in ('win', 'loss', 'tie')),
  constraint saved_clashes_user_side check (user_side in ('gold', 'blue')),
  constraint saved_clashes_result_id_shape check (result_id ~ '^(pv_)?[a-z0-9]{6,16}$'),
  constraint saved_clashes_claimed_from check (claimed_from in ('signed_in', 'guest_claim', 'device_import'))
);

create index if not exists saved_clashes_user_played_at_idx on public.saved_clashes (user_id, played_at desc);
create index if not exists saved_clashes_user_mode_idx on public.saved_clashes (user_id, mode);

comment on table public.saved_clashes is 'Immutable cloud-career snapshots. Inserted only by the authoritative server save/claim path (service role); never by a browser.';

-- ── result claim ledger ────────────────────────────────────────────────────
-- Durable ownership record: one authoritative result may be claimed by exactly
-- one account. Holds no credential — only the result id, the owning user and a
-- hash of the guest device session that produced it.
create table if not exists public.result_claims (
  result_id          text primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  device_session_hash text not null,
  claimed_via        text not null default 'guest_claim',
  claimed_at         timestamptz not null default now(),
  constraint result_claims_result_id_shape check (result_id ~ '^(pv_)?[a-z0-9]{6,16}$'),
  constraint result_claims_hash_shape check (device_session_hash ~ '^[a-f0-9]{64}$')
);

comment on table public.result_claims is 'One result, one owner. device_session_hash is sha256 of the server-minted guest session id — never the session itself.';

-- ── updated_at ─────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── profile bootstrap ──────────────────────────────────────────────────────
-- Exactly one profile per user, created on sign-up. The display name is seeded
-- from the OAuth full name when present, sanitised and truncated; the email is
-- never used as a display identity.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  raw_name text;
  seeded   text;
begin
  raw_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '');
  seeded := nullif(btrim(regexp_replace(raw_name, '[<>]', '', 'g')), '');
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(seeded, 'Coach'), 24),
    case when (new.raw_user_meta_data ->> 'avatar_url') ~ '^https://' then new.raw_user_meta_data ->> 'avatar_url' else null end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── career views ───────────────────────────────────────────────────────────
-- Derived from saved_clashes, never mutable counters that can drift.
-- security_invoker makes the view run as the querying user, so RLS on the
-- underlying table is what isolates one career from another.
create or replace view public.career_summary
with (security_invoker = true) as
select
  user_id,
  count(*)::int                                             as games_played,
  count(*) filter (where outcome = 'win')::int               as wins,
  count(*) filter (where outcome = 'loss')::int              as losses,
  count(*) filter (where outcome = 'tie')::int               as ties,
  case when count(*) = 0 then null
       else round((count(*) filter (where outcome = 'win'))::numeric / count(*), 4) end as win_rate,
  max(played_at)                                             as last_played_at
from public.saved_clashes
group by user_id;

create or replace view public.career_by_mode
with (security_invoker = true) as
select
  user_id, mode,
  count(*)::int                                  as games_played,
  count(*) filter (where outcome = 'win')::int    as wins,
  count(*) filter (where outcome = 'loss')::int   as losses,
  max(played_at)                                 as last_played_at
from public.saved_clashes
group by user_id, mode;

-- Current streak: the length of the leading run of identical outcomes.
create or replace view public.career_streak
with (security_invoker = true) as
with ordered as (
  select user_id, outcome, played_at,
         row_number() over (partition by user_id order by played_at desc) as rn
  from public.saved_clashes
),
latest as (select user_id, outcome from ordered where rn = 1),
broken as (
  select o.user_id, min(o.rn) as first_break
  from ordered o join latest l on l.user_id = o.user_id
  where o.outcome <> l.outcome
  group by o.user_id
)
select l.user_id, l.outcome as streak_outcome,
       coalesce(b.first_break - 1, (select count(*) from ordered o2 where o2.user_id = l.user_id))::int as streak_length
from latest l left join broken b on b.user_id = l.user_id;

-- ── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.saved_clashes  enable row level security;
alter table public.result_claims  enable row level security;
alter table public.schema_migrations enable row level security;

-- profiles: a signed-in user reads and updates ONLY their own row. No insert
-- policy — the sign-up trigger owns creation. No delete policy — account
-- deletion cascades from auth.users.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- saved_clashes: read-only for the owner. No insert, update or delete policy
-- for any client role, so a browser cannot forge, alter or remove a career
-- record even with a valid session; the server's service role bypasses RLS for
-- the authoritative save path only.
drop policy if exists saved_clashes_select_own on public.saved_clashes;
create policy saved_clashes_select_own on public.saved_clashes
  for select to authenticated using (user_id = auth.uid());

-- result_claims: the owner may see their own claims; nobody may write.
drop policy if exists result_claims_select_own on public.result_claims;
create policy result_claims_select_own on public.result_claims
  for select to authenticated using (user_id = auth.uid());

-- schema_migrations: readable by nobody through the API (service role only).

-- Anonymous holds no privilege on any user-owned object.
revoke all on public.profiles      from anon;
revoke all on public.saved_clashes from anon;
revoke all on public.result_claims from anon;
revoke all on public.schema_migrations from anon, authenticated;
grant select on public.career_summary, public.career_by_mode, public.career_streak to authenticated;
revoke all on public.career_summary, public.career_by_mode, public.career_streak from anon;

insert into public.schema_migrations (version) values ('0001_accounts')
  on conflict (version) do nothing;

-- END 0001_accounts.sql

-- BEGIN 0002_accounts_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- EraClash Basketball · Phase 9B.1 · account hardening
--
-- 0001 revoked everything from `anon`, which worked. What it did NOT do is
-- narrow `authenticated`, and Supabase's default privileges grant every new
-- table in `public` to both roles. So a signed-in browser held INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES and TRIGGER on the career tables.
--
-- Row level security still blocked the writes that matter — there is no
-- INSERT, UPDATE or DELETE policy on the career tables, so PostgREST writes
-- fail — but two things were wrong anyway:
--
--   · TRUNCATE is NOT subject to row level security. It is not reachable
--     through PostgREST today, so nothing was exposed, but the privilege
--     should never have existed.
--   · 0001's own comment claimed no client role could write career data.
--     The policies delivered that; the grants did not. A contract the
--     database does not actually hold is worse than no contract.
--
-- This migration makes the grants say what the policies already enforce, and
-- clears the two advisor warnings Supabase raised against 0001.
--
-- Applied with:  supabase db push      (or the SQL editor, after 0001)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Narrow `authenticated` to exactly what the product reads ─────────────
revoke all on public.profiles      from authenticated;
revoke all on public.saved_clashes from authenticated;
revoke all on public.result_claims from authenticated;
revoke all on public.career_summary, public.career_by_mode, public.career_streak from authenticated;

-- A signed-in user reads their own rows (row level security decides WHICH
-- rows) and may change only the two columns that are theirs to change. The
-- column list matters: without it an UPDATE could rewrite user_id or
-- created_at on its own row. The updated_at trigger still fires — column
-- privileges are checked against the columns the statement names, not against
-- what a trigger sets.
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.saved_clashes to authenticated;
grant select on public.result_claims to authenticated;
grant select on public.career_summary, public.career_by_mode, public.career_streak to authenticated;

-- And make the default for anything added later restrictive rather than open.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ── 2. The trigger functions are not an API ─────────────────────────────────
-- Both live in the exposed `public` schema, so PostgREST published them at
-- /rest/v1/rpc/<name>. handle_new_user() is SECURITY DEFINER, which is what
-- makes that worth closing: calling a trigger function outside a trigger
-- errors, but a SECURITY DEFINER function should not be callable by a browser
-- at all. Revoking EXECUTE does not affect the triggers themselves — that
-- privilege is checked when a trigger is created, not each time it fires.
revoke execute on function public.handle_new_user()  from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- ── 3. A fixed search_path on both functions ────────────────────────────────
-- 0001 set this on handle_new_user() and missed touch_updated_at(). A mutable
-- search_path lets a caller's own path decide which objects a function
-- resolves to.
alter function public.touch_updated_at() set search_path = public;

-- ── 4. schema_migrations stays readable by nobody through the API ───────────
-- Row level security is on with no policy, deliberately: only the service role
-- reads it. Supabase's linter reports that as INFO ("RLS enabled, no policy"),
-- which is the intended state and not a finding.
revoke all on public.schema_migrations from anon, authenticated;

insert into public.schema_migrations (version) values ('0002_accounts_hardening')
  on conflict (version) do nothing;

-- END 0002_accounts_hardening.sql

-- BEGIN 0003_career_v2.sql
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

-- END 0003_career_v2.sql

-- BEGIN 0004_challenges.sql
-- ── 0004_challenges — Phase 9C: Challenges + Persistent Competitive Identity V1
--
-- A completed Chaos Clash becomes a governed challenge another player can
-- accept, play under the same starting opportunity, and compare against.
-- Three tables:
--   challenges          the frozen contract and the creator's original result
--   challenge_attempts  one official attempt per account (a unique index), a
--                       guest's attempt per device (server-enforced)
--   challenge_secrets   the seed behind the same-seed manifest — service role
--                       only; no client role can read a byte of it
--
-- Every write goes through the server's service role after it has verified who
-- is asking and read the result it is binding. Browsers may read only their own
-- rows (RLS + grants); the product's lists come through the server anyway.
-- Status is derived from timestamps; nothing here needs a job.

create table if not exists public.challenges (
  id                       uuid primary key default gen_random_uuid(),
  public_code              text not null unique,
  creator_user_id          uuid references auth.users (id) on delete set null,
  creator_result_id        text not null,
  creator_saved_clash_id   uuid references public.saved_clashes (id) on delete set null,
  creator_display_snapshot text not null default 'Coach',
  challenge_version        text not null,
  comparison_version       text not null,
  mode                     text not null default 'chaos',
  chaos_manifest_id        text not null,
  chaos_sequence_version   text not null,
  draft_model_version      jsonb not null default '{}'::jsonb,
  player_pool_version      text,
  candidate_id             text,
  calibration_version      text,
  parameter_hash           text,
  era_contract_version     text,
  cpu_policy_version       text,
  challenge_fingerprint    text not null,
  creator_outcome          text not null,
  creator_gold_score       integer not null,
  creator_blue_score       integer not null,
  creator_performance      integer not null,
  creator_era_id           text,
  era_custom               boolean not null default false,
  creator_roster           jsonb not null default '[]'::jsonb,
  creator_coach            jsonb,
  creator_mvp              jsonb,
  status                   text not null default 'open',
  created_at               timestamptz not null default now(),
  expires_at               timestamptz not null,
  revoked_at               timestamptz,
  constraint challenges_code_shape       check (public_code ~ '^EC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  constraint challenges_result_id_shape  check (creator_result_id ~ '^(pv_)?[a-z0-9]{6,16}$'),
  constraint challenges_manifest_shape   check (chaos_manifest_id ~ '^[a-z0-9]{4,14}$'),
  constraint challenges_mode             check (mode in ('chaos')),
  constraint challenges_status           check (status in ('open', 'revoked')),
  constraint challenges_outcome          check (creator_outcome in ('win', 'loss', 'tie')),
  constraint challenges_snapshot_len     check (char_length(creator_display_snapshot) between 1 and 24),
  constraint challenges_snapshot_clean   check (creator_display_snapshot !~ '[<>]'),
  constraint challenges_fingerprint_shape check (challenge_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint challenges_expires_after    check (expires_at > created_at),
  constraint challenges_one_per_result   unique (creator_user_id, creator_result_id)
);
create index if not exists challenges_creator_created_idx on public.challenges (creator_user_id, created_at desc);
comment on table public.challenges is 'Phase 9C. The immutable challenge contract plus the creator''s original result. Written only by the server''s service role. The link carries public_code and nothing else.';
comment on column public.challenges.chaos_manifest_id is 'The one-way hash id of the same-seed manifest (already on the public result); never the seed.';

create table if not exists public.challenge_secrets (
  challenge_id        uuid primary key references public.challenges (id) on delete cascade,
  seed_id             text not null,
  pinned_era_style_id text,
  created_at          timestamptz not null default now()
);
comment on table public.challenge_secrets is 'Phase 9C. The seed behind a challenge. Service role only: RLS on, no policies, no grants.';

create table if not exists public.challenge_attempts (
  id                  uuid primary key default gen_random_uuid(),
  challenge_id        uuid not null references public.challenges (id) on delete cascade,
  user_id             uuid references auth.users (id) on delete set null,
  device_session_hash text not null,
  display_snapshot    text not null default 'Guest',
  chaos_run_id        text not null,
  result_id           text,
  saved_clash_id      uuid references public.saved_clashes (id) on delete set null,
  attempt_number      integer not null default 1,
  status              text not null default 'started',
  outcome             text,
  gold_score          integer,
  blue_score          integer,
  performance_score   integer,
  challenge_outcome   text,
  comparison_version  text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  constraint challenge_attempts_hash_shape    check (device_session_hash ~ '^[a-f0-9]{64}$'),
  constraint challenge_attempts_run_shape     check (chaos_run_id ~ '^[a-z0-9]{8,20}$'),
  constraint challenge_attempts_result_shape  check (result_id is null or result_id ~ '^(pv_)?[a-z0-9]{6,16}$'),
  constraint challenge_attempts_status        check (status in ('started', 'completed', 'abandoned')),
  constraint challenge_attempts_outcome       check (outcome is null or outcome in ('win', 'loss', 'tie')),
  constraint challenge_attempts_challenge_outcome check (challenge_outcome is null or challenge_outcome in ('creator', 'recipient', 'tie')),
  constraint challenge_attempts_snapshot_len  check (char_length(display_snapshot) between 1 and 24),
  constraint challenge_attempts_snapshot_clean check (display_snapshot !~ '[<>]'),
  constraint challenge_attempts_completed_shape check (status <> 'completed' or (result_id is not null and gold_score is not null and blue_score is not null and performance_score is not null and challenge_outcome is not null and completed_at is not null))
);
-- ONE official attempt per account per challenge. The database decides races.
create unique index if not exists challenge_attempts_one_per_account on public.challenge_attempts (challenge_id, user_id) where user_id is not null;
create index if not exists challenge_attempts_challenge_idx on public.challenge_attempts (challenge_id, created_at desc);
create index if not exists challenge_attempts_user_idx      on public.challenge_attempts (user_id, created_at desc);
create index if not exists challenge_attempts_device_idx    on public.challenge_attempts (challenge_id, device_session_hash);
comment on table public.challenge_attempts is 'Phase 9C. One recipient''s governed attempt. The score is read from the server-stored result at completion; the browser never posts one.';

-- ── Deletion: identity leaves, competitive history stays anonymised ─────────
-- A creator or recipient who deletes their account is removed from every
-- challenge row (set null by the foreign keys) and this trigger clears what
-- named them. Completed attempts remain for the other participant as
-- "Deleted account"; no new attempt can start on a creator-less challenge.
create or replace function public.anonymize_deleted_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.challenges
     set creator_display_snapshot = 'Deleted account', creator_roster = '[]'::jsonb, creator_coach = null, creator_mvp = null
   where creator_user_id is null and creator_display_snapshot <> 'Deleted account';
  update public.challenge_attempts
     set display_snapshot = 'Deleted account'
   where user_id is null and display_snapshot not in ('Guest', 'Deleted account');
  return null;
end $$;
revoke execute on function public.anonymize_deleted_account() from public, anon, authenticated;
drop trigger if exists on_auth_user_deleted_challenges on auth.users;
create trigger on_auth_user_deleted_challenges after delete on auth.users
  for each statement execute function public.anonymize_deleted_account();

-- ── RLS and grants ──────────────────────────────────────────────────────────
alter table public.challenges         enable row level security;
alter table public.challenge_attempts enable row level security;
alter table public.challenge_secrets  enable row level security;

revoke all on public.challenges         from anon, authenticated;
revoke all on public.challenge_attempts from anon, authenticated;
revoke all on public.challenge_secrets  from anon, authenticated;
grant select on public.challenges         to authenticated;
grant select on public.challenge_attempts to authenticated;

drop policy if exists challenges_select_own on public.challenges;
create policy challenges_select_own on public.challenges
  for select to authenticated using (creator_user_id = auth.uid());

drop policy if exists challenge_attempts_select_own on public.challenge_attempts;
create policy challenge_attempts_select_own on public.challenge_attempts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists challenge_attempts_select_responses on public.challenge_attempts;
create policy challenge_attempts_select_responses on public.challenge_attempts
  for select to authenticated using (
    exists (select 1 from public.challenges c where c.id = challenge_attempts.challenge_id and c.creator_user_id = auth.uid())
  );
-- challenge_secrets: no policy on purpose. RLS on + no grants = unreadable by any client role.

insert into public.schema_migrations (version) values ('0004_challenges') on conflict do nothing;

-- END 0004_challenges.sql

-- BEGIN 0005_progression_v1.sql
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

-- END 0005_progression_v1.sql

-- BEGIN 0006_competitive_rating_v1.sql
-- ── 0006_competitive_rating_v1 — Phase 9E: Competitive Rating + Leaderboards V1
--
-- A Challenge Rating: an Elo-style number that moves only when two
-- AUTHENTICATED accounts complete an official Challenge and the Phase 9C
-- comparison decided creator, recipient or tie. Two tables and four functions:
--   competitive_profiles       one row per rated account: current rating, W-L-T,
--                              matches, unique opponents, when it was last rated
--   competitive_rating_events  the immutable ledger: one event per rated attempt
--                              (unique on attempt + rating version), with both
--                              ratings before, both expected scores, both deltas,
--                              both ratings after
--   competitive_rate_attempt() the ONE write: checks eligibility (both accounts,
--                              not self, completed, unrated, pair window), locks
--                              both profiles, computes and applies, atomically
--   competitive_reconcile()    rates every pending eligible attempt in frozen
--                              chronological order (completed_at, attempt id)
--   competitive_leaderboard()  the safe public projection: public AND placed
--                              accounts only, deterministic ordering, Top N
--   competitive_rank_of()      one account's rank and neighbours (server-side)
--
-- Every function is SECURITY DEFINER and executable by the service role alone.
-- Browsers read their own profile and their own events under RLS; they can
-- write nothing here. Public visibility is the user_preferences key
-- leaderboard_visibility (private by default), written through the existing
-- preference path — never through this schema.
--
-- The math mirrors src/competitive/contract.js exactly (expected to 4 decimals,
-- deltas round() half away from zero, floor 100, K 40 for a player's first ten
-- rated matches and 24 after); contract tests pin the two together.
-- COMPETITIVE_RATING_POWER_EFFECT = 0: no game table, function or route reads
-- anything here.

-- ── preferences: the closed vocabulary gains one key ────────────────────────
create or replace function public.prefs_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_object_keys(p) k
       where k not in ('reduced_motion', 'default_result_tab', 'career_density', 'lobby_landing', 'leaderboard_visibility')
     )
     and (not (p ? 'reduced_motion')        or p ->> 'reduced_motion'        in ('system', 'reduce', 'allow'))
     and (not (p ? 'career_density')        or p ->> 'career_density'        in ('compact', 'expanded'))
     and (not (p ? 'lobby_landing')         or p ->> 'lobby_landing'         in ('lobby', 'last_mode'))
     and (not (p ? 'leaderboard_visibility') or p ->> 'leaderboard_visibility' in ('private', 'public'))
     and (not (p ? 'default_result_tab')    or (jsonb_typeof(p -> 'default_result_tab') = 'string'
                                                and (p ->> 'default_result_tab') ~ '^[a-z_]{1,24}$'));
$$;

-- ── competitive_profiles ─────────────────────────────────────────────────────
create table if not exists public.competitive_profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  current_rating    integer not null default 1000,
  rated_wins        integer not null default 0,
  rated_losses      integer not null default 0,
  rated_ties        integer not null default 0,
  rated_matches     integer not null default 0,
  unique_opponents  integer not null default 0,
  rating_version    text    not null default '1.0.0',
  last_rated_at     timestamptz,
  placed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint competitive_profiles_floor    check (current_rating >= 100),
  constraint competitive_profiles_counts   check (rated_wins >= 0 and rated_losses >= 0 and rated_ties >= 0 and unique_opponents >= 0),
  constraint competitive_profiles_matches  check (rated_matches = rated_wins + rated_losses + rated_ties),
  constraint competitive_profiles_version  check (rating_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$')
);
comment on table public.competitive_profiles is 'Phase 9E. Current Challenge Rating and rated record. Written only inside competitive_rate_attempt(); public rank is derived, never stored.';

-- ── competitive_rating_events (immutable) ────────────────────────────────────
create table if not exists public.competitive_rating_events (
  id                      uuid primary key default gen_random_uuid(),
  challenge_id            uuid references public.challenges (id) on delete set null,
  challenge_attempt_id    uuid not null,
  creator_user_id         uuid references auth.users (id) on delete set null,
  recipient_user_id       uuid references auth.users (id) on delete set null,
  rating_version          text not null,
  creator_rating_before   integer not null,
  recipient_rating_before integer not null,
  creator_expected        numeric(6,4) not null,
  recipient_expected      numeric(6,4) not null,
  outcome                 text not null,
  creator_delta           integer not null,
  recipient_delta         integer not null,
  creator_rating_after    integer not null,
  recipient_rating_after  integer not null,
  completed_at            timestamptz not null,
  created_at              timestamptz not null default now(),
  constraint competitive_events_outcome check (outcome in ('creator', 'recipient', 'tie')),
  constraint competitive_events_expected check (creator_expected between 0 and 1 and recipient_expected between 0 and 1),
  constraint competitive_events_after   check (creator_rating_after = creator_rating_before + creator_delta and recipient_rating_after = recipient_rating_before + recipient_delta),
  constraint competitive_events_floor   check (creator_rating_after >= 100 and recipient_rating_after >= 100),
  constraint competitive_events_once    unique (challenge_attempt_id, rating_version)
);
create index if not exists competitive_events_creator_idx   on public.competitive_rating_events (creator_user_id, completed_at desc);
create index if not exists competitive_events_recipient_idx on public.competitive_rating_events (recipient_user_id, completed_at desc);
create index if not exists competitive_events_pair_idx      on public.competitive_rating_events (creator_user_id, recipient_user_id, completed_at);
create index if not exists competitive_profiles_board_idx   on public.competitive_profiles (current_rating desc, rated_wins desc, rated_losses asc, last_rated_at asc, user_id asc);
comment on table public.competitive_rating_events is 'Phase 9E. The auditable rating ledger: one event per rated official attempt. Immutable; deleted accounts leave their side null and the event stands.';

-- Immutable: the only permitted change is a foreign key nulling a deleted account.
create or replace function public.competitive_events_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'RATING_EVENT_IMMUTABLE' using errcode = 'P0001', detail = 'A rating event is never deleted; past opponents keep what they earned.';
  end if;
  if new.id <> old.id or new.challenge_attempt_id <> old.challenge_attempt_id or new.rating_version <> old.rating_version
     or new.creator_rating_before <> old.creator_rating_before or new.recipient_rating_before <> old.recipient_rating_before
     or new.creator_expected <> old.creator_expected or new.recipient_expected <> old.recipient_expected or new.outcome <> old.outcome
     or new.creator_delta <> old.creator_delta or new.recipient_delta <> old.recipient_delta
     or new.creator_rating_after <> old.creator_rating_after or new.recipient_rating_after <> old.recipient_rating_after
     or new.completed_at <> old.completed_at
     or (new.creator_user_id is distinct from old.creator_user_id and new.creator_user_id is not null)
     or (new.recipient_user_id is distinct from old.recipient_user_id and new.recipient_user_id is not null)
     or (new.challenge_id is distinct from old.challenge_id and new.challenge_id is not null) then
    raise exception 'RATING_EVENT_IMMUTABLE' using errcode = 'P0001', detail = 'A rating event is never edited.';
  end if;
  return new;
end $$;
revoke execute on function public.competitive_events_immutable() from public, anon, authenticated;
drop trigger if exists competitive_events_immutable_trg on public.competitive_rating_events;
create trigger competitive_events_immutable_trg before update or delete on public.competitive_rating_events
  for each row execute function public.competitive_events_immutable();

-- The profile is what the ledger says: rating after the newest event, W-L-T counted from events.
create or replace function public.competitive_profile_guard() returns trigger
language plpgsql set search_path = public as $$
declare w int; l int; t int; last_after int; last_at timestamptz;
begin
  select
    count(*) filter (where (e.outcome = 'creator' and e.creator_user_id = new.user_id) or (e.outcome = 'recipient' and e.recipient_user_id = new.user_id)),
    count(*) filter (where (e.outcome = 'recipient' and e.creator_user_id = new.user_id) or (e.outcome = 'creator' and e.recipient_user_id = new.user_id)),
    count(*) filter (where e.outcome = 'tie')
    into w, l, t
  from public.competitive_rating_events e where e.creator_user_id = new.user_id or e.recipient_user_id = new.user_id;
  if new.rated_wins <> w or new.rated_losses <> l or new.rated_ties <> t then
    raise exception 'COMPETITIVE_RECORD_FORGED' using errcode = 'P0001', detail = 'the rated record must equal what the rating ledger holds';
  end if;
  select case when e.creator_user_id = new.user_id then e.creator_rating_after else e.recipient_rating_after end, e.completed_at into last_after, last_at
  from public.competitive_rating_events e where e.creator_user_id = new.user_id or e.recipient_user_id = new.user_id
  order by e.completed_at desc, e.id desc limit 1;
  if new.current_rating <> coalesce(last_after, 1000) then
    raise exception 'COMPETITIVE_RATING_FORGED' using errcode = 'P0001', detail = 'current_rating must be the rating after the account''s newest rating event (or 1000 with none)';
  end if;
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then raise exception 'COMPETITIVE_OWNER_IMMUTABLE' using errcode = 'P0001'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.competitive_profile_guard() from public, anon, authenticated;
drop trigger if exists competitive_profile_guard_trg on public.competitive_profiles;
create trigger competitive_profile_guard_trg before insert or update on public.competitive_profiles
  for each row execute function public.competitive_profile_guard();

-- ── the ONE write: rate one official attempt ─────────────────────────────────
create or replace function public.competitive_rate_attempt(p_attempt_id uuid, p_version text, p_pair_limit integer, p_window_days integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a record; c record; pc record; pr record;
  pair_count integer; ea numeric; eb numeric; sa numeric; sb numeric; ka integer; kb integer;
  da integer; db integer; ra_after integer; rb_after integer; lo uuid; hi uuid; ev_id uuid;
  c_opp integer; r_opp integer;
begin
  select at.id, at.challenge_id, at.user_id as recipient_user_id, at.status, at.challenge_outcome, at.completed_at, ch.creator_user_id
    into a from public.challenge_attempts at join public.challenges ch on ch.id = at.challenge_id where at.id = p_attempt_id;
  if a.id is null then return jsonb_build_object('rated', false, 'reason', 'not_eligible'); end if;
  if exists (select 1 from public.competitive_rating_events e where e.challenge_attempt_id = p_attempt_id and e.rating_version = p_version) then
    return jsonb_build_object('rated', false, 'reason', 'already_rated'); end if;
  if a.status <> 'completed' or a.challenge_outcome not in ('creator', 'recipient', 'tie') or a.completed_at is null then
    return jsonb_build_object('rated', false, 'reason', 'not_completed'); end if;
  if a.creator_user_id is null or a.recipient_user_id is null then return jsonb_build_object('rated', false, 'reason', 'guest_participant'); end if;
  if a.creator_user_id = a.recipient_user_id then return jsonb_build_object('rated', false, 'reason', 'same_account'); end if;

  -- serialise both accounts, always in the same order (no deadlock between two concurrent completions)
  lo := least(a.creator_user_id, a.recipient_user_id); hi := greatest(a.creator_user_id, a.recipient_user_id);
  perform pg_advisory_xact_lock(hashtext('competitive:' || lo::text));
  perform pg_advisory_xact_lock(hashtext('competitive:' || hi::text));
  -- a concurrent caller may have rated it while we waited
  if exists (select 1 from public.competitive_rating_events e where e.challenge_attempt_id = p_attempt_id and e.rating_version = p_version) then
    return jsonb_build_object('rated', false, 'reason', 'already_rated'); end if;

  -- the repeat-opponent window: rated outcomes between this pair in the window ending at this completion
  select count(*) into pair_count from public.competitive_rating_events e
   where ((e.creator_user_id = a.creator_user_id and e.recipient_user_id = a.recipient_user_id) or (e.creator_user_id = a.recipient_user_id and e.recipient_user_id = a.creator_user_id))
     and e.completed_at <= a.completed_at and e.completed_at > a.completed_at - make_interval(days => p_window_days);
  if pair_count >= p_pair_limit then return jsonb_build_object('rated', false, 'reason', 'repeat_opponent_limit'); end if;

  -- Insert only when the row is genuinely absent. `on conflict do nothing` is NOT
  -- enough here: a BEFORE INSERT trigger fires before the conflict is detected, so
  -- the guard would see a fresh 1000 / 0-0-0 row for an account that already holds
  -- events and raise COMPETITIVE_RECORD_FORGED on its second rated match. Both
  -- accounts are already under pg_advisory_xact_lock above, so this cannot race.
  insert into public.competitive_profiles (user_id, rating_version)
  select a.creator_user_id, p_version
   where not exists (select 1 from public.competitive_profiles p where p.user_id = a.creator_user_id);
  insert into public.competitive_profiles (user_id, rating_version)
  select a.recipient_user_id, p_version
   where not exists (select 1 from public.competitive_profiles p where p.user_id = a.recipient_user_id);
  select * into pc from public.competitive_profiles where user_id = a.creator_user_id for update;
  select * into pr from public.competitive_profiles where user_id = a.recipient_user_id for update;

  ea := round(1 / (1 + power(10::numeric, (pr.current_rating - pc.current_rating)::numeric / 400)), 4);
  eb := round(1 - ea, 4);
  sa := case a.challenge_outcome when 'creator' then 1 when 'recipient' then 0 else 0.5 end; sb := 1 - sa;
  ka := case when pc.rated_matches < 10 then 40 else 24 end; kb := case when pr.rated_matches < 10 then 40 else 24 end;
  da := round(ka * (sa - ea))::integer; db := round(kb * (sb - eb))::integer;
  ra_after := greatest(100, pc.current_rating + da); rb_after := greatest(100, pr.current_rating + db);
  da := ra_after - pc.current_rating; db := rb_after - pr.current_rating;

  insert into public.competitive_rating_events (challenge_id, challenge_attempt_id, creator_user_id, recipient_user_id, rating_version,
      creator_rating_before, recipient_rating_before, creator_expected, recipient_expected, outcome, creator_delta, recipient_delta, creator_rating_after, recipient_rating_after, completed_at)
  values (a.challenge_id, a.id, a.creator_user_id, a.recipient_user_id, p_version, pc.current_rating, pr.current_rating, ea, eb, a.challenge_outcome, da, db, ra_after, rb_after, a.completed_at)
  returning id into ev_id;

  select count(distinct case when e.creator_user_id = a.creator_user_id then e.recipient_user_id else e.creator_user_id end) into c_opp
    from public.competitive_rating_events e where e.creator_user_id = a.creator_user_id or e.recipient_user_id = a.creator_user_id;
  select count(distinct case when e.creator_user_id = a.recipient_user_id then e.recipient_user_id else e.creator_user_id end) into r_opp
    from public.competitive_rating_events e where e.creator_user_id = a.recipient_user_id or e.recipient_user_id = a.recipient_user_id;

  update public.competitive_profiles set
    current_rating = ra_after, rated_matches = rated_matches + 1,
    rated_wins = rated_wins + case when a.challenge_outcome = 'creator' then 1 else 0 end,
    rated_losses = rated_losses + case when a.challenge_outcome = 'recipient' then 1 else 0 end,
    rated_ties = rated_ties + case when a.challenge_outcome = 'tie' then 1 else 0 end,
    unique_opponents = c_opp, rating_version = p_version, last_rated_at = a.completed_at,
    placed_at = coalesce(placed_at, case when rated_matches + 1 >= 5 and c_opp >= 3 then a.completed_at end)
  where user_id = a.creator_user_id;
  update public.competitive_profiles set
    current_rating = rb_after, rated_matches = rated_matches + 1,
    rated_wins = rated_wins + case when a.challenge_outcome = 'recipient' then 1 else 0 end,
    rated_losses = rated_losses + case when a.challenge_outcome = 'creator' then 1 else 0 end,
    rated_ties = rated_ties + case when a.challenge_outcome = 'tie' then 1 else 0 end,
    unique_opponents = r_opp, rating_version = p_version, last_rated_at = a.completed_at,
    placed_at = coalesce(placed_at, case when rated_matches + 1 >= 5 and r_opp >= 3 then a.completed_at end)
  where user_id = a.recipient_user_id;

  return jsonb_build_object('rated', true, 'eventId', ev_id, 'attemptId', a.id, 'challengeId', a.challenge_id, 'outcome', a.challenge_outcome, 'completedAt', a.completed_at,
    'creator', jsonb_build_object('userId', a.creator_user_id, 'before', pc.current_rating, 'expected', ea, 'k', ka, 'delta', da, 'after', ra_after),
    'recipient', jsonb_build_object('userId', a.recipient_user_id, 'before', pr.current_rating, 'expected', eb, 'k', kb, 'delta', db, 'after', rb_after));
end $$;
revoke execute on function public.competitive_rate_attempt(uuid, text, integer, integer) from public, anon, authenticated;

-- ── reconcile: every pending eligible attempt, in frozen chronological order ─
create or replace function public.competitive_reconcile(p_version text, p_pair_limit integer, p_window_days integer, p_limit integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; out jsonb; rated integer := 0; skipped integer := 0; seen integer := 0;
begin
  for r in
    select at.id from public.challenge_attempts at
      join public.challenges ch on ch.id = at.challenge_id
     where at.status = 'completed' and at.user_id is not null and ch.creator_user_id is not null and at.completed_at is not null
       and not exists (select 1 from public.competitive_rating_events e where e.challenge_attempt_id = at.id and e.rating_version = p_version)
     order by at.completed_at asc, at.id asc
     limit greatest(1, p_limit)
  loop
    seen := seen + 1;
    out := public.competitive_rate_attempt(r.id, p_version, p_pair_limit, p_window_days);
    if (out ->> 'rated')::boolean then rated := rated + 1; else skipped := skipped + 1; end if;
  end loop;
  return jsonb_build_object('seen', seen, 'rated', rated, 'skipped', skipped);
end $$;
revoke execute on function public.competitive_reconcile(text, integer, integer, integer) from public, anon, authenticated;

-- ── the safe public projection ───────────────────────────────────────────────
-- Public AND placed accounts only; deterministic ordering; the display name is
-- the CURRENT profile name; no id, email, date or private field leaves.
create or replace function public.competitive_leaderboard(p_limit integer, p_offset integer)
returns table (rank bigint, display_name text, current_rating integer, rated_wins integer, rated_losses integer, rated_ties integer, rated_matches integer, career_level integer, streak text)
language sql security definer set search_path = public stable as $$
  with eligible as (
    select cp.user_id, cp.current_rating, cp.rated_wins, cp.rated_losses, cp.rated_ties, cp.rated_matches, cp.last_rated_at
      from public.competitive_profiles cp
      join public.user_preferences up on up.user_id = cp.user_id and up.prefs ->> 'leaderboard_visibility' = 'public'
     where cp.rated_matches >= 5 and cp.unique_opponents >= 3
  ),
  ranked as (
    select e.*, row_number() over (order by e.current_rating desc, e.rated_wins desc, e.rated_losses asc, e.last_rated_at asc, e.user_id asc) as rank from eligible e
  ),
  -- the streak: the run of identical outcomes from the newest rated event back
  sides as (
    select r.user_id, e.completed_at, e.id,
           case when e.outcome = 'tie' then 'T' when (e.outcome = 'creator') = (e.creator_user_id = r.user_id) then 'W' else 'L' end as side,
           row_number() over (partition by r.user_id order by e.completed_at desc, e.id desc) as rn
      from ranked r join public.competitive_rating_events e on e.creator_user_id = r.user_id or e.recipient_user_id = r.user_id
  ),
  latest as (select user_id, side from sides where rn = 1),
  streaks as (
    select s.user_id, l.side, count(*) as n
      from sides s join latest l on l.user_id = s.user_id
     where s.rn < coalesce((select min(x.rn) from sides x where x.user_id = s.user_id and x.side <> l.side), 1000000)
     group by s.user_id, l.side
  )
  select r.rank, coalesce(p.display_name, 'Coach'), r.current_rating, r.rated_wins, r.rated_losses, r.rated_ties, r.rated_matches, pp.career_level,
         case when st.n is null then null else st.side || st.n end
  from ranked r
  left join public.profiles p on p.user_id = r.user_id
  left join public.progression_profiles pp on pp.user_id = r.user_id
  left join streaks st on st.user_id = r.user_id
  where r.rank > greatest(0, p_offset) and r.rank <= greatest(0, p_offset) + least(greatest(1, p_limit), 100)
  order by r.rank;
$$;
revoke execute on function public.competitive_leaderboard(integer, integer) from public, anon, authenticated;

-- One account's public rank (null unless public and placed) and the rows around it — server-side only.
create or replace function public.competitive_rank_of(p_user_id uuid, p_span integer)
returns table (rank bigint, is_me boolean, display_name text, current_rating integer, rated_wins integer, rated_losses integer, rated_ties integer, rated_matches integer, career_level integer)
language sql security definer set search_path = public stable as $$
  with eligible as (
    select cp.user_id, cp.current_rating, cp.rated_wins, cp.rated_losses, cp.rated_ties, cp.rated_matches, cp.last_rated_at
      from public.competitive_profiles cp
      join public.user_preferences up on up.user_id = cp.user_id and up.prefs ->> 'leaderboard_visibility' = 'public'
     where cp.rated_matches >= 5 and cp.unique_opponents >= 3
  ),
  ranked as (select e.*, row_number() over (order by e.current_rating desc, e.rated_wins desc, e.rated_losses asc, e.last_rated_at asc, e.user_id asc) as rank from eligible e),
  me as (select rank from ranked where user_id = p_user_id)
  select r.rank, r.user_id = p_user_id, coalesce(p.display_name, 'Coach'), r.current_rating, r.rated_wins, r.rated_losses, r.rated_ties, r.rated_matches, pp.career_level
    from ranked r left join public.profiles p on p.user_id = r.user_id left join public.progression_profiles pp on pp.user_id = r.user_id, me
   where r.rank between me.rank - greatest(0, p_span) and me.rank + greatest(0, p_span)
   order by r.rank;
$$;
revoke execute on function public.competitive_rank_of(uuid, integer) from public, anon, authenticated;

-- ── RLS and grants ───────────────────────────────────────────────────────────
alter table public.competitive_profiles      enable row level security;
alter table public.competitive_rating_events enable row level security;
revoke all on public.competitive_profiles      from anon, authenticated;
revoke all on public.competitive_rating_events from anon, authenticated;
grant select on public.competitive_profiles      to authenticated;
grant select on public.competitive_rating_events to authenticated;
drop policy if exists competitive_profiles_select_own on public.competitive_profiles;
create policy competitive_profiles_select_own on public.competitive_profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists competitive_events_select_own on public.competitive_rating_events;
create policy competitive_events_select_own on public.competitive_rating_events
  for select to authenticated using (creator_user_id = auth.uid() or recipient_user_id = auth.uid());
-- No insert, update or delete policy for any client role. The leaderboard is
-- read through the server (service role) from competitive_leaderboard(); a
-- browser never queries another account's profile.

insert into public.schema_migrations (version) values ('0006_competitive_rating_v1') on conflict do nothing;

-- END 0006_competitive_rating_v1.sql

-- BEGIN 0007_public_competitive_profiles_v1.sql
-- ── 0007_public_competitive_profiles_v1 — Phase 9F: Public Competitive Profiles
--
-- A public profile answers WHO IS THIS ERACLASH PLAYER? It never answers what
-- personal information we hold. An account is PRIVATE BY DEFAULT: signing up
-- creates no publicly discoverable profile, and appearing on the Phase 9E
-- leaderboard grants access to nothing else.
--
-- One table, one mapping table and four functions:
--   public_profiles                 one row per account: the opaque public slug
--   profile_featured_achievements   up to three already-unlocked achievements
--   profile_set_featured()          the ONE featured write: validates unlock
--                                   state against achievement_unlocks, replaces
--                                   the showcase atomically
--   profile_public_get()            the safe public projection, by slug, for
--                                   PUBLIC profiles only — a private, missing or
--                                   deleted slug is indistinguishable (no rows)
--   profile_owner_get()             the account's own view: its slug, both
--                                   visibility settings, its featured list and
--                                   the Phase 9E state it is already allowed to see
--   profile_slug_new()              20 symbols of a 32-symbol alphabet (100 bits)
--
-- Every function is SECURITY DEFINER and executable by the service role alone.
-- Browsers read their own rows under RLS and can write nothing here; the
-- featured list is written only through the function, and profile_visibility is
-- written through the existing Phase 9B.2 preference path (user_preferences,
-- owner-only RLS, prefs_ok validated) — never through this schema.
--
-- PUBLIC_PROFILE_POWER_EFFECT = 0. Nothing here is read by any game, draft,
-- era, coach, challenge, rating or XP path. 9F CONSUMES Phase 9E rating state
-- and Phase 9D level and unlock state for display; it computes nothing
-- competitive and creates no second source of truth for either.

-- ── preferences: the closed vocabulary gains one key ────────────────────────
-- Every previously approved key stays valid, profile_visibility is added
-- deliberately, unknown keys stay rejected, and profile_visibility accepts only
-- private or public. leaderboard_visibility is untouched and INDEPENDENT.
create or replace function public.prefs_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_object_keys(p) k
       where k not in ('reduced_motion', 'default_result_tab', 'career_density', 'lobby_landing', 'leaderboard_visibility', 'profile_visibility')
     )
     and (not (p ? 'reduced_motion')        or p ->> 'reduced_motion'        in ('system', 'reduce', 'allow'))
     and (not (p ? 'career_density')        or p ->> 'career_density'        in ('compact', 'expanded'))
     and (not (p ? 'lobby_landing')         or p ->> 'lobby_landing'         in ('lobby', 'last_mode'))
     and (not (p ? 'leaderboard_visibility') or p ->> 'leaderboard_visibility' in ('private', 'public'))
     and (not (p ? 'profile_visibility')    or p ->> 'profile_visibility'    in ('private', 'public'))
     and (not (p ? 'default_result_tab')    or (jsonb_typeof(p -> 'default_result_tab') = 'string'
                                                and (p ->> 'default_result_tab') ~ '^[a-z_]{1,24}$'));
$$;

-- ── the opaque public identifier ────────────────────────────────────────────
-- Crockford base32 without i, l, o, u: a slug read aloud or retyped is
-- unambiguous. 256 is divisible by 32, so byte % 32 is uniform — no modulo bias.
-- 20 symbols x 5 bits = 100 bits. Not the auth id, not the row id, not derived
-- from an email, not sequential.
create or replace function public.profile_slug_new() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('0123456789abcdefghjkmnpqrstvwxyz', (get_byte(b, i) % 32) + 1, 1), '' order by i)
    from (select extensions.gen_random_bytes(20) as b) s, generate_series(0, 19) as i;
$$;

create table if not exists public.public_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  slug       text not null unique default public.profile_slug_new(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_profiles_slug_shape check (slug ~ '^[0-9abcdefghjkmnpqrstvwxyz]{20}$')
);
comment on table public.public_profiles is 'Phase 9F. One opaque public slug per account. The slug is stable across display-name changes and every profile edit, means nothing while profile_visibility is private, and disappears with the account. Visibility itself lives in user_preferences.profile_visibility, not here.';
create index if not exists public_profiles_slug_idx on public.public_profiles (slug);

-- The slug is minted with the account, so it never has to be created during a
-- visibility change (no race, and nothing to get wrong at the moment a profile
-- goes public). It is unreachable until the owner opts in.
create or replace function public.public_profile_provision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.public_profiles (user_id) values (new.user_id) on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.public_profile_provision() from public, anon, authenticated;
drop trigger if exists public_profile_provision_trg on public.profiles;
create trigger public_profile_provision_trg after insert on public.profiles
  for each row execute function public.public_profile_provision();

-- accounts that predate this migration
insert into public.public_profiles (user_id) select p.user_id from public.profiles p on conflict (user_id) do nothing;

-- ── the featured showcase ───────────────────────────────────────────────────
create table if not exists public.profile_featured_achievements (
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null,
  slot           integer not null,
  created_at     timestamptz not null default now(),
  constraint profile_featured_pk   primary key (user_id, achievement_id),
  constraint profile_featured_slot unique (user_id, slot),
  constraint profile_featured_slot_range check (slot between 1 and 3),
  constraint profile_featured_id_shape check (achievement_id ~ '^[a-z0-9_]{1,40}$')
);
comment on table public.profile_featured_achievements is 'Phase 9F. Up to three already-unlocked achievements an account chose to feature. The primary key rejects duplicates, the slot uniqueness and range cap it at three, and profile_set_featured() is the only writer — it refuses any achievement the account has not unlocked. Achievement definitions and unlock rules are Phase 9D and unchanged.';

-- ── the ONE featured write ──────────────────────────────────────────────────
-- Ownership and unlock state are read from achievement_unlocks; the caller's
-- list contributes ids and order only. Locked, unknown, duplicate or
-- over-length lists are refused as a whole — a partial showcase is never saved.
create or replace function public.profile_set_featured(p_user_id uuid, p_ids text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare ids text[]; bad text; n integer;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'reason', 'user_required'); end if;
  ids := coalesce(p_ids, '{}');
  n := array_length(ids, 1);
  if n is null then n := 0; end if;
  if n > 3 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  if exists (select 1 from unnest(ids) x group by x having count(*) > 1) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate'); end if;
  if exists (select 1 from unnest(ids) x where x !~ '^[a-z0-9_]{1,40}$') then
    return jsonb_build_object('ok', false, 'reason', 'malformed'); end if;
  -- an achievement this account has not unlocked can never be featured, whoever asks
  select x into bad from unnest(ids) x
   where not exists (select 1 from public.achievement_unlocks u where u.user_id = p_user_id and u.achievement_id = x)
   limit 1;
  if bad is not null then return jsonb_build_object('ok', false, 'reason', 'not_unlocked', 'achievementId', bad); end if;

  perform pg_advisory_xact_lock(hashtext('profile_featured:' || p_user_id::text));
  delete from public.profile_featured_achievements where user_id = p_user_id;
  if n > 0 then
    insert into public.profile_featured_achievements (user_id, achievement_id, slot)
    select p_user_id, ids[i], i from generate_series(1, n) as i;
  end if;
  update public.public_profiles set updated_at = now() where user_id = p_user_id;
  return jsonb_build_object('ok', true, 'featured', to_jsonb(ids));
end $$;
revoke execute on function public.profile_set_featured(uuid, text[]) from public, anon, authenticated;

-- ── the safe public projection ──────────────────────────────────────────────
-- By slug, and only for an account whose profile_visibility is public. A
-- private slug, an unknown slug, a deleted slug and a uuid supplied as a slug
-- all return the same thing: no rows. Nothing here reveals whether an account
-- exists, and the select list is fixed — there is no base row for a client to
-- filter.
--
-- Rating and rank are withheld unless the account is PLACED, preserving the
-- Phase 9E invariant that a provisional rating is private until placement. Rank
-- additionally requires leaderboard_visibility = 'public', because a rank is a
-- leaderboard fact and that listing is governed separately.
create or replace function public.profile_public_get(p_slug text)
returns table (
  slug text, display_name text, state text, current_rating integer, rank bigint,
  rated_wins integer, rated_losses integer, rated_ties integer, rated_matches integer,
  unique_opponents integer, career_level integer, featured text[]
)
language sql security definer set search_path = public stable as $$
  with target as (
    select pp.user_id, pp.slug
      from public.public_profiles pp
      join public.user_preferences up on up.user_id = pp.user_id
     where pp.slug = p_slug
       and p_slug ~ '^[0-9abcdefghjkmnpqrstvwxyz]{20}$'
       and up.prefs ->> 'profile_visibility' = 'public'
  ),
  comp as (
    select t.user_id,
           cp.current_rating, cp.rated_wins, cp.rated_losses, cp.rated_ties, cp.rated_matches, cp.unique_opponents,
           (cp.rated_matches >= 5 and cp.unique_opponents >= 3) as placed,
           coalesce(up.prefs ->> 'leaderboard_visibility', 'private') as lb
      from target t
      left join public.competitive_profiles cp on cp.user_id = t.user_id
      left join public.user_preferences up on up.user_id = t.user_id
  )
  select t.slug,
         coalesce(p.display_name, 'Coach'),
         case when c.placed then 'placed' when coalesce(c.rated_matches, 0) > 0 then 'provisional' else 'none' end,
         case when c.placed then c.current_rating end,
         case when c.placed and c.lb = 'public' then (
           select r.rank from public.competitive_rank_of(t.user_id, 0) r limit 1
         ) end,
         case when c.placed then c.rated_wins end,
         case when c.placed then c.rated_losses end,
         case when c.placed then c.rated_ties end,
         -- The two placement counts are NOT withheld: the provisional card is
         -- meant to say "3 / 5 RATED MATCHES, 2 / 3 OPPONENTS". It is the
         -- rating, the rank and the W-L-T split that stay private until placed.
         coalesce(c.rated_matches, 0),
         coalesce(c.unique_opponents, 0),
         pr.career_level,
         coalesce((select array_agg(f.achievement_id order by f.slot) from public.profile_featured_achievements f where f.user_id = t.user_id), '{}')
    from target t
    join comp c on c.user_id = t.user_id
    left join public.profiles p on p.user_id = t.user_id
    left join public.progression_profiles pr on pr.user_id = t.user_id;
$$;
revoke execute on function public.profile_public_get(text) from public, anon, authenticated;

-- ── links for the rows the public leaderboard already shows ─────────────────
-- Phase 9E's projection deliberately exposes no user_id, so a leaderboard row
-- cannot be joined to a slug. Rather than duplicate the Phase 9E ordering here
-- (which would create a second source of truth for ranking), this asks Phase
-- 9E's OWN authority, competitive_rank_of(), for the rank of each account that
-- opted in TWICE — profile_visibility public AND leaderboard_visibility public.
--
-- This is NOT a profile listing. It takes no identifier, it can return nothing
-- that the public Top 100 does not already display, and a public profile whose
-- owner kept their leaderboard private never appears. It exists so a
-- leaderboard row can link to a profile that chose to be linkable, and for no
-- other purpose.
create or replace function public.profile_board_links(p_limit integer)
returns table (rank bigint, slug text)
language sql security definer set search_path = public stable as $$
  select r.rank, pp.slug
    from public.public_profiles pp
    join public.user_preferences up on up.user_id = pp.user_id
     and up.prefs ->> 'profile_visibility' = 'public'
     and up.prefs ->> 'leaderboard_visibility' = 'public'
    cross join lateral (select x.rank from public.competitive_rank_of(pp.user_id, 0) x limit 1) r
   where r.rank is not null
     and r.rank <= least(greatest(1, p_limit), 100)
   order by r.rank;
$$;
revoke execute on function public.profile_board_links(integer) from public, anon, authenticated;

-- ── the account's own view ──────────────────────────────────────────────────
-- The owner may see their own slug, both settings, their featured list and the
-- provisional information Phase 9E already shows them.
create or replace function public.profile_owner_get(p_user_id uuid)
returns table (
  slug text, display_name text, profile_visibility text, leaderboard_visibility text,
  state text, current_rating integer, rank bigint,
  rated_wins integer, rated_losses integer, rated_ties integer, rated_matches integer,
  unique_opponents integer, career_level integer, featured text[], unlocked text[]
)
language sql security definer set search_path = public stable as $$
  with me as (
    select pp.user_id, pp.slug,
           coalesce(up.prefs ->> 'profile_visibility', 'private')     as pv,
           coalesce(up.prefs ->> 'leaderboard_visibility', 'private') as lv
      from public.public_profiles pp
      left join public.user_preferences up on up.user_id = pp.user_id
     where pp.user_id = p_user_id
  ),
  comp as (
    select m.user_id, cp.current_rating, cp.rated_wins, cp.rated_losses, cp.rated_ties,
           cp.rated_matches, cp.unique_opponents,
           (cp.rated_matches >= 5 and cp.unique_opponents >= 3) as placed
      from me m left join public.competitive_profiles cp on cp.user_id = m.user_id
  )
  select m.slug, coalesce(p.display_name, 'Coach'), m.pv, m.lv,
         case when c.placed then 'placed' when coalesce(c.rated_matches, 0) > 0 then 'provisional' else 'none' end,
         coalesce(c.current_rating, 1000),
         case when c.placed and m.lv = 'public' then (select r.rank from public.competitive_rank_of(m.user_id, 0) r limit 1) end,
         coalesce(c.rated_wins, 0), coalesce(c.rated_losses, 0), coalesce(c.rated_ties, 0),
         coalesce(c.rated_matches, 0), coalesce(c.unique_opponents, 0),
         pr.career_level,
         coalesce((select array_agg(f.achievement_id order by f.slot) from public.profile_featured_achievements f where f.user_id = m.user_id), '{}'),
         coalesce((select array_agg(u.achievement_id order by u.unlocked_at) from public.achievement_unlocks u where u.user_id = m.user_id), '{}')
    from me m
    join comp c on c.user_id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    left join public.progression_profiles pr on pr.user_id = m.user_id;
$$;
revoke execute on function public.profile_owner_get(uuid) from public, anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Both tables: owner may read their own row and write nothing. Anonymous holds
-- no privilege at all. Every public read goes through the SECURITY DEFINER
-- projection above, which has a fixed select list — a client never receives a
-- base row to filter. No Phase 9B/9C/9D/9E policy is weakened here.
alter table public.public_profiles                enable row level security;
alter table public.profile_featured_achievements  enable row level security;
revoke all on public.public_profiles               from anon, authenticated;
revoke all on public.profile_featured_achievements from anon, authenticated;
grant select on public.public_profiles               to authenticated;
grant select on public.profile_featured_achievements to authenticated;
drop policy if exists public_profiles_select_own on public.public_profiles;
create policy public_profiles_select_own on public.public_profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists profile_featured_select_own on public.profile_featured_achievements;
create policy profile_featured_select_own on public.profile_featured_achievements
  for select to authenticated using (user_id = auth.uid());

-- The slug is not the account's to change: a rotating slug would break every
-- link already shared, and a chosen slug would leak identity.
create or replace function public.public_profile_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.slug <> old.slug then
    raise exception 'PUBLIC_PROFILE_SLUG_IMMUTABLE' using errcode = 'P0001',
      detail = 'A public profile slug is stable for the life of the account; shared links must keep resolving.';
  end if;
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'PUBLIC_PROFILE_OWNER_IMMUTABLE' using errcode = 'P0001'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.public_profile_guard() from public, anon, authenticated;
drop trigger if exists public_profile_guard_trg on public.public_profiles;
create trigger public_profile_guard_trg before update on public.public_profiles
  for each row execute function public.public_profile_guard();

insert into public.schema_migrations (version) values ('0007_public_competitive_profiles_v1') on conflict do nothing;

-- END 0007_public_competitive_profiles_v1.sql

-- BEGIN 0008_rivalries_v1.sql
-- ── 0008_rivalries_v1 — Shareable Clash Cards + Rivalries V1 ──────────────────
--
-- A Rivalry is a PRIVATE, MUTUALLY ACCEPTED relationship between TWO accounts
-- who agreed to track their governed Challenge comparisons. It is not a public
-- connection, not a follower relationship, not a roster-versus-roster game and
-- not a second rating system. Nothing here changes who may create or accept a
-- Challenge, how a comparison is decided, how a rating moves or how XP is earned.
--
-- Additive only. Backward compatible with the live app: no existing table,
-- function, trigger or policy is altered. Turning the feature off leaves these
-- tables idle. Applied to Preview during the build; Production only on release.
--
-- Tables (one row per UNORDERED account pair; the database enforces the order):
--   rivalries              the pair, its current state, the pending request
--   rivalry_periods        one row per mutually accepted period (start → end)
--   rivalry_blocks         "no further Rivalry requests from this account"
--   rivalry_request_log    every request sent, for the bounded daily/outgoing limits
--   rivalry_events         the immutable ledger: ONE row per qualifying official attempt
--
-- Functions (SECURITY DEFINER, execute revoked from every client role; called by
-- the server with the service role after it verified the caller's bearer):
--   rivalry_request()        START A RIVALRY from a completed account-vs-account comparison
--   rivalry_respond()        accept · decline · block · unblock · cancel · end
--   rivalry_record_attempt() enrol ONE completed official attempt into its period, once
--   rivalry_reconcile()      enrol whatever is pending, oldest first (idempotent repair)
--   rivalry_list()           one account's Rivalries — the safe projection
--   rivalry_detail()         one Rivalry for one of its two members — periods, events, pending Challenges
--
-- Contract: src/rivalries/contract.js (rivalryContractVersion 1.0.0).

-- ── the pair ─────────────────────────────────────────────────────────────────
create table if not exists public.rivalries (
  id                 uuid primary key default gen_random_uuid(),
  user_low           uuid not null,
  user_high          uuid not null,
  state              text not null default 'idle',
  contract_version   text not null default '1.0.0',
  pending_from       uuid,
  pending_at         timestamptz,
  pending_expires_at timestamptz,
  current_period_id  uuid,
  last_closed_reason text,
  last_closed_at     timestamptz,
  low_deleted        boolean not null default false,
  high_deleted       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint rivalries_pair_order   check (user_low < user_high),
  constraint rivalries_pair_unique  unique (user_low, user_high),
  constraint rivalries_state        check (state in ('idle', 'pending', 'active')),
  constraint rivalries_pending_shape check (state <> 'pending' or (pending_from is not null and pending_at is not null and pending_expires_at is not null)),
  constraint rivalries_pending_member check (pending_from is null or pending_from = user_low or pending_from = user_high),
  constraint rivalries_active_shape check (state <> 'active' or current_period_id is not null),
  constraint rivalries_close_reason check (last_closed_reason is null or last_closed_reason in ('declined', 'canceled', 'expired', 'ended', 'blocked', 'account_deleted'))
);
-- No FK to auth.users on purpose: a deleted member is MARKED (low_deleted /
-- high_deleted) by the deletion trigger below so the surviving member keeps a
-- private "Deleted account" history. The retained uuid identifies a deleted auth
-- user and nothing else; the anonymisation matches competitive_rating_events.
create index if not exists rivalries_low_idx  on public.rivalries (user_low, state);
create index if not exists rivalries_high_idx on public.rivalries (user_high, state);

-- ── periods: mutual acceptance → end ─────────────────────────────────────────
create table if not exists public.rivalry_periods (
  id          uuid primary key default gen_random_uuid(),
  rivalry_id  uuid not null references public.rivalries (id) on delete cascade,
  period_no   integer not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  ended_by    uuid,
  end_reason  text,
  constraint rivalry_periods_once unique (rivalry_id, period_no),
  constraint rivalry_periods_order check (ended_at is null or ended_at >= started_at),
  constraint rivalry_periods_end_reason check (end_reason is null or end_reason in ('ended', 'blocked', 'account_deleted'))
);
create index if not exists rivalry_periods_rivalry_idx on public.rivalry_periods (rivalry_id, period_no desc);

-- ── blocks ───────────────────────────────────────────────────────────────────
create table if not exists public.rivalry_blocks (
  blocker_user_id uuid not null references auth.users (id) on delete cascade,
  blocked_user_id uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint rivalry_blocks_not_self check (blocker_user_id <> blocked_user_id)
);

-- ── request log (bounded request behaviour) ──────────────────────────────────
create table if not exists public.rivalry_request_log (
  id            uuid primary key default gen_random_uuid(),
  rivalry_id    uuid not null references public.rivalries (id) on delete cascade,
  from_user_id  uuid not null,
  to_user_id    uuid not null,
  created_at    timestamptz not null default now()
);
create index if not exists rivalry_request_log_from_idx on public.rivalry_request_log (from_user_id, created_at desc);

-- ── the immutable ledger ─────────────────────────────────────────────────────
create table if not exists public.rivalry_events (
  id                   uuid primary key default gen_random_uuid(),
  rivalry_id           uuid not null references public.rivalries (id) on delete cascade,
  period_id            uuid not null references public.rivalry_periods (id) on delete cascade,
  challenge_id         uuid not null references public.challenges (id) on delete cascade,
  challenge_attempt_id uuid not null references public.challenge_attempts (id) on delete cascade,
  contract_version     text not null,
  low_outcome          text not null,
  rated                boolean not null default false,
  attempt_started_at   timestamptz not null,
  completed_at         timestamptz not null,
  created_at           timestamptz not null default now(),
  constraint rivalry_events_once unique (challenge_attempt_id),
  constraint rivalry_events_low_outcome check (low_outcome in ('win', 'loss', 'tie'))
);
create index if not exists rivalry_events_period_idx on public.rivalry_events (period_id, completed_at desc, id desc);
create index if not exists rivalry_events_rivalry_idx on public.rivalry_events (rivalry_id, completed_at desc, id desc);

create or replace function public.rivalry_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'RIVALRY_EVENT_IMMUTABLE' using errcode = 'P0001';
end $$;
revoke execute on function public.rivalry_events_immutable() from public, anon, authenticated;
drop trigger if exists rivalry_events_immutable_trg on public.rivalry_events;
create trigger rivalry_events_immutable_trg before update or delete on public.rivalry_events
  for each row execute function public.rivalry_events_immutable();

-- ── account deletion: mark, close, never rediscover ──────────────────────────
create or replace function public.rivalries_on_account_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.rivalry_periods p set ended_at = now(), end_reason = 'account_deleted'
    from public.rivalries r
   where p.rivalry_id = r.id and p.ended_at is null and (r.user_low in (select id from old_table) or r.user_high in (select id from old_table));
  update public.rivalries r set
      state = 'idle', pending_from = null, pending_at = null, pending_expires_at = null, current_period_id = null,
      last_closed_reason = 'account_deleted', last_closed_at = now(), updated_at = now(),
      low_deleted  = low_deleted  or r.user_low  in (select id from old_table),
      high_deleted = high_deleted or r.user_high in (select id from old_table)
   where r.user_low in (select id from old_table) or r.user_high in (select id from old_table);
  return null;
end $$;
revoke execute on function public.rivalries_on_account_deleted() from public, anon, authenticated;
drop trigger if exists on_auth_user_deleted_rivalries on auth.users;
create trigger on_auth_user_deleted_rivalries after delete on auth.users
  referencing old table as old_table
  for each statement execute function public.rivalries_on_account_deleted();

-- ── helpers ──────────────────────────────────────────────────────────────────
create or replace function public.rivalry_member_deleted(r public.rivalries, p_user uuid)
returns boolean language sql immutable as $$
  select case when r.user_low = p_user then r.low_deleted when r.user_high = p_user then r.high_deleted else true end;
$$;
revoke execute on function public.rivalry_member_deleted(public.rivalries, uuid) from public, anon, authenticated;

-- The opponent, as one participant may see them: the CURRENT display name (or
-- "Deleted account"), and the public slug only while that profile is public.
create or replace function public.rivalry_opponent_view(p_opponent uuid, p_deleted boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_deleted or not exists (select 1 from public.profiles where user_id = p_opponent)
    then jsonb_build_object('name', 'Deleted account', 'deleted', true, 'publicSlug', null)
    else jsonb_build_object(
      'name', coalesce((select display_name from public.profiles where user_id = p_opponent), 'Coach'),
      'deleted', false,
      'publicSlug', (select pp.slug from public.public_profiles pp join public.user_preferences up on up.user_id = pp.user_id
                      where pp.user_id = p_opponent and up.prefs ->> 'profile_visibility' = 'public'))
  end;
$$;
revoke execute on function public.rivalry_opponent_view(uuid, boolean) from public, anon, authenticated;

-- W–L–T for one side of one period (or the whole rivalry when p_period is null).
create or replace function public.rivalry_record(p_rivalry uuid, p_period uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (select user_low from public.rivalries where id = p_rivalry),
  e as (select e.low_outcome from public.rivalry_events e where e.rivalry_id = p_rivalry and (p_period is null or e.period_id = p_period)),
  s as (select case when e.low_outcome = 'tie' then 'tie' when ((select user_low from r) = p_user) = (e.low_outcome = 'win') then 'win' else 'loss' end as side from e)
  select jsonb_build_object(
    'wins',   (select count(*) from s where side = 'win'),
    'losses', (select count(*) from s where side = 'loss'),
    'ties',   (select count(*) from s where side = 'tie'),
    'total',  (select count(*) from s));
$$;
revoke execute on function public.rivalry_record(uuid, uuid, uuid) from public, anon, authenticated;

-- ── START A RIVALRY ──────────────────────────────────────────────────────────
-- The opponent is RESOLVED from the completed comparison the actor took part
-- in; the request body never names an account. Statuses are closed:
-- requested · pending_incoming · already_pending · already_active · unavailable
-- (blocked either way, deleted opponent, guest comparison — one generic word)
-- · not_eligible · self · cooldown · daily_limit · outgoing_limit
create or replace function public.rivalry_request(p_actor uuid, p_attempt_id uuid, p_ttl_days integer, p_daily_limit integer, p_max_outgoing integer, p_decline_cooldown_days integer, p_close_cooldown_days integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a record; opp uuid; lo uuid; hi uuid; r public.rivalries; sent_today integer; outgoing integer; cooldown_until timestamptz;
begin
  if p_actor is null then return jsonb_build_object('status', 'not_eligible'); end if;
  select at.id, at.status, at.user_id as recipient_user_id, ch.creator_user_id
    into a from public.challenge_attempts at join public.challenges ch on ch.id = at.challenge_id where at.id = p_attempt_id;
  if a.id is null or a.status <> 'completed' then return jsonb_build_object('status', 'not_eligible'); end if;
  if a.creator_user_id is null or a.recipient_user_id is null then return jsonb_build_object('status', 'unavailable'); end if;
  if p_actor <> a.creator_user_id and p_actor <> a.recipient_user_id then return jsonb_build_object('status', 'not_eligible'); end if;
  if a.creator_user_id = a.recipient_user_id then return jsonb_build_object('status', 'self'); end if;
  opp := case when p_actor = a.creator_user_id then a.recipient_user_id else a.creator_user_id end;
  if not exists (select 1 from public.profiles where user_id = opp) then return jsonb_build_object('status', 'unavailable'); end if;

  lo := least(p_actor, opp); hi := greatest(p_actor, opp);
  perform pg_advisory_xact_lock(hashtext('rivalry:' || lo::text || ':' || hi::text));

  -- a block in EITHER direction reads as the same generic word as a deleted opponent
  if exists (select 1 from public.rivalry_blocks b where (b.blocker_user_id = opp and b.blocked_user_id = p_actor) or (b.blocker_user_id = p_actor and b.blocked_user_id = opp)) then
    return jsonb_build_object('status', 'unavailable'); end if;

  select * into r from public.rivalries where user_low = lo and user_high = hi for update;
  if r.id is not null then
    if r.state = 'active' then return jsonb_build_object('status', 'already_active', 'rivalryId', r.id); end if;
    if r.state = 'pending' and r.pending_expires_at > now() then
      if r.pending_from = p_actor then return jsonb_build_object('status', 'already_pending', 'rivalryId', r.id, 'expiresAt', r.pending_expires_at); end if;
      -- crossed requests: the OTHER side already asked. No duplicate, no silent mutual acceptance.
      return jsonb_build_object('status', 'pending_incoming', 'rivalryId', r.id, 'expiresAt', r.pending_expires_at);
    end if;
    if r.state = 'pending' then
      -- lapsed: close it honestly before considering a fresh request
      update public.rivalries set state = 'idle', pending_from = null, pending_at = null, pending_expires_at = null, last_closed_reason = 'expired', last_closed_at = pending_expires_at, updated_at = now() where id = r.id;
      r.state := 'idle'; r.last_closed_reason := 'expired'; r.last_closed_at := r.pending_expires_at;
    end if;
    cooldown_until := case r.last_closed_reason
      when 'declined' then r.last_closed_at + make_interval(days => greatest(0, p_decline_cooldown_days))
      when 'canceled' then r.last_closed_at + make_interval(days => greatest(0, p_close_cooldown_days))
      when 'ended'    then r.last_closed_at + make_interval(days => greatest(0, p_close_cooldown_days))
      else null end;
    if cooldown_until is not null and cooldown_until > now() then return jsonb_build_object('status', 'cooldown', 'until', cooldown_until); end if;
  end if;

  select count(*) into sent_today from public.rivalry_request_log l where l.from_user_id = p_actor and l.created_at > now() - interval '24 hours';
  if sent_today >= greatest(0, p_daily_limit) then return jsonb_build_object('status', 'daily_limit'); end if;
  select count(*) into outgoing from public.rivalries x where x.state = 'pending' and x.pending_from = p_actor and x.pending_expires_at > now();
  if outgoing >= greatest(0, p_max_outgoing) then return jsonb_build_object('status', 'outgoing_limit'); end if;

  if r.id is null then
    insert into public.rivalries (user_low, user_high, state, pending_from, pending_at, pending_expires_at)
      values (lo, hi, 'pending', p_actor, now(), now() + make_interval(days => greatest(1, p_ttl_days)))
      returning * into r;
  else
    update public.rivalries set state = 'pending', pending_from = p_actor, pending_at = now(), pending_expires_at = now() + make_interval(days => greatest(1, p_ttl_days)), updated_at = now()
      where id = r.id returning * into r;
  end if;
  insert into public.rivalry_request_log (rivalry_id, from_user_id, to_user_id) values (r.id, p_actor, opp);
  return jsonb_build_object('status', 'requested', 'rivalryId', r.id, 'expiresAt', r.pending_expires_at);
end $$;
revoke execute on function public.rivalry_request(uuid, uuid, integer, integer, integer, integer, integer) from public, anon, authenticated;

-- ── accept · decline · block · unblock · cancel · end ────────────────────────
-- Only a MEMBER may act, and only the actions its side is allowed right now.
-- A rivalry that is not the actor's reads as `not_yours` — the same for a
-- guessed id, so nothing here confirms that a pair exists.
create or replace function public.rivalry_respond(p_actor uuid, p_rivalry_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.rivalries; opp uuid; per_id uuid; nxt integer;
begin
  if p_actor is null then return jsonb_build_object('status', 'not_yours'); end if;
  select * into r from public.rivalries where id = p_rivalry_id for update;
  if r.id is null or (p_actor <> r.user_low and p_actor <> r.user_high) then return jsonb_build_object('status', 'not_yours'); end if;
  opp := case when p_actor = r.user_low then r.user_high else r.user_low end;

  if p_action = 'unblock' then
    delete from public.rivalry_blocks where blocker_user_id = p_actor and blocked_user_id = opp;
    return jsonb_build_object('status', 'unblocked', 'rivalryId', r.id);
  end if;

  if p_action = 'accept' then
    if r.state <> 'pending' then return jsonb_build_object('status', 'not_pending'); end if;
    if r.pending_from = p_actor then return jsonb_build_object('status', 'not_pending'); end if;      -- you cannot accept your own request
    if r.pending_expires_at <= now() then
      update public.rivalries set state = 'idle', pending_from = null, pending_at = null, pending_expires_at = null, last_closed_reason = 'expired', last_closed_at = pending_expires_at, updated_at = now() where id = r.id;
      return jsonb_build_object('status', 'expired');
    end if;
    if public.rivalry_member_deleted(r, opp) or not exists (select 1 from public.profiles where user_id = opp) then return jsonb_build_object('status', 'unavailable'); end if;
    if exists (select 1 from public.rivalry_blocks b where (b.blocker_user_id = opp and b.blocked_user_id = p_actor) or (b.blocker_user_id = p_actor and b.blocked_user_id = opp)) then
      return jsonb_build_object('status', 'unavailable'); end if;
    select coalesce(max(period_no), 0) + 1 into nxt from public.rivalry_periods where rivalry_id = r.id;
    insert into public.rivalry_periods (rivalry_id, period_no, started_at) values (r.id, nxt, now()) returning id into per_id;
    update public.rivalries set state = 'active', current_period_id = per_id, pending_from = null, pending_at = null, pending_expires_at = null, updated_at = now() where id = r.id;
    return jsonb_build_object('status', 'accepted', 'rivalryId', r.id, 'periodId', per_id, 'periodNo', nxt, 'startedAt', (select started_at from public.rivalry_periods where id = per_id));
  end if;

  if p_action = 'decline' then
    if r.state <> 'pending' or r.pending_from = p_actor then return jsonb_build_object('status', 'not_pending'); end if;
    update public.rivalries set state = 'idle', pending_from = null, pending_at = null, pending_expires_at = null, last_closed_reason = 'declined', last_closed_at = now(), updated_at = now() where id = r.id;
    return jsonb_build_object('status', 'declined', 'rivalryId', r.id);
  end if;

  if p_action = 'cancel' then
    if r.state <> 'pending' or r.pending_from <> p_actor then return jsonb_build_object('status', 'not_pending'); end if;
    update public.rivalries set state = 'idle', pending_from = null, pending_at = null, pending_expires_at = null, last_closed_reason = 'canceled', last_closed_at = now(), updated_at = now() where id = r.id;
    return jsonb_build_object('status', 'canceled', 'rivalryId', r.id);
  end if;

  if p_action = 'end' then
    if r.state <> 'active' then return jsonb_build_object('status', 'not_active'); end if;
    update public.rivalry_periods set ended_at = now(), ended_by = p_actor, end_reason = 'ended' where id = r.current_period_id and ended_at is null;
    update public.rivalries set state = 'idle', current_period_id = null, last_closed_reason = 'ended', last_closed_at = now(), updated_at = now() where id = r.id;
    return jsonb_build_object('status', 'ended', 'rivalryId', r.id);
  end if;

  if p_action = 'block' then
    insert into public.rivalry_blocks (blocker_user_id, blocked_user_id) values (p_actor, opp) on conflict do nothing;
    if r.state = 'active' then
      update public.rivalry_periods set ended_at = now(), ended_by = p_actor, end_reason = 'blocked' where id = r.current_period_id and ended_at is null;
    end if;
    if r.state <> 'idle' then
      update public.rivalries set state = 'idle', current_period_id = null, pending_from = null, pending_at = null, pending_expires_at = null, last_closed_reason = 'blocked', last_closed_at = now(), updated_at = now() where id = r.id;
    end if;
    return jsonb_build_object('status', 'blocked', 'rivalryId', r.id);
  end if;

  return jsonb_build_object('status', 'failed', 'detail', 'unknown_action');
end $$;
revoke execute on function public.rivalry_respond(uuid, uuid, text) from public, anon, authenticated;

-- ── enrol ONE completed official attempt, once ───────────────────────────────
-- Consumes the authoritative comparison (challenge_attempts.challenge_outcome).
-- Eligible when: both participants are accounts, distinct, the attempt is
-- completed, the pair has a period and the attempt STARTED inside it (an
-- attempt enrolled before the Rivalry ended still settles into its record;
-- nothing before mutual acceptance is backfilled). `rated` is read from the
-- rating ledger and displayed, never computed here.
create or replace function public.rivalry_record_attempt(p_attempt_id uuid, p_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; lo uuid; hi uuid; r public.rivalries; per record; lowout text; ev_id uuid; is_rated boolean;
begin
  select at.id, at.challenge_id, at.user_id as recipient_user_id, at.status, at.challenge_outcome, at.created_at as started_at, at.completed_at, ch.creator_user_id
    into a from public.challenge_attempts at join public.challenges ch on ch.id = at.challenge_id where at.id = p_attempt_id;
  if a.id is null then return jsonb_build_object('recorded', false, 'reason', 'not_completed'); end if;
  if exists (select 1 from public.rivalry_events e where e.challenge_attempt_id = p_attempt_id) then return jsonb_build_object('recorded', false, 'reason', 'already_recorded'); end if;
  if a.status <> 'completed' or a.challenge_outcome not in ('creator', 'recipient', 'tie') or a.completed_at is null then return jsonb_build_object('recorded', false, 'reason', 'not_completed'); end if;
  if a.creator_user_id is null or a.recipient_user_id is null then return jsonb_build_object('recorded', false, 'reason', 'guest_participant'); end if;
  if a.creator_user_id = a.recipient_user_id then return jsonb_build_object('recorded', false, 'reason', 'same_account'); end if;
  lo := least(a.creator_user_id, a.recipient_user_id); hi := greatest(a.creator_user_id, a.recipient_user_id);
  perform pg_advisory_xact_lock(hashtext('rivalry:' || lo::text || ':' || hi::text));
  if exists (select 1 from public.rivalry_events e where e.challenge_attempt_id = p_attempt_id) then return jsonb_build_object('recorded', false, 'reason', 'already_recorded'); end if;
  select * into r from public.rivalries where user_low = lo and user_high = hi;
  if r.id is null then return jsonb_build_object('recorded', false, 'reason', 'not_rivals'); end if;
  select * into per from public.rivalry_periods p where p.rivalry_id = r.id and a.started_at >= p.started_at and (p.ended_at is null or a.started_at < p.ended_at) order by p.period_no desc limit 1;
  if per.id is null then return jsonb_build_object('recorded', false, 'reason', 'not_in_period'); end if;
  lowout := case when a.challenge_outcome = 'tie' then 'tie'
                 when (case when a.challenge_outcome = 'creator' then a.creator_user_id else a.recipient_user_id end) = lo then 'win' else 'loss' end;
  is_rated := exists (select 1 from public.competitive_rating_events e where e.challenge_attempt_id = a.id);
  insert into public.rivalry_events (rivalry_id, period_id, challenge_id, challenge_attempt_id, contract_version, low_outcome, rated, attempt_started_at, completed_at)
    values (r.id, per.id, a.challenge_id, a.id, p_version, lowout, is_rated, a.started_at, a.completed_at)
    on conflict (challenge_attempt_id) do nothing
    returning id into ev_id;
  if ev_id is null then return jsonb_build_object('recorded', false, 'reason', 'already_recorded'); end if;
  return jsonb_build_object('recorded', true, 'eventId', ev_id, 'rivalryId', r.id, 'periodId', per.id, 'periodNo', per.period_no, 'lowOutcome', lowout, 'rated', is_rated, 'completedAt', a.completed_at);
end $$;
revoke execute on function public.rivalry_record_attempt(uuid, text) from public, anon, authenticated;

-- ── reconcile: every pending eligible attempt, oldest first ──────────────────
-- Bounded to pairs that have a Rivalry period; idempotent (a second run enrols
-- nothing); never touches ratings, XP or profiles.
create or replace function public.rivalry_reconcile(p_version text, p_limit integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x record; out jsonb; recorded integer := 0; skipped integer := 0; seen integer := 0;
begin
  for x in
    select at.id from public.challenge_attempts at
      join public.challenges ch on ch.id = at.challenge_id
      join public.rivalries r on r.user_low = least(ch.creator_user_id, at.user_id) and r.user_high = greatest(ch.creator_user_id, at.user_id)
      join public.rivalry_periods p on p.rivalry_id = r.id and at.created_at >= p.started_at and (p.ended_at is null or at.created_at < p.ended_at)
     where at.status = 'completed' and at.user_id is not null and ch.creator_user_id is not null and at.completed_at is not null
       and ch.creator_user_id <> at.user_id
       and not exists (select 1 from public.rivalry_events e where e.challenge_attempt_id = at.id)
     order by at.completed_at asc, at.id asc
     limit greatest(1, p_limit)
  loop
    seen := seen + 1;
    out := public.rivalry_record_attempt(x.id, p_version);
    if (out ->> 'recorded')::boolean then recorded := recorded + 1; else skipped := skipped + 1; end if;
  end loop;
  return jsonb_build_object('seen', seen, 'recorded', recorded, 'skipped', skipped);
end $$;
revoke execute on function public.rivalry_reconcile(text, integer) from public, anon, authenticated;

-- ── the safe projections ─────────────────────────────────────────────────────
-- One account's Rivalries. Each row: the opaque rivalry id, the opponent view,
-- the state from THIS side, the current period's record and streak. Never the
-- opponent's id, email, rating, rank or XP.
create or replace function public.rivalry_list(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_json order by ord desc), '[]'::jsonb) from (
    select
      coalesce(r.updated_at, r.created_at) as ord,
      jsonb_build_object(
        'rivalryId', r.id,
        'contractVersion', r.contract_version,
        'state', case when r.state = 'pending' and r.pending_expires_at <= now() then 'idle' else r.state end,
        'pendingFromMe', r.state = 'pending' and r.pending_expires_at > now() and r.pending_from = p_user,
        'pendingExpiresAt', case when r.state = 'pending' and r.pending_expires_at > now() then r.pending_expires_at end,
        'lastClosedReason', case when r.state = 'pending' and r.pending_expires_at <= now() then 'expired' else r.last_closed_reason end,
        'lastClosedAt', r.last_closed_at,
        'blockedByMe', exists (select 1 from public.rivalry_blocks b where b.blocker_user_id = p_user and b.blocked_user_id = case when r.user_low = p_user then r.user_high else r.user_low end),
        'opponent', public.rivalry_opponent_view(case when r.user_low = p_user then r.user_high else r.user_low end, case when r.user_low = p_user then r.high_deleted else r.low_deleted end),
        'period', case when r.current_period_id is null then null else jsonb_build_object(
            'periodNo', (select period_no from public.rivalry_periods where id = r.current_period_id),
            'startedAt', (select started_at from public.rivalry_periods where id = r.current_period_id),
            'record', public.rivalry_record(r.id, r.current_period_id, p_user)) end,
        'periods', (select count(*) from public.rivalry_periods p where p.rivalry_id = r.id)
      ) as row_json
    from public.rivalries r
    where (r.user_low = p_user or r.user_high = p_user)
  ) rows;
$$;
revoke execute on function public.rivalry_list(uuid) from public, anon, authenticated;

-- One Rivalry, for one of its members: every period with its record, one page
-- of events (completed_at desc, id desc), and the open Challenges between the
-- two since the current period began. Not a member → null (as for a guessed id).
create or replace function public.rivalry_detail(p_user uuid, p_rivalry_id uuid, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.rivalries; opp uuid; me_low boolean; out jsonb;
begin
  select * into r from public.rivalries where id = p_rivalry_id;
  if r.id is null or (p_user <> r.user_low and p_user <> r.user_high) then return null; end if;
  opp := case when p_user = r.user_low then r.user_high else r.user_low end;
  me_low := p_user = r.user_low;
  out := jsonb_build_object(
    'rivalryId', r.id,
    'contractVersion', r.contract_version,
    'state', case when r.state = 'pending' and r.pending_expires_at <= now() then 'idle' else r.state end,
    'pendingFromMe', r.state = 'pending' and r.pending_expires_at > now() and r.pending_from = p_user,
    'pendingExpiresAt', case when r.state = 'pending' and r.pending_expires_at > now() then r.pending_expires_at end,
    'lastClosedReason', case when r.state = 'pending' and r.pending_expires_at <= now() then 'expired' else r.last_closed_reason end,
    'blockedByMe', exists (select 1 from public.rivalry_blocks b where b.blocker_user_id = p_user and b.blocked_user_id = opp),
    'opponent', public.rivalry_opponent_view(opp, case when me_low then r.high_deleted else r.low_deleted end),
    'currentPeriodId', r.current_period_id,
    'periods', (select coalesce(jsonb_agg(jsonb_build_object(
        'periodId', p.id, 'periodNo', p.period_no, 'startedAt', p.started_at, 'endedAt', p.ended_at, 'endReason', p.end_reason,
        'endedByMe', p.ended_by = p_user,
        'record', public.rivalry_record(r.id, p.id, p_user),
        'streak', (select count(*) from (
            select e.low_outcome, row_number() over (order by e.completed_at desc, e.id desc) as rn from public.rivalry_events e where e.period_id = p.id) s
            where s.rn < coalesce((select min(rn) from (
                select row_number() over (order by e2.completed_at desc, e2.id desc) as rn,
                       case when e2.low_outcome = 'tie' then 'tie' when me_low = (e2.low_outcome = 'win') then 'win' else 'loss' end as side
                  from public.rivalry_events e2 where e2.period_id = p.id) t where t.side <> 'win'), 1000000))
      ) order by p.period_no desc), '[]'::jsonb) from public.rivalry_periods p where p.rivalry_id = r.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
        'eventId', e.id, 'periodNo', p.period_no, 'completedAt', e.completed_at, 'rated', e.rated,
        'outcome', case when e.low_outcome = 'tie' then 'tie' when me_low = (e.low_outcome = 'win') then 'win' else 'loss' end,
        'code', ch.public_code,
        'iWasCreator', ch.creator_user_id = p_user,
        'myScore', case when ch.creator_user_id = p_user then jsonb_build_object('gold', ch.creator_gold_score, 'blue', ch.creator_blue_score) else jsonb_build_object('gold', at.gold_score, 'blue', at.blue_score) end,
        'theirScore', case when ch.creator_user_id = p_user then jsonb_build_object('gold', at.gold_score, 'blue', at.blue_score) else jsonb_build_object('gold', ch.creator_gold_score, 'blue', ch.creator_blue_score) end,
        'era', ch.creator_era_id
      ) order by e.completed_at desc, e.id desc), '[]'::jsonb)
      from (select * from public.rivalry_events e where e.rivalry_id = r.id order by e.completed_at desc, e.id desc limit least(greatest(1, p_limit), 50) offset greatest(0, p_offset)) e
      join public.rivalry_periods p on p.id = e.period_id
      join public.challenges ch on ch.id = e.challenge_id
      join public.challenge_attempts at on at.id = e.challenge_attempt_id),
    'eventCount', (select count(*) from public.rivalry_events e where e.rivalry_id = r.id),
    'pendingChallenges', case when r.current_period_id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object(
        'code', ch.public_code, 'mine', ch.creator_user_id = p_user, 'createdAt', ch.created_at, 'expiresAt', ch.expires_at,
        'started', exists (select 1 from public.challenge_attempts at where at.challenge_id = ch.id and at.user_id = case when ch.creator_user_id = p_user then opp else p_user end)
      ) order by ch.created_at desc), '[]'::jsonb)
      from public.challenges ch
      where ch.creator_user_id in (p_user, opp) and ch.status = 'open' and ch.revoked_at is null and ch.expires_at > now()
        and ch.created_at >= (select started_at from public.rivalry_periods where id = r.current_period_id)
        and not exists (select 1 from public.challenge_attempts at where at.challenge_id = ch.id and at.status = 'completed'
                          and at.user_id = case when ch.creator_user_id = p_user then opp else p_user end)) end
  );
  return out;
end $$;
revoke execute on function public.rivalry_detail(uuid, uuid, integer, integer) from public, anon, authenticated;

-- ── RLS and grants ───────────────────────────────────────────────────────────
-- Every table: RLS on, every client role revoked. Members may SELECT their own
-- pair, periods and events directly (the account export reads them under RLS);
-- blocks and the request log are server-only. No client role may write.
alter table public.rivalries           enable row level security;
alter table public.rivalry_periods     enable row level security;
alter table public.rivalry_blocks      enable row level security;
alter table public.rivalry_request_log enable row level security;
alter table public.rivalry_events      enable row level security;
revoke all on public.rivalries           from anon, authenticated;
revoke all on public.rivalry_periods     from anon, authenticated;
revoke all on public.rivalry_blocks      from anon, authenticated;
revoke all on public.rivalry_request_log from anon, authenticated;
revoke all on public.rivalry_events      from anon, authenticated;
grant select on public.rivalries       to authenticated;
grant select on public.rivalry_periods to authenticated;
grant select on public.rivalry_events  to authenticated;
drop policy if exists rivalries_select_member on public.rivalries;
create policy rivalries_select_member on public.rivalries
  for select to authenticated using (user_low = auth.uid() or user_high = auth.uid());
drop policy if exists rivalry_periods_select_member on public.rivalry_periods;
create policy rivalry_periods_select_member on public.rivalry_periods
  for select to authenticated using (exists (select 1 from public.rivalries r where r.id = rivalry_id and (r.user_low = auth.uid() or r.user_high = auth.uid())));
drop policy if exists rivalry_events_select_member on public.rivalry_events;
create policy rivalry_events_select_member on public.rivalry_events
  for select to authenticated using (exists (select 1 from public.rivalries r where r.id = rivalry_id and (r.user_low = auth.uid() or r.user_high = auth.uid())));
-- rivalry_blocks and rivalry_request_log: no policy, no grant, by design.

insert into public.schema_migrations (version) values ('0008_rivalries_v1') on conflict do nothing;

-- END 0008_rivalries_v1.sql

-- SEPARATE SAVED-ROW REPAIR: FIRST run ONLY its read-only audit SELECT.
-- Review recoverable/null/mismatch totals before selecting and executing the write block.
-- RELEASE-BUNDLE REPAIR v2 (2026-10-02), source review only; NOT executed here.
-- Deliberate divergence from supabase/repairs/2026-09-24-saved-clash-fields.sql:
-- use one shared field-recovery plan for audit/update; guard every UPDATE by
-- IS DISTINCT FROM; retain non-null values, IDs/order/other JSON keys; safely
-- skip malformed arrays and unavailable/blank names or unrecognized positions.
-- Partial candidate tuples are filled only from a complete, consistent source.
-- Original inherited repair file/generator and migrations0001-0008 stay unchanged.

-- READ-ONLY BEFORE AUDIT: select this statement alone before any backup/repair.
-- *_recoverable counts describe the exact plan. Raw *_missing may remain if a
-- source cannot recover it. saved_total and production-engine nulls are not defects.
with coach_catalog(id,name) as (values
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
), normalized as (
  select sc.*,
    case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end as gold_array,
    case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end as blue_array,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,gold}') = 'array' then sc.result_snapshot#>'{v3,fullBox,gold}' else '[]'::jsonb end as gold_box,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,blue}') = 'array' then sc.result_snapshot#>'{v3,fullBox,blue}' else '[]'::jsonb end as blue_box,
    (jsonb_typeof(sc.gold_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as gold_valid,
    (jsonb_typeof(sc.blue_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as blue_valid
  from public.saved_clashes sc
), sources as (
  select n.*,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'candidateId') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'candidateId'),'') is not null then left(n.result_snapshot->'candidate'->>'candidateId', 40) end as source_candidate_id,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'possessionCalibrationVersion') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'possessionCalibrationVersion'),'') is not null then left(n.result_snapshot->'candidate'->>'possessionCalibrationVersion', 20) end as source_calibration,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'coreHash') = 'string'
              and n.result_snapshot->'candidate'->>'coreHash' ~ '^[a-fA-F0-9]{64}$'
         then n.result_snapshot->'candidate'->>'coreHash' end as source_core_hash
  from normalized n
), eligible as (
  select s.*,
    (s.result_snapshot->>'preview' = 'true' and s.source_candidate_id is not null and (
      (s.candidate_id is null and s.calibration_version is null and s.candidate_core_hash is null)
      or (s.source_calibration is not null and s.source_core_hash is not null
          and (s.candidate_id is null or s.candidate_id = s.source_candidate_id)
          and (s.calibration_version is null or s.calibration_version = s.source_calibration)
          and (s.candidate_core_hash is null or s.candidate_core_hash = s.source_core_hash))
    )) as identity_can_repair
  from sources s
), planned as (
  select p.*,
    case when p.identity_can_repair then coalesce(p.candidate_id,p.source_candidate_id) else p.candidate_id end as next_candidate_id,
    case when p.identity_can_repair then coalesce(p.calibration_version,p.source_calibration) else p.calibration_version end as next_calibration_version,
    case when p.identity_can_repair then coalesce(p.candidate_core_hash,p.source_core_hash) else p.candidate_core_hash end as next_candidate_core_hash,
    case when p.gold_coach is null and g.id is not null then jsonb_build_object('id',left(g.id,40),'name',left(g.name,40)) else p.gold_coach end as next_gold_coach,
    case when p.blue_coach is null and b.id is not null then jsonb_build_object('id',left(b.id,40),'name',left(b.name,40)) else p.blue_coach end as next_blue_coach,
    case when p.gold_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.gold_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.gold_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.gold_roster end as next_gold_roster,
    case when p.blue_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.blue_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.blue_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.blue_roster end as next_blue_roster
  from eligible p
  left join coach_catalog g on g.id = p.result_snapshot->'coachIds'->>'gold'
  left join coach_catalog b on b.id = p.result_snapshot->'coachIds'->>'blue'
)
select
  count(*) as saved_total,
  count(*) filter (where (candidate_id,calibration_version,candidate_core_hash,gold_coach,blue_coach,gold_roster,blue_roster)
      is distinct from (next_candidate_id,next_calibration_version,next_candidate_core_hash,next_gold_coach,next_blue_coach,next_gold_roster,next_blue_roster)) as repairable_saved_rows,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_id is null) as candidate_id_missing,
  count(*) filter (where result_snapshot->>'preview' = 'true' and calibration_version is null) as calibration_missing,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_core_hash is null) as core_hash_missing,
  count(*) filter (where candidate_id is null and next_candidate_id is not null) as candidate_missing_recoverable,
  count(*) filter (where (candidate_id,calibration_version,candidate_core_hash) is distinct from (next_candidate_id,next_calibration_version,next_candidate_core_hash)) as candidate_metadata_recoverable,
  count(*) filter (where result_snapshot->>'preview' = 'true' and (next_candidate_id is null or next_calibration_version is null or next_candidate_core_hash is null)) as candidate_metadata_remaining_after_plan,
  count(*) filter (where result_snapshot->>'preview' is distinct from 'true' and candidate_id is null) as candidate_null_production_engine,
  count(*) filter (where gold_coach is null and coalesce(result_snapshot->'coachIds'->>'gold','neutral') <> 'neutral') as gold_coach_missing,
  count(*) filter (where blue_coach is null and coalesce(result_snapshot->'coachIds'->>'blue','neutral') <> 'neutral') as blue_coach_missing,
  count(*) filter (where gold_coach is distinct from next_gold_coach) as gold_coach_recoverable,
  count(*) filter (where blue_coach is distinct from next_blue_coach) as blue_coach_recoverable,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_array) e where e->>'name' is null)) as gold_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_array) e where e->>'name' is null)) as blue_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_array) e where e->>'pos' is null)) as gold_positions_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_array) e where e->>'pos' is null)) as blue_positions_missing,
  count(*) filter (where gold_roster is distinct from next_gold_roster) as gold_roster_recoverable,
  count(*) filter (where blue_roster is distinct from next_blue_roster) as blue_roster_recoverable,
  count(*) filter (where not gold_valid) as gold_roster_invalid_shape,
  count(*) filter (where not blue_valid) as blue_roster_invalid_shape,
  count(*) filter (where (candidate_id is not null and source_candidate_id is not null and candidate_id is distinct from source_candidate_id)
    or (calibration_version is not null and source_calibration is not null and calibration_version is distinct from source_calibration)
    or (candidate_core_hash is not null and source_core_hash is not null and candidate_core_hash is distinct from source_core_hash)) as candidate_metadata_mismatch,
  count(*) filter (where gold_coach is not null and result_snapshot->'coachIds'->>'gold' is not null and gold_coach->>'id' is distinct from result_snapshot->'coachIds'->>'gold') as gold_coach_mismatch,
  count(*) filter (where blue_coach is not null and result_snapshot->'coachIds'->>'blue' is not null and blue_coach->>'id' is distinct from result_snapshot->'coachIds'->>'blue') as blue_coach_mismatch
from planned;

-- PRIVATE BACKUP: create once, preserve the first v2 pre-repair snapshot.
create schema if not exists ops_backup;
revoke all on schema ops_backup from public, anon, authenticated;
create table if not exists ops_backup.saved_clashes_20261002_v2 as table public.saved_clashes;
revoke all on ops_backup.saved_clashes_20261002_v2 from public, anon, authenticated;
create table if not exists ops_backup.repair_log (
  id bigserial primary key, repair text not null, ran_at timestamptz not null default now(),
  before jsonb not null, after jsonb not null);
revoke all on ops_backup.repair_log from public, anon, authenticated;

-- REPAIR TRANSACTION: the owner reviews before counts and preserves this block.
begin;
create temporary table _before on commit drop as
with coach_catalog(id,name) as (values
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
), normalized as (
  select sc.*,
    case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end as gold_array,
    case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end as blue_array,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,gold}') = 'array' then sc.result_snapshot#>'{v3,fullBox,gold}' else '[]'::jsonb end as gold_box,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,blue}') = 'array' then sc.result_snapshot#>'{v3,fullBox,blue}' else '[]'::jsonb end as blue_box,
    (jsonb_typeof(sc.gold_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as gold_valid,
    (jsonb_typeof(sc.blue_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as blue_valid
  from public.saved_clashes sc
), sources as (
  select n.*,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'candidateId') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'candidateId'),'') is not null then left(n.result_snapshot->'candidate'->>'candidateId', 40) end as source_candidate_id,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'possessionCalibrationVersion') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'possessionCalibrationVersion'),'') is not null then left(n.result_snapshot->'candidate'->>'possessionCalibrationVersion', 20) end as source_calibration,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'coreHash') = 'string'
              and n.result_snapshot->'candidate'->>'coreHash' ~ '^[a-fA-F0-9]{64}$'
         then n.result_snapshot->'candidate'->>'coreHash' end as source_core_hash
  from normalized n
), eligible as (
  select s.*,
    (s.result_snapshot->>'preview' = 'true' and s.source_candidate_id is not null and (
      (s.candidate_id is null and s.calibration_version is null and s.candidate_core_hash is null)
      or (s.source_calibration is not null and s.source_core_hash is not null
          and (s.candidate_id is null or s.candidate_id = s.source_candidate_id)
          and (s.calibration_version is null or s.calibration_version = s.source_calibration)
          and (s.candidate_core_hash is null or s.candidate_core_hash = s.source_core_hash))
    )) as identity_can_repair
  from sources s
), planned as (
  select p.*,
    case when p.identity_can_repair then coalesce(p.candidate_id,p.source_candidate_id) else p.candidate_id end as next_candidate_id,
    case when p.identity_can_repair then coalesce(p.calibration_version,p.source_calibration) else p.calibration_version end as next_calibration_version,
    case when p.identity_can_repair then coalesce(p.candidate_core_hash,p.source_core_hash) else p.candidate_core_hash end as next_candidate_core_hash,
    case when p.gold_coach is null and g.id is not null then jsonb_build_object('id',left(g.id,40),'name',left(g.name,40)) else p.gold_coach end as next_gold_coach,
    case when p.blue_coach is null and b.id is not null then jsonb_build_object('id',left(b.id,40),'name',left(b.name,40)) else p.blue_coach end as next_blue_coach,
    case when p.gold_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.gold_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.gold_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.gold_roster end as next_gold_roster,
    case when p.blue_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.blue_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.blue_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.blue_roster end as next_blue_roster
  from eligible p
  left join coach_catalog g on g.id = p.result_snapshot->'coachIds'->>'gold'
  left join coach_catalog b on b.id = p.result_snapshot->'coachIds'->>'blue'
)
select
  count(*) as saved_total,
  count(*) filter (where (candidate_id,calibration_version,candidate_core_hash,gold_coach,blue_coach,gold_roster,blue_roster)
      is distinct from (next_candidate_id,next_calibration_version,next_candidate_core_hash,next_gold_coach,next_blue_coach,next_gold_roster,next_blue_roster)) as repairable_saved_rows,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_id is null) as candidate_id_missing,
  count(*) filter (where result_snapshot->>'preview' = 'true' and calibration_version is null) as calibration_missing,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_core_hash is null) as core_hash_missing,
  count(*) filter (where candidate_id is null and next_candidate_id is not null) as candidate_missing_recoverable,
  count(*) filter (where (candidate_id,calibration_version,candidate_core_hash) is distinct from (next_candidate_id,next_calibration_version,next_candidate_core_hash)) as candidate_metadata_recoverable,
  count(*) filter (where result_snapshot->>'preview' = 'true' and (next_candidate_id is null or next_calibration_version is null or next_candidate_core_hash is null)) as candidate_metadata_remaining_after_plan,
  count(*) filter (where result_snapshot->>'preview' is distinct from 'true' and candidate_id is null) as candidate_null_production_engine,
  count(*) filter (where gold_coach is null and coalesce(result_snapshot->'coachIds'->>'gold','neutral') <> 'neutral') as gold_coach_missing,
  count(*) filter (where blue_coach is null and coalesce(result_snapshot->'coachIds'->>'blue','neutral') <> 'neutral') as blue_coach_missing,
  count(*) filter (where gold_coach is distinct from next_gold_coach) as gold_coach_recoverable,
  count(*) filter (where blue_coach is distinct from next_blue_coach) as blue_coach_recoverable,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_array) e where e->>'name' is null)) as gold_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_array) e where e->>'name' is null)) as blue_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_array) e where e->>'pos' is null)) as gold_positions_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_array) e where e->>'pos' is null)) as blue_positions_missing,
  count(*) filter (where gold_roster is distinct from next_gold_roster) as gold_roster_recoverable,
  count(*) filter (where blue_roster is distinct from next_blue_roster) as blue_roster_recoverable,
  count(*) filter (where not gold_valid) as gold_roster_invalid_shape,
  count(*) filter (where not blue_valid) as blue_roster_invalid_shape,
  count(*) filter (where (candidate_id is not null and source_candidate_id is not null and candidate_id is distinct from source_candidate_id)
    or (calibration_version is not null and source_calibration is not null and calibration_version is distinct from source_calibration)
    or (candidate_core_hash is not null and source_core_hash is not null and candidate_core_hash is distinct from source_core_hash)) as candidate_metadata_mismatch,
  count(*) filter (where gold_coach is not null and result_snapshot->'coachIds'->>'gold' is not null and gold_coach->>'id' is distinct from result_snapshot->'coachIds'->>'gold') as gold_coach_mismatch,
  count(*) filter (where blue_coach is not null and result_snapshot->'coachIds'->>'blue' is not null and blue_coach->>'id' is distinct from result_snapshot->'coachIds'->>'blue') as blue_coach_mismatch
from planned;
create temporary table _repair_plan on commit drop as
with coach_catalog(id,name) as (values
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
), normalized as (
  select sc.*,
    case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end as gold_array,
    case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end as blue_array,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,gold}') = 'array' then sc.result_snapshot#>'{v3,fullBox,gold}' else '[]'::jsonb end as gold_box,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,blue}') = 'array' then sc.result_snapshot#>'{v3,fullBox,blue}' else '[]'::jsonb end as blue_box,
    (jsonb_typeof(sc.gold_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as gold_valid,
    (jsonb_typeof(sc.blue_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as blue_valid
  from public.saved_clashes sc
), sources as (
  select n.*,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'candidateId') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'candidateId'),'') is not null then left(n.result_snapshot->'candidate'->>'candidateId', 40) end as source_candidate_id,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'possessionCalibrationVersion') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'possessionCalibrationVersion'),'') is not null then left(n.result_snapshot->'candidate'->>'possessionCalibrationVersion', 20) end as source_calibration,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'coreHash') = 'string'
              and n.result_snapshot->'candidate'->>'coreHash' ~ '^[a-fA-F0-9]{64}$'
         then n.result_snapshot->'candidate'->>'coreHash' end as source_core_hash
  from normalized n
), eligible as (
  select s.*,
    (s.result_snapshot->>'preview' = 'true' and s.source_candidate_id is not null and (
      (s.candidate_id is null and s.calibration_version is null and s.candidate_core_hash is null)
      or (s.source_calibration is not null and s.source_core_hash is not null
          and (s.candidate_id is null or s.candidate_id = s.source_candidate_id)
          and (s.calibration_version is null or s.calibration_version = s.source_calibration)
          and (s.candidate_core_hash is null or s.candidate_core_hash = s.source_core_hash))
    )) as identity_can_repair
  from sources s
), planned as (
  select p.*,
    case when p.identity_can_repair then coalesce(p.candidate_id,p.source_candidate_id) else p.candidate_id end as next_candidate_id,
    case when p.identity_can_repair then coalesce(p.calibration_version,p.source_calibration) else p.calibration_version end as next_calibration_version,
    case when p.identity_can_repair then coalesce(p.candidate_core_hash,p.source_core_hash) else p.candidate_core_hash end as next_candidate_core_hash,
    case when p.gold_coach is null and g.id is not null then jsonb_build_object('id',left(g.id,40),'name',left(g.name,40)) else p.gold_coach end as next_gold_coach,
    case when p.blue_coach is null and b.id is not null then jsonb_build_object('id',left(b.id,40),'name',left(b.name,40)) else p.blue_coach end as next_blue_coach,
    case when p.gold_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.gold_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.gold_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.gold_roster end as next_gold_roster,
    case when p.blue_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.blue_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.blue_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.blue_roster end as next_blue_roster
  from eligible p
  left join coach_catalog g on g.id = p.result_snapshot->'coachIds'->>'gold'
  left join coach_catalog b on b.id = p.result_snapshot->'coachIds'->>'blue'
)
select * from planned;

update public.saved_clashes sc set
  candidate_id=p.next_candidate_id, calibration_version=p.next_calibration_version, candidate_core_hash=p.next_candidate_core_hash
from _repair_plan p where sc.id=p.id
  and (sc.candidate_id,sc.calibration_version,sc.candidate_core_hash) is not distinct from (p.candidate_id,p.calibration_version,p.candidate_core_hash)
  and (sc.candidate_id,sc.calibration_version,sc.candidate_core_hash) is distinct from (p.next_candidate_id,p.next_calibration_version,p.next_candidate_core_hash);
update public.saved_clashes sc set gold_coach=p.next_gold_coach
from _repair_plan p where sc.id=p.id and sc.gold_coach is null and sc.gold_coach is distinct from p.next_gold_coach;
update public.saved_clashes sc set blue_coach=p.next_blue_coach
from _repair_plan p where sc.id=p.id and sc.blue_coach is null and sc.blue_coach is distinct from p.next_blue_coach;
update public.saved_clashes sc set gold_roster=p.next_gold_roster
from _repair_plan p where sc.id=p.id and sc.gold_roster is not distinct from p.gold_roster and sc.gold_roster is distinct from p.next_gold_roster;
update public.saved_clashes sc set blue_roster=p.next_blue_roster
from _repair_plan p where sc.id=p.id and sc.blue_roster is not distinct from p.blue_roster and sc.blue_roster is distinct from p.next_blue_roster;

with coach_catalog(id,name) as (values
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
), normalized as (
  select sc.*,
    case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end as gold_array,
    case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end as blue_array,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,gold}') = 'array' then sc.result_snapshot#>'{v3,fullBox,gold}' else '[]'::jsonb end as gold_box,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,blue}') = 'array' then sc.result_snapshot#>'{v3,fullBox,blue}' else '[]'::jsonb end as blue_box,
    (jsonb_typeof(sc.gold_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as gold_valid,
    (jsonb_typeof(sc.blue_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as blue_valid
  from public.saved_clashes sc
), sources as (
  select n.*,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'candidateId') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'candidateId'),'') is not null then left(n.result_snapshot->'candidate'->>'candidateId', 40) end as source_candidate_id,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'possessionCalibrationVersion') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'possessionCalibrationVersion'),'') is not null then left(n.result_snapshot->'candidate'->>'possessionCalibrationVersion', 20) end as source_calibration,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'coreHash') = 'string'
              and n.result_snapshot->'candidate'->>'coreHash' ~ '^[a-fA-F0-9]{64}$'
         then n.result_snapshot->'candidate'->>'coreHash' end as source_core_hash
  from normalized n
), eligible as (
  select s.*,
    (s.result_snapshot->>'preview' = 'true' and s.source_candidate_id is not null and (
      (s.candidate_id is null and s.calibration_version is null and s.candidate_core_hash is null)
      or (s.source_calibration is not null and s.source_core_hash is not null
          and (s.candidate_id is null or s.candidate_id = s.source_candidate_id)
          and (s.calibration_version is null or s.calibration_version = s.source_calibration)
          and (s.candidate_core_hash is null or s.candidate_core_hash = s.source_core_hash))
    )) as identity_can_repair
  from sources s
), planned as (
  select p.*,
    case when p.identity_can_repair then coalesce(p.candidate_id,p.source_candidate_id) else p.candidate_id end as next_candidate_id,
    case when p.identity_can_repair then coalesce(p.calibration_version,p.source_calibration) else p.calibration_version end as next_calibration_version,
    case when p.identity_can_repair then coalesce(p.candidate_core_hash,p.source_core_hash) else p.candidate_core_hash end as next_candidate_core_hash,
    case when p.gold_coach is null and g.id is not null then jsonb_build_object('id',left(g.id,40),'name',left(g.name,40)) else p.gold_coach end as next_gold_coach,
    case when p.blue_coach is null and b.id is not null then jsonb_build_object('id',left(b.id,40),'name',left(b.name,40)) else p.blue_coach end as next_blue_coach,
    case when p.gold_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.gold_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.gold_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.gold_roster end as next_gold_roster,
    case when p.blue_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.blue_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.blue_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.blue_roster end as next_blue_roster
  from eligible p
  left join coach_catalog g on g.id = p.result_snapshot->'coachIds'->>'gold'
  left join coach_catalog b on b.id = p.result_snapshot->'coachIds'->>'blue'
), audited as (
select
  count(*) as saved_total,
  count(*) filter (where (candidate_id,calibration_version,candidate_core_hash,gold_coach,blue_coach,gold_roster,blue_roster)
      is distinct from (next_candidate_id,next_calibration_version,next_candidate_core_hash,next_gold_coach,next_blue_coach,next_gold_roster,next_blue_roster)) as repairable_saved_rows,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_id is null) as candidate_id_missing,
  count(*) filter (where result_snapshot->>'preview' = 'true' and calibration_version is null) as calibration_missing,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_core_hash is null) as core_hash_missing,
  count(*) filter (where candidate_id is null and next_candidate_id is not null) as candidate_missing_recoverable,
  count(*) filter (where (candidate_id,calibration_version,candidate_core_hash) is distinct from (next_candidate_id,next_calibration_version,next_candidate_core_hash)) as candidate_metadata_recoverable,
  count(*) filter (where result_snapshot->>'preview' = 'true' and (next_candidate_id is null or next_calibration_version is null or next_candidate_core_hash is null)) as candidate_metadata_remaining_after_plan,
  count(*) filter (where result_snapshot->>'preview' is distinct from 'true' and candidate_id is null) as candidate_null_production_engine,
  count(*) filter (where gold_coach is null and coalesce(result_snapshot->'coachIds'->>'gold','neutral') <> 'neutral') as gold_coach_missing,
  count(*) filter (where blue_coach is null and coalesce(result_snapshot->'coachIds'->>'blue','neutral') <> 'neutral') as blue_coach_missing,
  count(*) filter (where gold_coach is distinct from next_gold_coach) as gold_coach_recoverable,
  count(*) filter (where blue_coach is distinct from next_blue_coach) as blue_coach_recoverable,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_array) e where e->>'name' is null)) as gold_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_array) e where e->>'name' is null)) as blue_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_array) e where e->>'pos' is null)) as gold_positions_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_array) e where e->>'pos' is null)) as blue_positions_missing,
  count(*) filter (where gold_roster is distinct from next_gold_roster) as gold_roster_recoverable,
  count(*) filter (where blue_roster is distinct from next_blue_roster) as blue_roster_recoverable,
  count(*) filter (where not gold_valid) as gold_roster_invalid_shape,
  count(*) filter (where not blue_valid) as blue_roster_invalid_shape,
  count(*) filter (where (candidate_id is not null and source_candidate_id is not null and candidate_id is distinct from source_candidate_id)
    or (calibration_version is not null and source_calibration is not null and calibration_version is distinct from source_calibration)
    or (candidate_core_hash is not null and source_core_hash is not null and candidate_core_hash is distinct from source_core_hash)) as candidate_metadata_mismatch,
  count(*) filter (where gold_coach is not null and result_snapshot->'coachIds'->>'gold' is not null and gold_coach->>'id' is distinct from result_snapshot->'coachIds'->>'gold') as gold_coach_mismatch,
  count(*) filter (where blue_coach is not null and result_snapshot->'coachIds'->>'blue' is not null and blue_coach->>'id' is distinct from result_snapshot->'coachIds'->>'blue') as blue_coach_mismatch
from planned
)
insert into ops_backup.repair_log (repair,before,after)
select 'saved-clash-fields-2026-10-02-idempotent-v2',(select to_jsonb(b) from _before b),to_jsonb(a) from audited a;
commit;

-- READ-ONLY AFTER AUDIT: saved_total unchanged; exact recoverable counts reach0.
-- Raw missing/invalid/mismatch values may remain for manual review; never guess.
-- Rerunning the repair updates0 saved rows if no new recoverable rows arrived;
-- its private audit log intentionally adds one observation per successful run.
with coach_catalog(id,name) as (values
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
), normalized as (
  select sc.*,
    case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end as gold_array,
    case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end as blue_array,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,gold}') = 'array' then sc.result_snapshot#>'{v3,fullBox,gold}' else '[]'::jsonb end as gold_box,
    case when jsonb_typeof(sc.result_snapshot#>'{v3,fullBox,blue}') = 'array' then sc.result_snapshot#>'{v3,fullBox,blue}' else '[]'::jsonb end as blue_box,
    (jsonb_typeof(sc.gold_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.gold_roster) = 'array' then sc.gold_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as gold_valid,
    (jsonb_typeof(sc.blue_roster) = 'array' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(sc.blue_roster) = 'array' then sc.blue_roster else '[]'::jsonb end) e where jsonb_typeof(e) <> 'object')) as blue_valid
  from public.saved_clashes sc
), sources as (
  select n.*,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'candidateId') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'candidateId'),'') is not null then left(n.result_snapshot->'candidate'->>'candidateId', 40) end as source_candidate_id,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'possessionCalibrationVersion') = 'string' and nullif(btrim(n.result_snapshot->'candidate'->>'possessionCalibrationVersion'),'') is not null then left(n.result_snapshot->'candidate'->>'possessionCalibrationVersion', 20) end as source_calibration,
    case when jsonb_typeof(n.result_snapshot->'candidate'->'coreHash') = 'string'
              and n.result_snapshot->'candidate'->>'coreHash' ~ '^[a-fA-F0-9]{64}$'
         then n.result_snapshot->'candidate'->>'coreHash' end as source_core_hash
  from normalized n
), eligible as (
  select s.*,
    (s.result_snapshot->>'preview' = 'true' and s.source_candidate_id is not null and (
      (s.candidate_id is null and s.calibration_version is null and s.candidate_core_hash is null)
      or (s.source_calibration is not null and s.source_core_hash is not null
          and (s.candidate_id is null or s.candidate_id = s.source_candidate_id)
          and (s.calibration_version is null or s.calibration_version = s.source_calibration)
          and (s.candidate_core_hash is null or s.candidate_core_hash = s.source_core_hash))
    )) as identity_can_repair
  from sources s
), planned as (
  select p.*,
    case when p.identity_can_repair then coalesce(p.candidate_id,p.source_candidate_id) else p.candidate_id end as next_candidate_id,
    case when p.identity_can_repair then coalesce(p.calibration_version,p.source_calibration) else p.calibration_version end as next_calibration_version,
    case when p.identity_can_repair then coalesce(p.candidate_core_hash,p.source_core_hash) else p.candidate_core_hash end as next_candidate_core_hash,
    case when p.gold_coach is null and g.id is not null then jsonb_build_object('id',left(g.id,40),'name',left(g.name,40)) else p.gold_coach end as next_gold_coach,
    case when p.blue_coach is null and b.id is not null then jsonb_build_object('id',left(b.id,40),'name',left(b.name,40)) else p.blue_coach end as next_blue_coach,
    case when p.gold_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.gold_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.gold_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.gold_roster end as next_gold_roster,
    case when p.blue_valid then (
    select coalesce(jsonb_agg(
      e || case when e->>'name' is null and jsonb_typeof(b->'name') = 'string' and nullif(btrim(b->>'name'),'') is not null
                then jsonb_build_object('name',left(b->>'name',40)) else '{}'::jsonb end
        || case when e->>'pos' is null and jsonb_typeof(b->'pos') = 'string' and b->>'pos' in ('PG','SG','SF','PF','C')
                then jsonb_build_object('pos',b->>'pos') else '{}'::jsonb end
      order by ord),'[]'::jsonb)
    from jsonb_array_elements(p.blue_array) with ordinality as roster(e,ord)
    left join lateral (
      select value as b from jsonb_array_elements(p.blue_box) with ordinality as lines(value,line_order)
      where jsonb_typeof(value) = 'object' and value->>'id' = e->>'id' order by line_order limit 1
    ) box on true
  ) else p.blue_roster end as next_blue_roster
  from eligible p
  left join coach_catalog g on g.id = p.result_snapshot->'coachIds'->>'gold'
  left join coach_catalog b on b.id = p.result_snapshot->'coachIds'->>'blue'
)
select
  count(*) as saved_total,
  count(*) filter (where (candidate_id,calibration_version,candidate_core_hash,gold_coach,blue_coach,gold_roster,blue_roster)
      is distinct from (next_candidate_id,next_calibration_version,next_candidate_core_hash,next_gold_coach,next_blue_coach,next_gold_roster,next_blue_roster)) as repairable_saved_rows,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_id is null) as candidate_id_missing,
  count(*) filter (where result_snapshot->>'preview' = 'true' and calibration_version is null) as calibration_missing,
  count(*) filter (where result_snapshot->>'preview' = 'true' and candidate_core_hash is null) as core_hash_missing,
  count(*) filter (where candidate_id is null and next_candidate_id is not null) as candidate_missing_recoverable,
  count(*) filter (where (candidate_id,calibration_version,candidate_core_hash) is distinct from (next_candidate_id,next_calibration_version,next_candidate_core_hash)) as candidate_metadata_recoverable,
  count(*) filter (where result_snapshot->>'preview' = 'true' and (next_candidate_id is null or next_calibration_version is null or next_candidate_core_hash is null)) as candidate_metadata_remaining_after_plan,
  count(*) filter (where result_snapshot->>'preview' is distinct from 'true' and candidate_id is null) as candidate_null_production_engine,
  count(*) filter (where gold_coach is null and coalesce(result_snapshot->'coachIds'->>'gold','neutral') <> 'neutral') as gold_coach_missing,
  count(*) filter (where blue_coach is null and coalesce(result_snapshot->'coachIds'->>'blue','neutral') <> 'neutral') as blue_coach_missing,
  count(*) filter (where gold_coach is distinct from next_gold_coach) as gold_coach_recoverable,
  count(*) filter (where blue_coach is distinct from next_blue_coach) as blue_coach_recoverable,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_array) e where e->>'name' is null)) as gold_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_array) e where e->>'name' is null)) as blue_names_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(gold_array) e where e->>'pos' is null)) as gold_positions_missing,
  count(*) filter (where exists (select 1 from jsonb_array_elements(blue_array) e where e->>'pos' is null)) as blue_positions_missing,
  count(*) filter (where gold_roster is distinct from next_gold_roster) as gold_roster_recoverable,
  count(*) filter (where blue_roster is distinct from next_blue_roster) as blue_roster_recoverable,
  count(*) filter (where not gold_valid) as gold_roster_invalid_shape,
  count(*) filter (where not blue_valid) as blue_roster_invalid_shape,
  count(*) filter (where (candidate_id is not null and source_candidate_id is not null and candidate_id is distinct from source_candidate_id)
    or (calibration_version is not null and source_calibration is not null and calibration_version is distinct from source_calibration)
    or (candidate_core_hash is not null and source_core_hash is not null and candidate_core_hash is distinct from source_core_hash)) as candidate_metadata_mismatch,
  count(*) filter (where gold_coach is not null and result_snapshot->'coachIds'->>'gold' is not null and gold_coach->>'id' is distinct from result_snapshot->'coachIds'->>'gold') as gold_coach_mismatch,
  count(*) filter (where blue_coach is not null and result_snapshot->'coachIds'->>'blue' is not null and blue_coach->>'id' is distinct from result_snapshot->'coachIds'->>'blue') as blue_coach_mismatch
from planned;

-- VERIFICATION: expect all8 migration versions and all21 public tables (20 user-data plus schema_migrations) RLS enabled.
select version from public.schema_migrations order by version;
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('schema_migrations','profiles','saved_clashes','result_claims','saved_rosters','user_preferences','challenges','challenge_secrets','challenge_attempts','progression_profiles','xp_ledger','achievement_unlocks','competitive_profiles','competitive_rating_events','public_profiles','profile_featured_achievements','rivalries','rivalry_periods','rivalry_blocks','rivalry_request_log','rivalry_events') order by tablename;
-- Exact plan-recoverable counts should reach0; raw missing/invalid/mismatch counts may remain.
-- Preserve production-engine null identity and irrecoverable rows; never guess.
-- A second repair should alter0 saved rows; its private audit log adds one truthful observation.
