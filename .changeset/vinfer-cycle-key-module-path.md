---
"vinfer": patch
---

Canonicalize the cycle-detection `visiting` keys in `resolveOrKeepImportText()` and `resolveReferenceOrFallback()` through `modulePathFor()` (realpath'd, extension-stripped) instead of building them from `SourceFile.getFilePath()` directly, so they stay consistent with every other module-path key the extractor computes - porting the same consistency fix already applied to zinfer.
