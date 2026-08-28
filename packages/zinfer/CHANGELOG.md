# zinfer

## 0.3.5

### Patch Changes

- a6cdde4: Extract the schema-library-agnostic parts of zinfer and vinfer (CLI
  orchestration, config loading, error formatting, file/name/import resolution,
  and the type-normalization template - the AST-based schema extraction itself
  stays in each package) into an internal, unpublished `packages/core` package,
  so the two tools no longer duplicate this logic and drift out of sync with
  each other. `zinfer` and `vinfer` remain independently installable packages
  with unchanged public APIs; `packages/core`'s code is bundled into each
  package's published `dist/` at build time and is never a runtime dependency
  consumers need to install.

  As part of unifying the previously-duplicated CLI orchestration onto a single
  implementation, vinfer picks up four small behavior fixes that bring it in
  line with zinfer (previously only zinfer had these):

  - `--generate-tests` combined with `-d`/`--declaration` is now rejected with a
    clear error, instead of silently generating a broken test file.
  - Cross-file type references now account for output-path collisions (two
    input files that resolve to the same output path) instead of always
    trusting every resolved file, avoiding a reference to a declaration that
    might not actually exist in the generated output.
  - Validation and "no schemas found" errors are now formatted consistently
    through `InvalidOptionError`/`NoSchemasFoundError` (matching zinfer), so CLI
    error output is uniform between the two tools.
  - An explicitly requested config file (`--config <path>`) that fails to load
    or parse now throws instead of silently falling back to an empty
    configuration and continuing - matching zinfer's behavior for a path the
    user named explicitly. Auto-discovered config files (no `--config` flag)
    are unaffected: a missing or broken one still just warns and proceeds with
    no configuration, for both tools.

## 0.3.4

### Patch Changes

- fe83221: Move zinfer and vinfer into a single pnpm monorepo (toiroakr/zinfer, at
  packages/zinfer and packages/vinfer). No runtime or CLI behavior changes.
  `repository.url`/`repository.directory` in package.json are updated to point
  at the new monorepo location, which `publishConfig.provenance` validates
  against on publish.

## 0.3.3

### Patch Changes

- 9b20e83: Add `--brand-strategy` (config `brandStrategy`) to control how a `.brand()` marker is represented in the generated output. The default, `"zod-import"`, keeps the existing behavior: `BRAND<"Tag">` with `import type { BRAND } from "zod"`. `"local-symbol"` instead emits a self-contained `unique symbol` marker (`export declare const __brand: unique symbol;`, reused across every branded type in the file) and prints `{ readonly [__brand]: "Tag" }` in place of `BRAND<"Tag">`, so the generated output never imports zod - useful when generated files are re-exported through a public package API that must never require zod in consumers' own type-check graph.

  - The `__brand` symbol is declared once per file, exported, and shared by every brand it contains; nominal distinctness comes from each brand's own tag literal, the same way zod's own `BRAND` marker works - not from the symbol's identity.
  - `--brand-strategy local-symbol` also works with `--generate-tests`. Since a local-symbol marker is intentionally a different shape from zod's own `BRAND<Tag>` (and is `readonly` where zod's is not), a branded schema's generated output test uses a canonicalizing comparison instead of plain `toEqualTypeOf<z.output<>>()` - it normalizes both sides' brand-marker property (whichever unique symbol keys it, however the tag is encoded, regardless of the `readonly` mismatch) down to a common shape before comparing, recursively, so a brand nested at any depth - including inside a self-referential schema - is still verified against the real inferred type.

- 5e1014d: Fix a recursive getter with an explicit return-type annotation whose value is wrapped in `.nullable()` losing the `| null` union on the generated _Input_ type, while the Output type kept it correctly.
- 4eeeda0: Fix a regression where an unannotated (or annotated) recursive getter returning an array through `.nullable().optional()` collapsed to `any[]` in generated output, instead of the schema's own recursive type.

## 0.3.2

### Patch Changes

