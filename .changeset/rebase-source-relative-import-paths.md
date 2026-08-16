---
"zinfer": patch
---

Fix `import("...")` type references in generated files pointing at paths that only resolve from the schema source file. TypeScript prints module specifiers relative to the schema, so a type imported from another directory (e.g. `import("../shared/kind").Kind`) failed to resolve from the output directory and the generated file did not type-check (`TS2307`). Such specifiers are now rebased onto the output file (`import("../src/shared/kind").Kind`) in both per-file (`--outDir`) and single output file (`--outFile`) mode. Absolute paths keep their existing handling, and bare specifiers (`zod`, `@scope/pkg`, `#/alias`) are left untouched.
