---
"zinfer": patch
---

Fix a recursive array getter collapsing to a bare `any` inside an inlined copy of its schema. A schema such as `get subAttributes() { return z.array(Self).nullable().optional(); }` printed `subAttributes?: any | null | undefined` wherever another schema embedded it without a detectable reference (e.g. through `z.xor([Base.extend(...)])`), which accepted any value. It now prints `subAttributes?: Self[] | null | undefined`, as the schema's own type already did.
