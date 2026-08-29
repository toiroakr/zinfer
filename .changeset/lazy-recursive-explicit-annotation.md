---
"zinfer": patch
"vinfer": patch
---

Fix a recursive schema (`z.lazy()`/`v.lazy()`) with an explicit `z.ZodType<T>`/`v.GenericSchema<T>` annotation whose `T` is a type imported from another file: the recursion point in the generated declaration printed the annotation's type name verbatim, unqualified and unresolved, instead of the schema's own generated type name.

TypeScript's printer can't expand the imported type's structure again at its own recursion point - it falls back to the bare identifier, visible in the source file only via its own `import type`. Previously this was only rewritten when the annotation resolved to a type declared in the _same_ file (matching `lazy-schema.ts`'s same-file `JsonValueSchema` case); a cross-file annotation was left untouched, so the generated declaration referenced a name it never imports and failed to type-check standalone.

Fixes #455
