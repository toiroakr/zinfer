---
"zinfer": minor
"vinfer": minor
---

Rename `--inline-external-types` (and the `inlineExternalTypes` config/API key) to `--inline-type-references`, and turn its boolean value into a scope: `"project"` (the previous, still default, behavior) or `"all"`, which also follows an `import("...").Name` reference into a plain type declared in a **dependency package** - resolved through TypeScript's own module resolution rather than left as-is. `external` read as "the type comes from outside the project", which is exactly the one case the flag never handled; the new name matches the vocabulary the extractor already uses internally (`inlineExternalTypeReferences`, `resolveExternalTypeReference`) and drops the internal/external question from the name entirely.

This is a breaking change to the CLI flag, the config file key, and the `ExtractContext`/`InferConfig` types in both `zinfer` and `vinfer` (and `@zinfer-monorepo/core`). `--inline-external-types` / `inlineExternalTypes: true` becomes `--inline-type-references` / `inlineTypeReferences: "project"`.
