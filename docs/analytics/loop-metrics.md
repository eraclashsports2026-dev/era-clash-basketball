# Loop metrics contract1.0.0

Last updated10-02-2026. The closed event list is in `src/loop/events.js` and the server allowlist is in `api/events.js`. No player names, emails, room IDs, raw account IDs, cookies, invitation codes, seeds, result snapshots or free text are accepted for these events. The first-party store retains raw events14days and counters400days. The browser ID is a random pseudonym; clearing storage resets it. Guest return rates therefore measure browser continuity, not verified people.

The existing `/api/events` sink is always attempted. Optional vendor order: an already available Vercel Web Analytics `window.va` event API; otherwise PostHog with `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST=https://us.i.posthog.com` or `https://eu.i.posthog.com`; otherwise vendor delivery is a no-op. No vendor is configured or verified in this session. A public PostHog project key is intended to ship to browsers; personal API keys and service-role credentials never are. Ad blockers or network failure can drop events and never block play. Vercel plan eligibility is unknown; do not claim its dashboard receives events.

Events: `game_completed`, `card_created`, `card_shared{channel}`, `card_opened{source}`, `rematch_started_from_card`, `guest_play_started`, `signup_completed`, `daily_attempted`, `daily_shared`, `mode_started{mode}`. Mode/channel/source values are closed enums. Publication creates `card_created` once per immutable owned result; opening a public card is anonymous. Sign-up completion denotes successful completion of the signup-intent UI, not independently proven net-new accounts.

For a chosen observation window, use the same filtered event population for each ratio:

| Number | Query / definition |
|---|---|
| Shares per completed game | count(card_shared) / count(game_completed) |
| Card taps per share | count(card_opened) / count(card_shared) |
| Plays per card tap | count(rematch_started_from_card) / count(card_opened); this is entry intent, not a completed rematch |
| Return | distinct browser IDs playing during elapsed day1 or day6 after their first observed play / distinct IDs with a first play. Report day2 and day7 separately. |

`loopNumbers(events)` implements these queries with `null` for unavailable denominators. The distribution multiplier is the product of the first three ratios. Completion conversion requires joining a later `game_completed` observation in the same browser; the current closed schema deliberately does not join hidden challenge IDs. Do not label rematch intent as completed-game conversion. For mature cohorts, exclude browsers whose day2/day7 observation windows are not yet complete; the pure helper reports raw observed rates and callers must apply cohort censoring.

First-party verification reads `an:counts:<YYYYMMDD>` and the14day raw log; inspect counters after each scripted event, then compute on the ingested log. Unit tests exercise all ten event arrivals and known return observations. Those are synthetic test measurements, not adoption, demand or production retention. In PostHog, select each named event in Insights, apply the same dates/modes, and create formulas using the definitions above. In Vercel, use only dashboard features actually available to the account; if cohort queries are unavailable, use the documented first-party export or PostHog. Never collect extra identity to fill a dashboard limitation.

Known coverage limit: the new Loop routes and public cards have named events. Older modes retain their existing telemetry; additive generic completion and signup hooks are verified separately. Live production arrival, real email signup and mature7day cohorts remain unverified.
