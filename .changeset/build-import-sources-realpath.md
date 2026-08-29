---
"zinfer": patch
"vinfer": patch
---

Fix `buildImportSources()` (`packages/core`) to `realpath` the declaring file's path and the current file's own output path onto a shared canonical basis before comparing/relativizing them, consistent with `modulePathFor()`'s and `computeImportableFiles()`'s realpath fixes (#493/#467, #500/#495).

When `outPattern` is used without `outDir`, `FileResolver.resolveOutputPath()` derives the output directory from the input file's own directory. `buildImportSources()` computed the declaring file's output path from `result.importedFrom` (a raw path from ts-morph) while the current file's own output path came from a separately-resolved raw path - on a symlinked working directory, a mismatch here could point the generated `import("...")` specifier at a directory that doesn't actually contain the generated output.

Like #495/#497's realpath fixes, this is a consistency fix: the same investigation that found no discriminating end-to-end reproduction for #495 applies here too (every construction tried has both sides of the comparison derived from the same anchor, so they match even before this fix). The added test exercises this configuration (`outPattern` without `outDir`, through a symlink) but passes both before and after the fix - it's coverage for the scenario, not a regression reproduction.
