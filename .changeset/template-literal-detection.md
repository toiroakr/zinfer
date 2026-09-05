---
"zinfer": patch
---

Fix `z.templateLiteral()` schemas being dropped from the output entirely.

`templateLiteral` was missing from the list of known `z.<builder>()` names the schema detector matches against, so a declaration whose initializer started with `z.templateLiteral(...)` was not recognized as a schema at all - no `Input`/`Output` type was generated for it, and the CLI reported it as if the file simply did not contain that schema.

The gap only showed on a _bare_ call. A template literal with something chained onto it (`.describe(...)`, `.optional()`, `.transform(...)`, ...) was still picked up by the method-chain fallback, which is why the breakage looked intermittent.

Nothing downstream needed changing: once detected, the extractor already prints template literals correctly, including finite parts expanding into a union of concrete literals (`z.templateLiteral(["v", z.enum(["1", "2"])])` -> `"v1" | "v2"`) and open-ended parts staying as a template literal type (`z.templateLiteral(["port:", z.number()])` -> `` `port:${number}` ``).
