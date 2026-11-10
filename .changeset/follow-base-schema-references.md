---
"zinfer": patch
---

Keep named references in a schema built from another schema in the same file. A schema such as `Base.superRefine(...)`, `Base.extend({ ... })`, or `z.object({ ...Base.shape })` printed every field it took from `Base` inline instead of referencing the generated types of the schemas those fields use, so a field holding a recursive schema widened to `any`. It now references them as `Base`'s own type does. The fields an `.extend()` call adds to an inline `z.object(...)` keep their references too.
