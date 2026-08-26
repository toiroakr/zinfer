---
"zinfer": patch
---

Fix a regression where an unannotated (or annotated) recursive getter returning an array through `.nullable().optional()` collapsed to `any[]` in generated output, instead of the schema's own recursive type.
