# zinfer

## 0.1.3

### Patch Changes

- fdd8725: Add caching and reduce redundant AST traversals for improved performance: cache schema detection, module resolution, imported schema types, and schema source lookups; consolidate reference analysis into single pass; inject \_\_Normalize type once per file; skip unnecessary AST walks in GetterResolver and BrandDetector

## 0.1.2

### Patch Changes

- 093e673: Fix config merging for generateTests, empty string suffix handling, union type extraction for non-exported members, normalizer array/readonly ordering, and add [dir] outPattern placeholder, unified type aliases with mergeSame, and topological sort for transitive merge resolution

## 0.1.1

### Patch Changes

- bc7ce7b: Add automated release workflow with npm trust publishing, verbose logging, CLI option validation, and type test generation improvements
