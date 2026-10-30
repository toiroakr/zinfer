---
"zinfer": patch
---

Fix a recursive array getter collapsing to a bare `any` inside an inlined copy of its schema. A schema such as `get subAttributes() { return z.array(AttributeSchema).nullable().optional(); }` printed `subAttributes?: any | null | undefined` wherever another schema embedded it without a detectable reference (e.g. through `z.xor([Base.extend(...)])`), which accepted any value. It now prints `subAttributes?: AttributeSchemaInput[] | null | undefined` (the schema's generated type, as its own declaration already did), or `any[] | null | undefined` when the recursive schema is not among the extracted schemas.
