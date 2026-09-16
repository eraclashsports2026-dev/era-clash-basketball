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
