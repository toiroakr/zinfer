# zinfer

## 0.2.2

### Patch Changes

- 7926250: Preserve JSDoc/TSDoc field descriptions for `#/*` subpath imports whose target
  has a suffix after the wildcard, such as `"#/*": "./src/*.ts"` (the form
  TypeScript requires to map a `#/` subpath import to `.ts` source under
  `moduleResolution: bundler`/`nodenext`). The previous fix only stripped a
  trailing `*`, so a suffix like `.ts` was left in the jiti alias as a literal
  `*`, making the import unresolvable and dropping every description. The wildcard
  and any suffix after it are now stripped, letting jiti resolve the extension.

## 0.2.1

### Patch Changes

- c315901: Preserve JSDoc/TSDoc field descriptions for schemas imported via the bare `#/*`
  subpath import form on Node < 26. Description extraction uses jiti, which
  delegates subpath-imports resolution to the running Node; only Node 26+ resolves
  the bare `#/` form natively, while older Node rejects it as an invalid internal
  imports specifier, causing the whole module import — and thus every description —
  to be dropped. The nearest `package.json` `imports` field is now read and
  registered as jiti aliases (the same mechanism already used for tsconfig
  `paths`), so `#/`, `#src/`, and exact subpath imports all keep their
  descriptions regardless of the Node version.

## 0.2.0

### Minor Changes

- 8858d6a: Support subpath imports (the package.json `imports` field), including the `#/*` wildcard form supported by TypeScript 6 / Node 26. Schemas imported via `#`-prefixed specifiers are now resolved instead of being skipped as bare module specifiers. ts-morph is upgraded to v28 (which bundles TypeScript 6), so the `#/*` pattern is resolved natively by TypeScript's own module resolution.

## 0.1.8

### Patch Changes

- 933288d: Fix tuple types being expanded into arrays (e.g., `[string, number]` became `(string | number)[]`)

## 0.1.7

### Patch Changes

- aed9366: Add regression tests for previously fixed bugs (config merging, suffix handling, union extraction, type generation) and fix missing re-export of `relativizeImportPaths` from core barrel file.

## 0.1.6

### Patch Changes

- 7fbfb5e: Fix malformed JSDoc comments when descriptions contain newline characters. Both field-level and schema-level descriptions now correctly format multiline JSDoc with `* ` prefix on each line.

## 0.1.5

### Patch Changes

- 6a2b99e: Use jiti for TypeScript-aware module resolution in DescriptionExtractor, enabling extensionless imports and tsconfig path alias support. Also handle ZodEffects unwrapping to correctly extract descriptions through transform/refine/preprocess wrappers.

## 0.1.4

### Patch Changes

- 71948be: Skip file dependency resolution in ts-morph Project for faster initialization; optimize single-line type post-processing; add early return in simplifyZodFunctionTypes when no Zod patterns present

## 0.1.3

### Patch Changes

- fdd8725: Add caching and reduce redundant AST traversals for improved performance: cache schema detection, module resolution, imported schema types, and schema source lookups; consolidate reference analysis into single pass; inject \_\_Normalize type once per file; skip unnecessary AST walks in GetterResolver and BrandDetector

## 0.1.2

### Patch Changes

- 093e673: Fix config merging for generateTests, empty string suffix handling, union type extraction for non-exported members, normalizer array/readonly ordering, and add [dir] outPattern placeholder, unified type aliases with mergeSame, and topological sort for transitive merge resolution

## 0.1.1

### Patch Changes

- bc7ce7b: Add automated release workflow with npm trust publishing, verbose logging, CLI option validation, and type test generation improvements
