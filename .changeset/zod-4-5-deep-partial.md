---
"zinfer": minor
---

Support zod 4.5's new top-level utility functions - `z.deepPartial()`, `z.input()`, and `z.output()` - as schema declarations. Previously these were only reachable through zinfer's schema detector as instance methods (`.deepPartial()`, still recognized for zod v3's method form), so a variable assigned from the new function-call form (e.g. `const PartialUserSchema = z.deepPartial(UserSchema);`) was silently skipped rather than having its types extracted.

The devDependency zod version used for zinfer's own tests and default builds is bumped to 4.5.4; the `zod` peerDependency floor (`>=3.25.76`) is unchanged.
