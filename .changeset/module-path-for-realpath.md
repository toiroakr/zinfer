---
"zinfer": patch
---

Fix `modulePathFor()` (used by `qualifyLocalTypeReference()` to reference a locally declared class/interface/type through an inline `import("...")`, and by `--inline-external-types`'s `collectFileLocalTypeReferences()`/`referenceFallbackText()`) to `realpathSync` a file's path before stripping its extension, matching `absolutizeImportPaths()`'s convention. On a symlinked working directory (e.g. macOS's `/var` -> `/private/var` tmpdir), the un-realpath'd version anchored the printed `import("...")` to the symlink instead of its real target, inconsistent with every other absolute `import("...")` the extractor produces - breaking `resolveModuleSourceFile()`'s filesystem lookup and the cycle-detection keys built from the same path. Also routes the realpath'd result through pathe's `resolve()`, matching `packages/vinfer`'s existing fix for the same bug, so the OS-native backslash separators `realpathSync` returns on Windows don't end up embedded in the printed `import("...")` string.

Also canonicalize the cycle-detection `visiting` keys in `resolveOrKeepImportText()` and `resolveReferenceOrFallback()` through the same `modulePathFor()` instead of building them from `SourceFile.getFilePath()` directly, so they stay consistent with every other module-path key the extractor computes.
