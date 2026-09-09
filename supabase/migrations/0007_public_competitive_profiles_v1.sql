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
