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
