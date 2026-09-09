# Account deletion

Self-service, irreversible, and the one career action that goes through the
server — a browser cannot delete its own auth user under RLS.

## The flow

**Account → Delete my account** →

1. If the session is older than 30 minutes, the player is asked to sign in again
   first (`needsReauthentication`).
2. The consequences are listed plainly.
3. The player types `DELETE` to confirm.
4. A final button performs the deletion.

The client calls `/api/profile` with `action: "delete-account"` and the bearer
token. The server verifies the token, and deletes **only the token's own user**
— the request body cannot name someone else. Deletion uses the service-role
admin API and cascades: removing the `auth.users` row removes the profile, every
saved Clash, every saved roster, the preferences and the result claims, by
foreign-key `on delete cascade`.

## What is removed, and what is not

Removed: profile and display name, every saved Clash and report, every saved
roster, favorites, preferences, the private career record. Not reached:
anonymous usage measurements that were never tied to the account — gameplay
telemetry is keyed by an anonymous analytics session, never by an account, so it
is not account data.

## Safety

- One user can delete no account but their own (identity is the verified token).
- A stale or forged token fails verification and deletes nothing.
- Deletion is never a single click: it needs a fresh session and a typed phrase.

The cascade is verified against the live database with a synthetic user in
`data/validation/9b2/live-rls-qa.json`.
