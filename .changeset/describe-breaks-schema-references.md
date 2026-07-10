---
"zinfer": patch
---

Preserve named schema references when `.describe()` (or another type-preserving method such as `.meta()`, `.superRefine()`, `.check()`) wraps a schema reference or a `z.union()` / `z.discriminatedUnion()` declaration, instead of expanding the referenced schema inline. Inline expansion previously degraded recursive schemas to `unknown` / `any`. Also detect schemas whose builder chain is formatted across multiple lines (e.g. `z\n  .union([...])\n  .describe(...)`), which were previously skipped entirely.
