---
"zinfer": patch
---

Fix `modulePathFor()` (used by `qualifyLocalTypeReference()` to reference a locally declared class/interface/type through an inline `import("...")`, and by `--inline-external-types`'s `collectFileLocalTypeReferences()`/`referenceFallbackText()`) to `realpathSync` a file's path before stripping its extension, matching `absolutizeImportPaths()`'s convention. On a symlinked working directory (e.g. macOS's `/var` -> `/private/var` tmpdir), the un-realpath'd version anchored the printed `import("...")` to the symlink instead of its real target, inconsistent with every other absolute `import("...")` the extractor produces - breaking `resolveModuleSourceFile()`'s filesystem lookup and the cycle-detection keys built from the same path.
