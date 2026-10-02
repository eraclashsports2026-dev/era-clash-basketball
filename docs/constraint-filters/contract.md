# Constraint filters contract

Version: 1.0.0 · Routes: `/clash/filters`, `/clash/one-franchise`, `/clash/one-per-era`, `/clash/no-mvps`.

One Franchise uses the thirty canonical franchise ids and documented playable pools in `src/loop/franchises.js`. Each pool combines existing card labels with the researched curated five. These are conservative proposals, not complete career-affiliation databases or franchise-specific statistical slices. New Orleans includes its historical Hornets identity; Chris Paul's 2000s card is excluded from Charlotte. A raw ambiguous `Hornets` label is refused for this mode. Every offered pool can fill all five eligible positions. Tag: `ONE_FRANCHISE`.

One Per Era requires five different canonical people and five different card decades, with legal PG / SG / SF / PF / C eligibility. The decade belongs to the card, not an invented birth-era rule. Tag: `ONE_PER_ERA`.

No MVPs excludes a person if any canonical card credits that person with an MVP. A non-MVP decade version of an MVP winner is excluded too. Awards are taken from the existing researched data without a new claim of completeness. Tag: `NO_MVPS`.

Salary Cap is explicitly unavailable because there is no defensible comparable salary table or normalization contract. The UI identifies the data required and creates no fabricated prices or inactive Play button. All implemented filters use the existing authoritative `play` operation, shared result reader and publication path. Tagged casual results do not establish competitive Elo.

Selection and validation tests cover each constraint and unsupported Salary Cap rejection. Protected engine/calibration unchanged. Mobile, crawler cards, server forgery checks, account features, and deployed availability require the actual three-run evidence.
