---
"zinfer": patch
---

Introduce an internal `TsHost` abstraction that isolates the ts-morph-specific type-resolution logic (temporary type-alias injection/cleanup, expanded type text resolution) used by `ZodTypeExtractor`. No behavior change; this is preparatory groundwork for eventually supporting TypeScript's native `tsgo`/Corsa API (see #200).
