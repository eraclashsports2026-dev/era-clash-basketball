# Probability seed separation

Three seed domains, mutually disjoint, verified at 4,096 seeds each.

| Domain | Master | Purpose |
|---|---|---|
| `actual-game` | `0x6c2c1a` | Games that are played and persisted |
| `prediction` | `0x6c2c1b` | Monte Carlo probability estimation |
| `probability-validation` | `0x6c2c1c` | Measuring whether those estimates hold |

## Why three and not two

The obvious separation is prediction from validation: if a probability is
measured against the same games that produced it, the measurement is arithmetic
rather than evidence, and it will report perfect calibration no matter how wrong
the estimator is.

The third separation is less obvious and equally necessary. If prediction seeds
overlapped `actual-game` seeds, a pre-game probability would contain the actual
game it precedes. The displayed number would be right for a reason that has
nothing to do with forecasting, and the error would be undetectable from the
outside because the number would look excellent.

## Construction

Domain masters are hashed rather than offset:

```js
const domainMaster = (master, domain) => {
  const h = createHash("sha256").update(`eraclash:${domain}:${master >>> 0}`).digest();
  return h.readInt32BE(0);
};
```

An additive offset (`master + 1`, `master + 2`) would place the domains in
adjacent regions of the same sequence, and adjacent regions of a weak PRNG can
correlate. Hashing the domain name into the master makes the three streams
independent by construction rather than by hope.

Disjointness is not assumed. `overlapBetween(a, b, n)` returns the actual
intersection, and a test asserts it is empty for all three pairs at 4,096 seeds —
comfortably above `INTERNAL_VALIDATION` (4,096) and far above `STANDARD` (256).

## Direction of flow

The estimator reads no result, and no result reads the estimator. There is no
path by which a probability influences a game, and none by which a game
influences a probability. That is a property of the module graph, not a
convention: no `api/` handler imports the estimator, and the estimator imports
nothing from the result-persistence layer.
