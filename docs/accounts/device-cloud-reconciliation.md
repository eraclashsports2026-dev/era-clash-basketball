# Device / cloud reconciliation

A browser keeps a small local ledger of the result ids it has played
(`src/accounts/deviceResults.js`). It is a candidate list for import, never
proof of ownership: the server re-derives ownership for every proposed id by
comparing the authoritative record's server-minted device session to the
caller's HttpOnly cookie. A ledger copied from another browser imports nothing.

## States

`reconciliationState()` names the situation from plain counts:

| State | When |
| --- | --- |
| `NO_DEVICE_HISTORY` | this browser remembers nothing |
| `IMPORT_COMPLETE` | everything it remembers is already in the career |
| `IMPORT_AVAILABLE` | there are results this device really played and has not saved |
| `PARTIAL_IMPORT` | the last import saved some and refused others |
| `CONFLICT` | the unsaved results are already owned by another account |

## Behaviour

On sign-in the career offers an import only when it is useful, and only for
results the server confirms this device played. Import is **idempotent** — a
second pass adds nothing — so a retry after a partial failure is safe. After a
completed import the offer is dismissed and does not nag. A manual
**Check this device for unsaved Clashes** control is available from the account.

No import ever duplicates a row, silently replaces a cloud record, or claims
another browser's data.
