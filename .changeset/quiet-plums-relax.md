---
"zinfer": major
---

Replace `ts-morph` with TypeScript's native `tsgo`/Corsa API (`@typescript/native-preview`) as the type-resolution engine (see #200). `ts-morph` is dropped entirely; `@typescript/native-preview` moves from a dev-only dependency (used just for the `tsgo` typecheck script) to a runtime dependency.

Internals:

- `TsHost` (introduced as prep work) is now implemented by `TsgoHost`, which resolves temporary type aliases via a virtual-FS overlay instead of mutating a live `ts-morph` `SourceFile`.
- `SchemaDetector`, `GetterResolver`, `ImportResolver`, `BrandDetector`, and `SchemaReferenceAnalyzer` are reimplemented against the Corsa `ast`/checker API. Cross-file import resolution now goes through `Checker.getSymbolAtLocation` (real module resolution) instead of ts-morph's `getModuleSpecifierSourceFile`, which incidentally fixes a known limitation resolving named imports through an intermediate re-export index file.

Breaking change: `SchemaDetector` and `BrandDetector` are no longer exported. They operated on a ts-morph `SourceFile`, which the new Corsa-API-backed implementation has no public, supported way to construct, so continuing to export them would have been a half-usable API. Everything they exposed is already available through `ZodTypeExtractor`'s output (`ExtractResult#isExported`/`#brands`) and `ZodTypeExtractor#getSchemaNames`. `ZodTypeExtractor`'s public methods and the top-level `extractZodTypes`/`extractAndFormat`/`extractAllSchemas` helpers are unaffected.

A handful of generated snapshots changed to reflect the new checker's (arguably more correct) member ordering: object/mapped types now print in source declaration order, and `z.enum([...])`-derived string literal unions print in alphabetical order.
