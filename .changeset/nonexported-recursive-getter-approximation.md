---
"zinfer": patch
"vinfer": patch
"zinfer-mini": patch
---

Fix the getter-based counterpart of the previous fix: a recursive schema built with a self-referencing getter (no explicit type annotation) that is itself not exported and reached only inline through another exported schema still printed an undeclared `<schema>Input`/`<schema>Output` self-reference at its recursion point when inlined into the referencing schema.

zinfer already ports this fallback for a cross-file imported schema that gets no generated types (widening the recursion point to `any` while keeping the shape the getter describes). Extend the same widening to a same-file getter-based recursive schema that isn't exported: `zinfer` and `zinfer-mini` now carry the same `approximation`/`inlinableForm` mechanism vinfer already had, keeping the schema's own raw self-reference intact (still needed internally for union-composition and cycle detection) while a referencing schema inlines the widened, type-checkable form instead.

Also backfills zinfer-mini's test coverage for the original exported cross-file recursive explicit-annotation case (#455), which it inherited at creation with no dedicated test.
