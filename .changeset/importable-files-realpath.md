---
"zinfer": patch
"vinfer": patch
---

Fix `computeImportableFiles()` (`packages/core`) and the matching `isImportable` comparisons in both extractors to `realpathSync` before comparing file paths, consistent with `modulePathFor()`'s realpath fix in #493/#467.

`computeImportableFiles()` canonicalized the CLI's resolved file list with `resolve()` only, while the paths it's compared against (`importInfo.sourceFilePath`, resolved through ts-morph's module resolution) can be realpath'd in some resolution paths. On a symlinked working directory (e.g. macOS's `/var` -> `/private/var` tmpdir), a mismatch here would silently degrade a cross-file schema reference into an inlined duplicate instead of referencing the other file's own generated type - the same class of bug already fixed for `modulePathFor()`.

Like #497's vinfer port, this is a consistency fix: `computeImportableFiles()`'s own output and the extractors' comparisons are now symmetrically realpath'd, but no discriminating end-to-end reproduction was found (every construction tried had both sides of the comparison derived from the same anchor, so they always matched even before this fix).