- 2af39e3: Add `--inline-external-types` (config `inlineExternalTypes`) to replace an `import("...")` reference to a plain type reached through an explicit `z.ZodType<T>` annotation with that type's own structure, recursively across as many files as needed, instead of leaving the generated output pointing back at them. Off by default; existing generated output is unchanged unless the flag is set.

  - A reference that would recurse into itself, directly or through another file, is left as a resolvable `import(...)` at the point it would repeat. A same-file type that isn't exported has no importable name to fall back to, so a cycle through one is left as a bare (unresolved) identifier instead - the same known limitation already documented for a local explicit annotation.
  - A reference reached through a recursed-into file's own imports - printed by TypeScript as a bare name valid only in that file's own scope - is re-anchored to the same explicit, resolvable form before being embedded in the output.
  - A qualified name (e.g. an enum member, `Kind.A`) or a generic instantiation (`Box<string>`) is never expanded, only referenced - expanding just the base name would strand the rest against whatever replaced it.

- 1756f61: Fix corrupted `import(...)` paths in generated types when the working directory or an absolute `--outDir`/`--outFile` path goes through a symlink (e.g. macOS's `/var` -> `/private/var` tmpdir). The absolute path built from the schema's source directory and the output directory could resolve from different symlink bases, so the relative path computed between them walked all the way up to the filesystem root instead of staying short - both are now resolved to their real, symlink-free path before being compared.
- 734a59d: Fix wrong `import(...)` path in generated types when a nested field references a plain type from another file

  A schema field whose type references a plain (non-schema) type declared in a different file than the schema - reached through a chain like `schema.ts` importing `types.ts` importing `common.ts` - could generate an `import("...")` path that pointed at the wrong location once written to an output directory that differs from the source directory (`outDir`, `outPattern`, or `--outFile`). TypeScript's printer synthesizes these paths relative to the schema's own source file, not the eventual output file, so a deeper source tree than the output tree produced too many (or too few) `../` segments, breaking the generated `.d.ts`/`.ts` with `TS2307: Cannot find module`. These paths are now anchored correctly regardless of how far apart the source and output directories are.

## 0.3.1

### Patch Changes

- d04462a: Fix recursive schema generation.

  - A recursive getter now prints its self-reference straight away. When the getter
    carries an explicit return type, TypeScript unfolds one whole copy of the
    schema before it reaches the recursion; that copy is collapsed away, so
    `children: Record<string, Self>` prints as `children: { [x: string]: Self; }`
    instead of an extra level of the same shape.
  - The input side of an annotated getter is rebuilt too. `z.ZodType<Output>`
    leaves its `Input` parameter at `unknown`, and that placeholder was left as-is,
    losing both the shape and the recursion.
  - `.describe()` now reaches fields behind an index signature. A record's value
    schema is described at the path of the field holding the record, so the index
    signature no longer counts as a path segment of its own and inlined levels keep
    their TSDoc.
  - A recursive schema imported from another generated file is referenced by name
    and `import type`d from that file, instead of being inlined into an
    approximation that lost its recursion point. When no generated file declares
    it, the recursion point keeps the index signature or array the getter
    describes rather than collapsing to a bare `any`.
  - `mergeSame` now merges recursive schemas: the two directions of a schema that
    names itself are compared with those self-references unified, so a recursive
    schema whose input and output agree emits a single type plus `type XInput = X`.
    A schema declared in one file and imported by another is also no longer dropped
    from a merged single-file output.
  - A reference to a recursive schema is named wherever it occurs. `z.array(Node)`
    printed as `any[]` when TypeScript had given up on `Node`, and only shapes it
    managed to print were rewritten to the type name; the field is known to hold
    that schema either way, so it is now named there too.

  `FieldDescription` and `ExtractContext` are exported from the package root, so
  `ExtractResult`'s `fieldDescriptions` and the extraction context can be named by
  consumers.

- 3d2ba39: Fix two gaps in cross-file recursive schema referencing.

  - A schema imported under a local alias (`import { X as Y } from "..."`) is
    referenced by the declaring file's own export name instead of falling back to
    an inlined approximation. The declaring file has no generated type named
    after the local alias, only after its own export, so that is what the
    printed reference and the `import type` now use.
  - A `--schemas` filter no longer disables cross-file referencing outright. It
    only drops referencing a schema the filter itself excludes, since that
    schema's own declaration wouldn't be generated either; a schema the filter
    does include keeps referencing by name as if no filter were set.

- cb41186: Fix a recursive schema reached only through a non-exported intermediate schema in the same file collapsing to `any` instead of referencing the recursive schema's own generated type.

  A non-exported schema gets no generated type of its own, so a reference to it was always left as the compiler's raw inlined structure - including whatever recursion the compiler itself couldn't resolve at that point, which printed as a bare `any`. The intermediate's own references are now resolved first, so an inlined copy of it keeps pointing at generated types (no import needed, since both live in the same file) instead of the compiler's unresolved structural expansion. This is the same-file counterpart of the cross-file fix in a previous release.

## 0.3.0

### Minor Changes

- 4f1365a: **Breaking:** `BrandDetector`, `SchemaBrandMap`, and `BrandInfo` are removed from the `zinfer/core` exports. They were replaced by the normalization-based branding approach from the `.brand()` fix below and have no replacement export.

  Fix a batch of recently reported issues:

  - `--version` now reads the version from `package.json` at runtime instead of reporting a hardcoded `0.1.0` (#390)
  - A `z.record()` value replaced by a named cross-schema reference now emits a trailing semicolon on the index signature, matching every other index signature zinfer prints (#394)
  - `.describe()` called before `.optional()` (or `.nullable()`/`.default()`/`.readonly()`) is no longer lost (#388)
  - An explicit type annotation naming a global type (e.g. `z.ZodType<Function, Function>`) no longer produces a self-referential type alias, and the same rewrite no longer collapses into a circular alias when it names a locally declared class/interface/type that resolves to exactly itself (e.g. `z.ZodType<LocalClass, LocalClass>`) (#383)
  - A schema exported under a different name via `export { X as Y }` now resolves its real type instead of falling back to `any`, including a self-referential getter field on the aliased schema, a cross-schema field reference to the aliased schema, and the aliased schema as a union member (#384)
  - A variadic tuple (`z.tuple([...]).rest(...)`) no longer collapses into a plain array, losing its fixed leading elements (#386)
  - `.brand()` applied inside `z.array()`/`z.record()` now brands the element/value instead of the whole collection; a whole-object `.brand()` continues to work. The generated `import type { BRAND } from "zod"` is also now added only when a brand actually appears in an emitted (exported, and `inputOnly`/`outputOnly`-respecting) declaration, instead of whenever any schema in the file happens to have one (#385)
  - `pnpm generate:type-tests` no longer overwrites the `--with-descriptions` snapshot fixtures (#393)
  - `runCLI` is now exported (via a new `cli-runner` module) so the CLI can be covered end to end (#392)
  - `-c`/`--config <path>` now loads the specified config file instead of being silently ignored, and `exclude` patterns are now honored; an explicit `--config <path>` pointing at an unreadable or unparseable `package.json` now rejects instead of silently falling back to an empty config (#389)
  - Generated `--generate-tests` files are now type-checked as part of the test suite, catching mismatches that `expectTypeOf().toEqualTypeOf()` alone cannot (a runtime no-op) (#391)

### Patch Changes

- 96f1509: Fix `peerDependencies` lower bounds that Renovate had silently narrowed without any accompanying source change (#413, #415):

  - `typescript`: restored `>=5.9.3` back to `>=5.0.0`. Verified working (typecheck + full test suite) at the lowest installable release satisfying that range, `5.0.2`.
  - `zod`: **not** reverted to the pre-Renovate `>=3.0.0` — that value was never actually correct. zod 3.0.0 predates `.describe()` (added in 3.11.6) and `.brand()` (added in 3.18.0), and CI had never once run zinfer's tests against an installed zod matching the declared floor, so this had gone unnoticed. The floor is corrected to `>=3.25.76`, the lowest version verified (via CI) to pass the full test suite.

  Renovate's `peerDependencies` handling has also been fixed (`rangeStrategy: widen`, `automerge: false`) so future zod/typescript releases can't narrow these floors unnoticed again. CI now has a `peer-floor` job that actually installs each declared floor (individually and combined) and runs typecheck + test against it, so any future floor claim is continuously verified rather than assumed.

- e1e2b72: Fix generated declarations printing an unimported bare identifier when a schema's explicit type annotation resolves to exactly a locally declared class, interface, or type alias (e.g. `z.ZodType<LocalClass, LocalClass>`). The reference is now qualified through an inline `import("...")` type instead, using whatever name the module actually exports the declaration under (a named export, a default export's `.default`, or a renamed export), so the generated file type-checks on its own for any exported local type. This also avoids name collisions across source files combined via `--outFile`, since each reference carries its own module path. Non-exported local types are unaffected and keep the existing bare-identifier fallback.
- a96d6f3: chore(deps): update dependency typescript to >=5.9.3
- 749532b: chore(deps): update dependency zod to >=3.25.76
- 19ce457: Give `renovate.json` an explicit `rangeStrategy` per dependency type instead of one blanket `"bump"`:

  - `peerDependencies`: kept at `"widen"` explicitly (matches Renovate's `"auto"` default for this depType, but spelled out so the intent — always widen a peer range, never narrow a floor — is clear from reading the file rather than relying on Renovate's implicit default). The dedicated `automerge: false` rule stays, since a peer range change still deserves human review even when it's a safe widen.
  - `dependencies`: kept at `"bump"`. Unlike peers, these don't need to resolve to a single shared instance across the consumer's tree, so a floor bump can at most add a duplicate install of a slightly newer version alongside whatever the consumer already has — it doesn't force or conflict with the consumer's own declared version.
  - `devDependencies`: changed from `"bump"` to `"pin"`, and the manifest's `^`-ranged versions were unpinned to the exact versions already resolved in the lockfile. This doesn't change what either `pnpm install --frozen-lockfile` or a plain `pnpm install` against an up-to-date lockfile resolves to (both already reuse the locked versions as-is; pnpm only re-resolves within a range on `pnpm update` or when the lockfile itself is regenerated). What it removes is the gap between what `package.json` documents and what's actually locked, and it keeps that guarantee even across a lockfile regeneration. Automerge behavior is unchanged.

## 0.2.8

### Patch Changes

- 5036207: fix(deps): update dependency glob to ^13.0.6
- 98a1f2d: fix(deps): update dependency jiti to ^2.7.0

## 0.2.7

### Patch Changes

- 5210bb4: Fix description extraction stack-overflowing on self-recursive Zod schemas (e.g. a `get` accessor referencing the schema itself), which silently dropped every `.describe()` comment for the whole file. Field description extraction now tracks visited object schemas per recursion path and stops descending on a cycle, and a single schema's extraction failure no longer discards descriptions already collected for other schemas in the same file.

## 0.2.6

### Patch Changes

- 07d3613: Fix `.describe()` text on an inlined nested field being replaced by an unrelated same-named field's text elsewhere in the file. Field descriptions were looked up by field name only, because the nested object formatter never actually tracked nesting depth (including across sibling objects in the same union/tuple). Also extend description extraction to recurse into array element and union member types, since those types print inline at the same path as their containing field.

## 0.2.5

### Patch Changes

- 054a3a5: Preserve exported schema aliases inside unions with imported or non-exported members, including references inherited from shared object shapes.

## 0.2.4

### Patch Changes

- 0dc4e66: Preserve named schema references when `.describe()` (or another type-preserving method such as `.meta()`, `.superRefine()`, `.check()`) wraps a schema reference or a `z.union()` / `z.discriminatedUnion()` declaration, instead of expanding the referenced schema inline. Inline expansion previously degraded recursive schemas to `unknown` / `any`. Also detect schemas whose builder chain is formatted across multiple lines (e.g. `z\n  .union([...])\n  .describe(...)`), which were previously skipped entirely.

## 0.2.3

### Patch Changes

- 8ec6316: Preserve named schema references inside `z.strictObject()` and `z.looseObject()` fields instead of expanding them inline.

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
