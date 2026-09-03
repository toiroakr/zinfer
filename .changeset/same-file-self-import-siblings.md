---
"zinfer": patch
"zinfer-mini": patch
"vinfer": patch
---

Fix a schema promoted to a real generation target and typed with an explicit annotation against a type the tool itself previously generated (the standard pattern for a recursive schema) printing redundant `import("./output-file").Sibling` qualifiers for _other_ schemas that this same run also declares in that very output file, instead of bare `Sibling` references.

TypeScript's printer only reaches for `import("...")` because the field's printing location can't see the sibling identifier locally - not because the type truly lives elsewhere. `relativizeImportPaths` now collapses a qualifier once it resolves to the output file's own path, matching every other same-file reference already printed without one (fixes #519).

Also backfills zinfer-mini's dedicated `relativizeImportPaths` test coverage, which it had none of (only vinfer had a unit-test file for this function before).
