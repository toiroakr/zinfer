---
"zinfer": patch
---

Fix a recursive getter with an explicit return-type annotation whose value is wrapped in `.nullable()` losing the `| null` union on the generated _Input_ type, while the Output type kept it correctly.
