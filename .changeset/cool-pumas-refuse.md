---
"zinfer": minor
---

Keep referencing generated types instead of inlining a copy of their structure

A reference reached through a schema that gets no type of its own (a non-exported intermediate) used to stop referencing generated types altogether: the intermediate's structure was inlined, and every reference inside that copy was re-expanded - collapsing recursive schemas to `any`. The inlined shape now keeps pointing at the generated types it references.

- Schemas imported from another file in the same run are now referenced through an `import type { ... }` of that file's generated types, rather than being expanded in place. A schema from a file outside the run is still inlined, since it has no generated type to point at.
- A field referencing a `z.ZodType<T>`-annotated schema now resolves to that schema's generated input type instead of printing `unknown` (Zod 4's `ZodType<Output, Input = unknown>` leaves `z.input<>` unset). The output side is unchanged.
