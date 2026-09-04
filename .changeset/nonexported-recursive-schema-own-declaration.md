---
"zinfer": patch
"vinfer": patch
"zinfer-mini": patch
---

Fix a non-exported, same-file self-recursive schema (`z.lazy()`/`v.lazy()` with an explicit `z.ZodType<T>`/`v.GenericSchema<T>` annotation, or a self-referencing getter) reached only inline through another exported schema being widened to `any` at its own recursion point, and at every _other_ reference to it, instead of keeping full type information.

#518/#520 fixed the crash this caused by widening the recursion point to `any` as a stopgap - a real loss of type information not just at the schema's own recursion point, but at every other place the schema is referenced from. Such a schema is now promoted to its own non-exported local type declaration in the generated output file - the same treatment an exported schema already gets, minus the `export` keyword - so its recursion point, and every reference to it, point at that declaration instead of collapsing to `any`. Two promoted locals whose generated names would otherwise collide are disambiguated with a numeric suffix.

A non-exported schema reached across files (its explicit annotation naming a type declared in another file, or imported from a file with no generated types of its own) still widens its recursion point to `any` - that stopgap is unchanged.

Fixes #527
