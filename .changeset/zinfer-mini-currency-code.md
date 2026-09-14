---
"zinfer-mini": patch
---

Support the Zod Mini `currencyCode` string format schema.

Detect standalone `z.properties(shape)` correctly across its supported peer range: a schema on Zod Mini 4.6.0-4.6.2, and a check (supported inside `.check(...z.properties(...))`, not as a standalone schema declaration) on 4.6.3+.
