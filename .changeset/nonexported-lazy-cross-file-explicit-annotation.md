---
"zinfer": patch
"vinfer": patch
"zinfer-mini": patch
---

Fix the non-exported variant of #455: a recursive schema (`z.lazy()`/`v.lazy()`) with an explicit `z.ZodType<T>`/`v.GenericSchema<T>` annotation, reached only inline through another exported schema (not exported itself), still printed an unresolved bare identifier at its recursion point - just a different, synthesized name (`<schema>Input`/`<schema>Output`) instead of the annotation's literal name.

#455's fix rewrote the recursion point to the schema's own generated `<schema>Input`/`<schema>Output` name, but that name is only declared when the schema is exported (or imported from elsewhere) - the type-printer emits no declaration for a schema that is neither. A non-exported schema reached only inline through another schema traded one undeclared identifier for another. The recursion point now widens to `any` instead when the schema itself won't get a declaration, the same "no name to point at" fallback a getter-based self-reference with no declared name already falls back to.

Fixes #518
