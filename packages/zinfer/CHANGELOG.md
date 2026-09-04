# zinfer

## 0.4.4

### Patch Changes

- 023f777: Fix a non-exported, same-file self-recursive schema (`z.lazy()`/`v.lazy()` with an explicit `z.ZodType<T>`/`v.GenericSchema<T>` annotation, or a self-referencing getter) reached only inline through another exported schema being widened to `any` at its own recursion point, and at every _other_ reference to it, instead of keeping full type information.

  #518/#520 fixed the crash this caused by widening the recursion point to `any` as a stopgap - a real loss of type information not just at the schema's own recursion point, but at every other place the schema is referenced from. Such a schema is now promoted to its own non-exported local type declaration in the generated output file - the same treatment an exported schema already gets, minus the `export` keyword - so its recursion point, and every reference to it, point at that declaration instead of collapsing to `any`. Two promoted locals whose generated names would otherwise collide are disambiguated with a numeric suffix.

  A non-exported schema reached across files (its explicit annotation naming a type declared in another file, or imported from a file with no generated types of its own) still widens its recursion point to `any` - that stopgap is unchanged.

  Fixes #527

## 0.4.3

### Patch Changes

- c9b0522: Fix a schema promoted to a real generation target and typed with an explicit annotation against a type the tool itself previously generated (the standard pattern for a recursive schema) printing redundant `import("./output-file").Sibling` qualifiers for _other_ schemas that this same run also declares in that very output file, instead of bare `Sibling` references.

  TypeScript's printer only reaches for `import("...")` because the field's printing location can't see the sibling identifier locally - not because the type truly lives elsewhere. `relativizeImportPaths` now collapses a qualifier once it resolves to the output file's own path, matching every other same-file reference already printed without one (fixes #519).

  Also backfills zinfer-mini's dedicated `relativizeImportPaths` test coverage, which it had none of (only vinfer had a unit-test file for this function before).

## 0.4.2

### Patch Changes

- 6c3d649: Fix the non-exported variant of #455: a recursive schema (`z.lazy()`/`v.lazy()`) with an explicit `z.ZodType<T>`/`v.GenericSchema<T>` annotation, reached only inline through another exported schema (not exported itself), still printed an unresolved bare identifier at its recursion point - just a different, synthesized name (`<schema>Input`/`<schema>Output`) instead of the annotation's literal name.

  #455's fix rewrote the recursion point to the schema's own generated `<schema>Input`/`<schema>Output` name, but that name is only declared when the schema is exported (or imported from elsewhere) - the type-printer emits no declaration for a schema that is neither. A non-exported schema reached only inline through another schema traded one undeclared identifier for another. The recursion point now widens to `any` instead when the schema itself won't get a declaration, the same "no name to point at" fallback a getter-based self-reference with no declared name already falls back to.

  Fixes #518

- 3f4d837: Fix the getter-based counterpart of the previous fix: a recursive schema built with a self-referencing getter (no explicit type annotation) that is itself not exported and reached only inline through another exported schema still printed an undeclared `<schema>Input`/`<schema>Output` self-reference at its recursion point when inlined into the referencing schema.

  zinfer already had this fallback for a cross-file _imported_ schema that gets no generated types (widening the recursion point to `any` while keeping the shape the getter describes), but not for a _same-file_ one. `zinfer` and `zinfer-mini` now carry the `approximation`/`inlinableForm` mechanism vinfer already had for this case: the schema's own raw self-reference stays intact (still needed internally for union-composition and cycle detection), while a referencing schema inlines the separately-tracked, widened, type-checkable form instead.

  Also backfills zinfer-mini's test coverage for the original exported cross-file recursive explicit-annotation case (#455), which it inherited at creation with no dedicated test.

## 0.4.1

### Patch Changes

- 83e3e8c: Fix the same-file/cross-file explicit-annotation self-reference rewrite (used by `z.lazy()`/`v.lazy()` recursive schemas) to correctly judge whether an identifier followed by `<...>` is a generic method signature's own name (`name<T>(): T`, which must not be rewritten) when the type-parameter list contains a quoted literal type argument with a bare `<`/`>` inside it, e.g. `name<'>'>(): T`.

  - **vinfer**: the method-name guard counted every `<`/`>` character toward the type-parameter list's balance, including ones that only appear inside a quoted literal like `'>'`. A literal such as `'>'` closed the scan one character early and made the guard misjudge whether `(` actually follows, so it could conclude the identifier is _not_ a method name. `replaceBareTypeName` would then substitute the schema's own generated type name into what is actually a method signature, corrupting it in the generated declaration. This guard had no quote-awareness at all before this fix.
  - **zinfer**: the guard already skipped quoted content, but its "is this quote closed" check only looked at the single character immediately before the closing quote (`text[i - 1] !== "\\"`), not backslash parity. A literal type argument whose printed text ends in an escaped backslash right before the closing quote (e.g. the printed form of the single-character string `a\`, `'a\\'`) was wrongly read as still inside the string, for the same reason `isEscaped()` exists elsewhere in this codebase. This is a narrow edge case, unlikely to be hit in practice.

  The same `isGenericMethodName` guard is also shared by the bare-type-reference promotion scan (the `--inline-type-references` expansion path), not just the `v.lazy()`/`z.lazy()` self-reference rewrite described above - so both fixes apply there too, for the same reason.

  Both packages' `isGenericMethodName`/`replaceBareTypeName` were duplicated, independently-written copies that had drifted out of sync (#509). They are now a single, quote-aware, backslash-parity-aware implementation shared from `packages/core`, along with the already-identical `escapeRegExp`/`isEscaped` helpers.

## 0.4.0

### Minor Changes

- 73ab667: **Breaking:** Renamed `--inline-external-types` (and its config/API key `inlineExternalTypes: boolean`) to `--inline-type-references` (`inlineTypeReferences?: "project" | "all"`), and made it a scope instead of a boolean.

  "external" reads as node_modules-only (the opposite of what the flag does - `resolveModuleSourceFile()` never followed a bare package specifier), while the flag's actual subject is the `import("...").Name` reference TypeScript's printer synthesizes for a type invisible from the print location, whether that type lives in this project or a dependency.

  Migration:

  - CLI: replace `--inline-external-types` with `--inline-type-references` (bare, or `--inline-type-references=project`) for the same behavior as before.
  - Config file / programmatic API: replace `inlineExternalTypes: true` with `inlineTypeReferences: "project"`. `inlineExternalTypes` is no longer read - it is silently ignored, not an error.

  New: `--inline-type-references=all` additionally expands a reference into a plain `type`/`interface`/`enum` declared in a **dependency package**, resolved through TypeScript's own module resolution rather than filesystem probing (a `declare module "..."` ambient module with no backing file is still left as a reference, under either scope). This is what lets a type declared in a devDependency be inlined into the generated output, instead of leaving an `import("some-lib").Foo` reference that only resolves inside this project.

### Patch Changes

- a53b533: Fix a recursive schema (`z.lazy()`/`v.lazy()`) with an explicit `z.ZodType<T>`/`v.GenericSchema<T>` annotation whose `T` is a type imported from another file: the recursion point in the generated declaration printed the annotation's type name verbatim, unqualified and unresolved, instead of the schema's own generated type name.

  TypeScript's printer can't expand the imported type's structure again at its own recursion point - it falls back to the bare identifier, visible in the source file only via its own `import type`. Previously this was only rewritten when the annotation resolved to a type declared in the _same_ file (matching `lazy-schema.ts`'s same-file `JsonValueSchema` case); a cross-file annotation was left untouched, so the generated declaration referenced a name it never imports and failed to type-check standalone.

  Fixes #455

## 0.3.7

### Patch Changes

- d58d07a: Fix `buildImportSources()` (`packages/core`) so the module specifier it generates for a cross-file type reference always names a file that was actually written, consistent with `modulePathFor()`'s and `computeImportableFiles()`'s realpath fixes (#493/#467, #500/#495).

  When `outPattern` is used without `outDir`, `FileResolver.resolveOutputPath()` derives the output directory (and, via `[dir]`/`[name]` pattern substitution, sometimes the filename) from the input file's own path. `buildImportSources()` used to recompute the declaring file's output path by calling `resolveOutputPath()` again on `result.importedFrom` (a path as spelled by ts-morph's module resolution) - but on a symlinked working directory, that path can be spelled differently than the declaring file's own entry in the CLI's resolved file list even when both name the same physical file (per #495), and the recomputed path's directory _and filename_ could then diverge from what that file's own loop iteration actually wrote.

  The fix now builds a `resolvedFiles → outputPath` map up front, keyed by each file's realpath, and has `buildImportSources()` look up the declaring file's already-computed output path by that key instead of recomputing it - so the generated specifier's filename is always exactly what was written, never a recomputed guess. `resolveOutputPath()` is still called with each file's own caller-spelled path (never a realpath'd one) so its `[dir]`/`[name]` substitution is never fed a spelling that could change the computed filename.

  Like #495/#497's realpath fixes, this is a consistency fix: no discriminating end-to-end reproduction was found for this specific mismatch either (constructing one requires ts-morph to resolve a reference through a different symlink spelling than the referenced file's own CLI argument - and on this branch, `computeImportableFiles()`'s file-identity gate, not yet realpath'd pending #500, treats that mismatch as "not the same file" and falls back to inlining before `buildImportSources()` is ever reached). The added test exercises `outPattern` without `outDir` through a symlink and passes both before and after the fix - it's coverage for the scenario, not a regression reproduction.

- a57ec02: Fix `computeImportableFiles()` (`packages/core`) and the matching `isImportable` comparisons in both extractors to `realpathSync` before comparing file paths, consistent with `modulePathFor()`'s realpath fix in #493/#467.

  `computeImportableFiles()` canonicalized the CLI's resolved file list with `resolve()` only, while the paths it's compared against (`importInfo.sourceFilePath`, resolved through ts-morph's module resolution) can be realpath'd in some resolution paths. On a symlinked working directory (e.g. macOS's `/var` -> `/private/var` tmpdir), a mismatch here would silently degrade a cross-file schema reference into an inlined duplicate instead of referencing the other file's own generated type - the same class of bug already fixed for `modulePathFor()`.

  Like #497's vinfer port, this is a consistency fix: `computeImportableFiles()`'s own output and the extractors' comparisons are now symmetrically realpath'd, but no discriminating end-to-end reproduction was found (every construction tried had both sides of the comparison derived from the same anchor, so they always matched even before this fix).

## 0.3.6

### Patch Changes

- aee5473: Keep a brand applied directly to a tuple or an array. `__Normalize`'s array/tuple branch now leaves a type carrying symbol keys beyond an array's own well-known ones untouched, the same way the object branch already did - previously a branded fixed-length tuple was expanded into an object literal of every `Array.prototype` member, and a branded array silently lost its brand.
- 26193ef: Fix `--inline-external-types` corrupting a generic method's own name when it collides with an in-scope type reference. `promoteBareTypeReferences()`'s method-name guard only recognized a non-generic `Name(): T` signature (checking for `(` immediately after the name); a generic method's own `Name<T>(): T` fell through to the qualified/generic-reference branch instead, so its name could be rewritten into an invalid `import("...").Name<T>(): T`.
- 319db00: Fix a naive string-literal boundary check (`prevChar !== "\\"`, or the equivalent `text[i - 1] !== "\\"`) in `schema-detector.ts`, `getter-resolver.ts`, `type-printer.ts`, and `extractor.ts` (`promoteBareTypeReferences` and `hasTopLevelUnionOrIntersection`) that misjudged a string literal ending in an even number of backslashes (e.g. `"a\\"`) as still escaped, causing the scanner to stay stuck "inside" the string past its real end. Replaced with a backslash-parity check, shared through a new `string-scan.ts` module (ported from `toiroakr/vinfer`, which had the same bug independently and already fixed it the same way).

  Also fix a related but distinct bug in `extractor.ts`'s `findReferenceValueEnd`, used to find where a cross-referenced field's printed value ends: it toggled a single `inString` flag on _any_ `"` or `'` without tracking which quote opened the string or checking for escaping at all, so a field whose printed value contained a differently-quoted character (e.g. `"it's here"`) would flip out of "in string" mode mid-literal. Depth-tracking for the rest of the value would then desync, corrupting the generated declaration for the containing schema (observed: the object's closing brace and everything after it silently disappearing from the output). Fixed the same way as the other call sites - tracking the actual opening quote character plus the shared `isEscaped` check.

- 5d06000: Fix `modulePathFor()` (used by `qualifyLocalTypeReference()` to reference a locally declared class/interface/type through an inline `import("...")`, and by `--inline-external-types`'s `collectFileLocalTypeReferences()`/`referenceFallbackText()`) to `realpathSync` a file's path before stripping its extension, matching `absolutizeImportPaths()`'s convention. On a symlinked working directory (e.g. macOS's `/var` -> `/private/var` tmpdir), the un-realpath'd version anchored the printed `import("...")` to the symlink instead of its real target, inconsistent with every other absolute `import("...")` the extractor produces - breaking `resolveModuleSourceFile()`'s filesystem lookup and the cycle-detection keys built from the same path. Also routes the realpath'd result through pathe's `resolve()`, matching `packages/vinfer`'s existing fix for the same bug, so the OS-native backslash separators `realpathSync` returns on Windows don't end up embedded in the printed `import("...")` string.

  Also canonicalize the cycle-detection `visiting` keys in `resolveOrKeepImportText()` and `resolveReferenceOrFallback()` through the same `modulePathFor()` instead of building them from `SourceFile.getFilePath()` directly, so they stay consistent with every other module-path key the extractor computes.

- ddb6137: Fix `--inline-external-types` to parenthesize an expanded function type (and, defensively, a conditional type) before a trailing suffix, not just a union or intersection. Inlining a bare reference to a function-type alias used with a suffix - e.g. `callbacks: Callback[]` where `Callback = (value: string) => string` - printed `(value: string) => string[]`, a function returning `string[]` rather than an array of functions. `hasTopLevelUnionOrIntersection()` is renamed `needsParensBeforeSuffix()` now that its scope is broader than `|`/`&`.

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
