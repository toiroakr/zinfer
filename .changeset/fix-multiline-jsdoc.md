---
"zinfer": patch
---

Fix malformed JSDoc comments when descriptions contain newline characters. Both field-level and schema-level descriptions now correctly format multiline JSDoc with `* ` prefix on each line. Also adds regression tests for previously fixed bugs (config merging, suffix handling, union extraction, type generation) and fixes missing re-export of `relativizeImportPaths` from barrel file.
