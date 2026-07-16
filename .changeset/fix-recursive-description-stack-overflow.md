---
"zinfer": patch
---

Fix description extraction stack-overflowing on self-recursive Zod schemas (e.g. a `get` accessor referencing the schema itself), which silently dropped every `.describe()` comment for the whole file. Field description extraction now tracks visited object schemas per recursion path and stops descending on a cycle, and a single schema's extraction failure no longer discards descriptions already collected for other schemas in the same file.
