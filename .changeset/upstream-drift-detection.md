---
"zinfer": patch
---

Recognise `z.creditCard()`, `z.input()` and `z.output()`, added in zod 4.5.

Found by the new upstream-drift check rather than by a user: zinfer pins zod 4.4.3 as a devDependency, so its own test suite was happy, while anyone on zod 4.5 writing one of these as a bare call got no type for it. They are on the fast-path list now, and the scheduled CI job that runs the schema-builder contract test against `zod@latest` is what will surface the next such release during Renovate's 7-day `minimumReleaseAge` instead of after it.
