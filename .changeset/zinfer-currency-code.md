---
"zinfer": patch
---

Support the Zod `currencyCode` string format schema.

Stop treating standalone `z.properties(shape)` as a schema declaration: Zod 4.6.5 turns it into a check rather than a schema, so extracting Input/Output types for it was misleading. `z.instanceof(...).properties(...)` is unaffected.
