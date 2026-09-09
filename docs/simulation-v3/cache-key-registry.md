# Cache-key registry

One builder: **`api/_lib/cacheKeys.js`**. Version segments come from
`src/versions.js`, never from a string typed at the call site.

## The rule

> A cache key must change when — and only when — the thing it names changes.

Too coarse and you serve a stale narrative after a prompt rewrite. Too fine and
you never hit at all.

## Namespaces

| Namespace | Versioned | Retention | Visibility |
| --- | --- | --- | --- |
| `result:` | no | **PERMANENT** — competitive records and history must not expire | public-safe |
| `idem:` | no | 24h | private |
| `narrative:` | **yes** (prompt, schema, provider, model) | permanent per identity | public-safe |
| `narrative-lock:` | **yes** | 75s (provider timeout + margin) | private |
| `teamintel:` | yes (TI, PI, player-data) | process memory by default | private |
| `coachfit:` | yes (CI, coach-data, TI, PI) | process memory by default | private |
| `era:` | yes | process memory by default | private |
| `daily:` | no | until rollover | mixed |
| `rl:` | no | one window | private |
| `circuit:` | no | 2× breaker window | private |
| `playercard:` | yes (design, player-data) | immutable per URL | public-safe |
| `research:` | yes | until content hash changes | build-time only |
| `share-image:` | yes (render) | immutable per configuration | public-safe |
| `public-result:` | yes (engine) | immutable | public-safe |

## Why some namespaces are deliberately UNVERSIONED

`result:`, `idem:`, `ch:`, `profile:`, `dl:` hold **live production data**.
Adding a version segment would not invalidate them — it would **orphan** them,
silently detaching every stored game, challenge, and profile from the product.

Those records already carry their versions **inside the payload**, which is the
right place for immutable data: the record explains itself, and the key just
finds it. Versioned keys are for **derived, regenerable** things where a miss
costs a recomputation rather than a lost record.

## Examples

```
result:abc123
narrative:p2-1:s1-0-0:anthropic:claude-sonnet-4-6:abc123
narrative-lock:p2-1:s1-0-0:anthropic:claude-sonnet-4-6:abc123
teamintel:v1-0-0:pi1-0-0:pd2026-08-24:6fd6eb03
playercard:d1-0-0:pd2026-08-24:dark:lg:curry-10s
public-result:e3-2-0:abc123
```

## Security

- Every segment is validated against `/^[A-Za-z0-9._-]{1,128}$/`. Anything else
  is **rejected**, not escaped — a cache key is not a place to be clever about
  sanitising user input.
- Keys never contain API keys, tokens, cookies, authorization headers, or email
  addresses.
- Session identifiers are truncated, never embedded whole.
- `isPublicSafe(key)` gates anything that may be served publicly.
- Building a key from a **PLANNED** version domain throws.

## The one deliberate cache reset

The narrative key changed from `narrative:{resultId}` to the versioned form.
Existing cached narratives become misses and regenerate once, at one provider
call each, the first time an old result is viewed.

That cost is accepted knowingly: the old key had **no prompt version**, so those
narratives were written by a prompt nobody can now identify. Serving unidentifiable
text forever is worse than one regeneration.
