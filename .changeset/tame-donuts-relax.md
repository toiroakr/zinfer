---
"zinfer": patch
---

Fix wrong `import(...)` path in generated types when a nested field references a plain type from another file

A schema field whose type references a plain (non-schema) type declared in a different file than the schema - reached through a chain like `schema.ts` importing `types.ts` importing `common.ts` - could generate an `import("...")` path that pointed at the wrong location once written to an output directory that differs from the source directory (`outDir`, `outPattern`, or `--outFile`). TypeScript's printer synthesizes these paths relative to the schema's own source file, not the eventual output file, so a deeper source tree than the output tree produced too many (or too few) `../` segments, breaking the generated `.d.ts`/`.ts` with `TS2307: Cannot find module`. These paths are now anchored correctly regardless of how far apart the source and output directories are.
