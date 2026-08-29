---
"zinfer": patch
"vinfer": patch
---

Fix `buildImportSources()` (`packages/core`) to `realpath` the declaring file's output directory and the current file's own output directory onto a shared canonical basis before comparing/relativizing them, consistent with `modulePathFor()`'s and `computeImportableFiles()`'s realpath fixes (#493/#467, #500/#495).

When `outPattern` is used without `outDir`, `FileResolver.resolveOutputPath()` derives the output directory from the input file's own directory. `buildImportSources()` computed the declaring file's output path from `result.importedFrom` (a raw path from ts-morph) while the current file's own output path came from a separately-resolved raw path - on a symlinked working directory, a mismatch here could point the generated `import("...")` specifier at a directory that doesn't actually contain the generated output.

Only the directory portion is realpath'd before being passed for comparison; the paths actually fed to `resolveOutputPath()` (and thus the `[dir]`/`[name]` pattern-substitution inputs) stay as originally spelled, so the computed output _filename_ always matches what each file's own iteration actually wrote. An earlier version of this fix realpath'd the whole path before calling `resolveOutputPath()`, which could itself change the computed filename when a schema file's immediate parent directory is a symlink with a different name than its realpath.

Like #495/#497's realpath fixes, this is a consistency fix: the same investigation that found no discriminating end-to-end reproduction for #495 applies here too (every construction tried has both sides of the comparison derived from the same anchor, so they match even before this fix). The added test exercises this configuration (`outPattern` without `outDir`, through a symlink) but passes both before and after the fix - it's coverage for the scenario, not a regression reproduction.
