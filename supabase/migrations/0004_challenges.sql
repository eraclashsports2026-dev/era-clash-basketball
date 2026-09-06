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
