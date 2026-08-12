---
"zinfer": patch
---

Fix `peerDependencies` lower bounds that Renovate had silently narrowed without any accompanying source change (#413, #415):

- `typescript`: restored `>=5.9.3` back to `>=5.0.0`. Verified working (typecheck + full test suite) at the lowest installable release satisfying that range, `5.0.2`.
- `zod`: **not** reverted to the pre-Renovate `>=3.0.0` — that value was never actually correct. zod 3.0.0 predates `.describe()` (added in 3.11.6) and `.brand()` (added in 3.18.0), and CI had never once run zinfer's tests against an installed zod matching the declared floor, so this had gone unnoticed. The floor is corrected to `>=3.25.76`, the lowest version verified (via CI) to pass the full test suite.

Renovate's `peerDependencies` handling has also been fixed (`rangeStrategy: widen`, `automerge: false`) so future zod/typescript releases can't narrow these floors unnoticed again. CI now has a `peer-floor` job that actually installs each declared floor (individually and combined) and runs typecheck + test against it, so any future floor claim is continuously verified rather than assumed.
