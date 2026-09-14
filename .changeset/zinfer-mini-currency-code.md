---
"zinfer-mini": patch
---

Support the Zod Mini `currencyCode` string format schema.

Stop treating standalone `z.properties(shape)` as a schema declaration: Zod 4.6.5 turns it into a check rather than a schema, so extracting Input/Output types for it was misleading. Zod Mini has no schema-returning form of `properties`; it stays supported only inside `.check(...z.properties(...))`.
