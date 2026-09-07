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
