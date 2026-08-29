---
"zinfer": patch
"vinfer": patch
---

Fix `buildImportSources()` (`packages/core`) so the module specifier it generates for a cross-file type reference always names a file that was actually written, consistent with `modulePathFor()`'s and `computeImportableFiles()`'s realpath fixes (#493/#467, #500/#495).

When `outPattern` is used without `outDir`, `FileResolver.resolveOutputPath()` derives the output directory (and, via `[dir]`/`[name]` pattern substitution, sometimes the filename) from the input file's own path. `buildImportSources()` used to recompute the declaring file's output path by calling `resolveOutputPath()` again on `result.importedFrom` (a path as spelled by ts-morph's module resolution) - but on a symlinked working directory, that path can be spelled differently than the declaring file's own entry in the CLI's resolved file list even when both name the same physical file (per #495), and the recomputed path's directory _and filename_ could then diverge from what that file's own loop iteration actually wrote.

The fix now builds a `resolvedFiles → outputPath` map up front, keyed by each file's realpath, and has `buildImportSources()` look up the declaring file's already-computed output path by that key instead of recomputing it - so the generated specifier's filename is always exactly what was written, never a recomputed guess. `resolveOutputPath()` is still called with each file's own caller-spelled path (never a realpath'd one) so its `[dir]`/`[name]` substitution is never fed a spelling that could change the computed filename.

Like #495/#497's realpath fixes, this is a consistency fix: no discriminating end-to-end reproduction was found for this specific mismatch either (constructing one requires ts-morph to resolve a reference through a different symlink spelling than the referenced file's own CLI argument - and on this branch, `computeImportableFiles()`'s file-identity gate, not yet realpath'd pending #500, treats that mismatch as "not the same file" and falls back to inlining before `buildImportSources()` is ever reached). The added test exercises `outPattern` without `outDir` through a symlink and passes both before and after the fix - it's coverage for the scenario, not a regression reproduction.
