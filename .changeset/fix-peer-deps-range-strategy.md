---
"zinfer": patch
---

Restore the `peerDependencies` lower bounds for `zod` (`>=3.0.0`) and `typescript` (`>=5.0.0`) that Renovate had silently narrowed to `>=3.25.76` and `>=5.9.3` respectively (#413, #415). Neither narrowing reflected an actual code requirement — no source changes accompanied either bump — so users on zod 3.0.0–3.25.75 or typescript 5.0.0–5.9.2 were incorrectly flagged as unsupported. Renovate's `peerDependencies` handling has also been fixed (`rangeStrategy: widen`, `automerge: false`) so this can't happen unnoticed again.
