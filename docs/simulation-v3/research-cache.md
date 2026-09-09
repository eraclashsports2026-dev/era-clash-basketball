# Research cache

Build-time only. Never imported by the app, never served to a user.

## Structure

```
.cache/research/          ← GIT-IGNORED
├── players/
├── coaches/
├── eras/
└── sources/
```

## Commands

```bash
npm run research:coaches                          # cache-first over the manifest
npm run research:coaches -- --limit=5
npm run research:refresh -- --coach=phil-jackson  # force ONE subject
npm run research:eras                             # infrastructure ready, manifest empty
```

## Why cache at all

Researching ~30 coaches across multiple sources means hundreds of network reads.
Without a cache, every re-run refetches unchanged pages — slow, rude to the
sources, and **non-reproducible**, because a run in March and a run in June
silently disagree. The content hash pins exactly which bytes a fact came from.

## Record shape

Every source entry carries: `url` · `title` · `publisher` · `sourceTier` ·
`httpStatus` · `retrievedAt` · `contentHash` · `contentBytes` · `parserVersion`
· `retrievalToolVersion` · `lastVerifiedAt` · `changedSinceLastFetch` ·
`usageNote`.

## Verification vocabulary

| State | Meaning |
| --- | --- |
| `UNVERIFIED` | no sources |
| `SOURCE_VERIFIED` | fetched from a listed source and hashed |
| `HUMAN_VERIFIED` | a person checked the extracted facts against that source |

These are **different claims** and the report keeps them apart — conflating them
would let an automated fetch masquerade as human review.

## Copyright policy

The raw fetched body is written under `.cache/`, which is **git-ignored**.

**Committed:** structured extracted facts · source URLs · citations · content
hashes · retrieval timestamps · verification state · research conclusions.

**Never committed:** full third-party article text · scraped HTML archives ·
copyrighted images · unnecessary raw source pages.

The content hash is what makes this both safe and useful: it proves which bytes
a fact came from **without redistributing those bytes**.

The runner reads the Wikipedia REST *summary* endpoint (clean JSON, lead extract
capped at 1,200 characters) rather than scraping article HTML — deliberate, since
re-parsing markup after every upstream change would make research irreproducible.

## Fetcher injection

`retrieveSource` takes an injectable `fetcher`. Tests exercise cache behaviour
without network access, and a run can be replayed offline.

## Era research

Infrastructure is shared and ready; `ERA_SOURCES` is **intentionally empty**.
Era Style Intelligence is Phase 5, and populating era profiles now would mean
inventing them. The command reports that honestly.
