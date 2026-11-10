---
"zinfer": patch
---

Keep named references in a schema built with `Base.refine(...)` from a same-file `Base`. The fields it took from `Base` used to print inline, so a field holding a recursive schema widened to `any`. It now references the generated types of the schemas those fields use, as `Base.superRefine(...)` already did.
