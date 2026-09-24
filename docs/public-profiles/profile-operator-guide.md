# Profile operator guide (Phase 9F)

## Where things live

| Piece | Path |
| --- | --- |
| Pure contract (projection, slug, route, validation) | `src/profiles/contract.js` |
| Browser client and sharing | `src/profiles/client.js` |
| Server library | `api/_lib/profiles.js` (dispatched by `api/profile.js` — no new function) |
| Schema and database functions | `supabase/migrations/0007_public_competitive_profiles_v1.sql` |
| Player Card | `src/components/profiles/PlayerCard.jsx` |
| Public route page | `src/components/profiles/PublicProfilePage.jsx` |
| My EraClash module and featured picker | `src/components/profiles/` |
| Dev reference fixture (`/dev/profile-reference`) | `src/ui/profiles/ProfileReferenceFixture.jsx` |
| Gates | `scripts/profiles/profileQa.mjs` |
| Serial sweep | `scripts/profiles/phase9fSweep.sh` |
| Preservation, ledger and summary | `scripts/profiles/phase9fSummary.mjs` |

## Actions

All four live inside `api/profile.js`, because the serverless function budget
is full at 13.

| Action | Who | Notes |
| --- | --- | --- |
| `profile-public` | anyone **with the slug** | the only public read; a miss is indistinguishable from a private profile |
| `profile-board-links` | anyone | rank→slug for accounts already on the public Top 100 that opted in twice |
| `profile-me` | the account | its slug, both settings, its featured list, and what it may feature |
| `profile-featured-set` | the account | the database judges unlock state |

`profile_visibility` has **no action**: it is a preference, written through the
existing 9B.2 path under owner-only RLS. That is why a browser can only ever
change its own.

## Running the gates

The file-only and fake-cloud gates need nothing running:

```bash
npm run profile:contract-qa
npm run profile:identifier-qa
npm run profile:visibility-qa
npm run profile:projection-qa
npm run profile:featured-qa
npm run profile:provisional-qa
npm run profile:display-name-qa
npm run profile:deletion-qa
npm run profile:enumeration-qa
npm run profile:rls-qa
```

The rest need the fake-cloud harness on 4178 and, for the UI gates, the
fixtures harness on 4179. The sweep starts both, runs everything serially and
stops them again. Never run the vitest suite beside Playwright.

```bash
bash scripts/profiles/phase9fSweep.sh                       # local
bash scripts/profiles/phase9fSweep.sh https://<preview>     # plus deployed
```

## Reading a profile that looks wrong

1. `profile_public_get(slug)` is the whole public truth. Call it directly; if
   it returns no rows the profile is private, the slug is wrong, or the account
   is gone — and deliberately you cannot tell which.
2. A missing rating means the account is not placed. A missing rank means it is
   not placed *or* its leaderboard visibility is private. Both are correct.
3. `profile_owner_get(user_id)` is what the owner sees, including their
   provisional rating. Use it to check a "my profile looks empty" report.

## Applying the migration

Preview project `lfybiphmqkiecfrqsfzt` only; production has no cloud accounts
and must stay untouched. The migration is idempotent (`create or replace`,
`create table if not exists`, `drop policy if exists`, `on conflict do
nothing`), so re-applying it is the way to guarantee the live function bodies
match the committed file. Verify by comparing `md5(pg_proc.prosrc)` against the
body in the migration.

Note the 9E lesson: a table with a `BEFORE INSERT` trigger must never be seeded
with `on conflict … do nothing`, because the trigger fires before the conflict
is detected. `public_profiles` is seeded that way *safely* only because its
trigger is `BEFORE UPDATE` — there is no insert guard to mislead.

## What must never change

`PUBLIC_PROFILE_POWER_EFFECT` is 0. A public profile is identity; identity is
not basketball power. If a future phase wants profile state to affect a game,
that is a new methodology and needs a new version key — bumping `1.0.0` in
place would silently break the frozen policy hashes that pin it.

And there is no listing endpoint. If one is ever needed, it is a product
decision about discoverability, not a convenience for a component.
