---
"zinfer": patch
---

Support the Zod `currencyCode` string format schema.

Detect standalone `z.properties(shape)` correctly across its supported peer range: a schema on Zod 4.6.0-4.6.2, and a check (not a schema declaration) on 4.6.3+. `z.instanceof(...).properties(...)` is unaffected either way.
