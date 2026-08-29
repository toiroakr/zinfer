---
"zinfer": patch
---

Fix `--inline-external-types` to parenthesize an expanded function type (and, defensively, a conditional type) before a trailing suffix, not just a union or intersection. Inlining a bare reference to a function-type alias used with a suffix - e.g. `callbacks: Callback[]` where `Callback = (value: string) => string` - printed `(value: string) => string[]`, a function returning `string[]` rather than an array of functions. `hasTopLevelUnionOrIntersection()` is renamed `needsParensBeforeSuffix()` now that its scope is broader than `|`/`&`.
