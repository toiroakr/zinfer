---
"vinfer": patch
---

Deduplicate `escapeRegExp` into a shared `src/core/regexp.ts` module (matching zinfer's existing `regexp.ts`), instead of four independent copies of the same function in `extractor.ts`, `getter-resolver.ts`, `type-printer.ts`, and `valibot-bindings.ts`. Internal refactor, no behavior change.
