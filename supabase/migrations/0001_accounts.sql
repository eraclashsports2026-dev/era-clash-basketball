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
