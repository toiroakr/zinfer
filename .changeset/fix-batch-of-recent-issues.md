---
"zinfer": minor
---

**Breaking:** `BrandDetector`, `SchemaBrandMap`, and `BrandInfo` are removed from the `zinfer/core` exports. They were replaced by the normalization-based branding approach from the `.brand()` fix below and have no replacement export.

Fix a batch of recently reported issues:

- `--version` now reads the version from `package.json` at runtime instead of reporting a hardcoded `0.1.0` (#390)
- A `z.record()` value replaced by a named cross-schema reference now emits a trailing semicolon on the index signature, matching every other index signature zinfer prints (#394)
- `.describe()` called before `.optional()` (or `.nullable()`/`.default()`/`.readonly()`) is no longer lost (#388)
- An explicit type annotation naming a global type (e.g. `z.ZodType<Function, Function>`) no longer produces a self-referential type alias, and the same rewrite no longer collapses into a circular alias when it names a locally declared class/interface/type that resolves to exactly itself (e.g. `z.ZodType<LocalClass, LocalClass>`) (#383)
- A schema exported under a different name via `export { X as Y }` now resolves its real type instead of falling back to `any`, including a self-referential getter field on the aliased schema (#384)
- A variadic tuple (`z.tuple([...]).rest(...)`) no longer collapses into a plain array, losing its fixed leading elements (#386)
- `.brand()` applied inside `z.array()`/`z.record()` now brands the element/value instead of the whole collection; a whole-object `.brand()` continues to work. The generated `import type { BRAND } from "zod"` is also now added only when a brand actually appears in an emitted (exported, and `inputOnly`/`outputOnly`-respecting) declaration, instead of whenever any schema in the file happens to have one (#385)
- `pnpm generate:type-tests` no longer overwrites the `--with-descriptions` snapshot fixtures (#393)
- `runCLI` is now exported (via a new `cli-runner` module) so the CLI can be covered end to end (#392)
- `-c`/`--config <path>` now loads the specified config file instead of being silently ignored, and `exclude` patterns are now honored (#389)
- Generated `--generate-tests` files are now type-checked as part of the test suite, catching mismatches that `expectTypeOf().toEqualTypeOf()` alone cannot (a runtime no-op) (#391)
