# zinfer-mini

## 0.1.1

### Patch Changes

- 6c3d649: Fix the non-exported variant of #455: a recursive schema (`z.lazy()`/`v.lazy()`) with an explicit `z.ZodType<T>`/`v.GenericSchema<T>` annotation, reached only inline through another exported schema (not exported itself), still printed an unresolved bare identifier at its recursion point - just a different, synthesized name (`<schema>Input`/`<schema>Output`) instead of the annotation's literal name.

  #455's fix rewrote the recursion point to the schema's own generated `<schema>Input`/`<schema>Output` name, but that name is only declared when the schema is exported (or imported from elsewhere) - the type-printer emits no declaration for a schema that is neither. A non-exported schema reached only inline through another schema traded one undeclared identifier for another. The recursion point now widens to `any` instead when the schema itself won't get a declaration, the same "no name to point at" fallback a getter-based self-reference with no declared name already falls back to.

  Fixes #518

- 3f4d837: Fix the getter-based counterpart of the previous fix: a recursive schema built with a self-referencing getter (no explicit type annotation) that is itself not exported and reached only inline through another exported schema still printed an undeclared `<schema>Input`/`<schema>Output` self-reference at its recursion point when inlined into the referencing schema.

  zinfer already had this fallback for a cross-file _imported_ schema that gets no generated types (widening the recursion point to `any` while keeping the shape the getter describes), but not for a _same-file_ one. `zinfer` and `zinfer-mini` now carry the `approximation`/`inlinableForm` mechanism vinfer already had for this case: the schema's own raw self-reference stays intact (still needed internally for union-composition and cycle detection), while a referencing schema inlines the separately-tracked, widened, type-checkable form instead.

  Also backfills zinfer-mini's test coverage for the original exported cross-file recursive explicit-annotation case (#455), which it inherited at creation with no dedicated test.

## 0.1.0

### Minor Changes

- a019d6a: Add `zinfer-mini`, a new package that extracts TypeScript input/output types from [zod/mini](https://zod.dev/api?id=zod-mini) schemas.

  zod/mini composes schemas through top-level functions (`z.object({...})`, `z.optional(schema)`, `z.pick(schema, mask)`) rather than zinfer's method-chain style (`z.object({...}).optional()`), and commonly uses named imports rather than a namespace import (tree-shaking a bundle down is the whole point of zod/mini) - both of which `zinfer`'s source-text-pattern detector can't recognize. `zinfer-mini` is a sibling package built around an AST-based binding resolver (recognizing both `import * as z from "zod/mini"` and `import { object, string } from "zod/mini"`, across the `zod/mini`/`zod/v4/mini`/`zod/v4-mini` specifiers, as well as the standalone [`@zod/mini`](https://www.npmjs.com/package/@zod/mini) package some projects install instead) instead, while reusing zinfer's `z.input<>`/`z.output<>`-based extraction engine, since zod/mini shares the same underlying type utilities and `BRAND` marker as classic zod.

  v1 covers zod/mini's primitives, `object`/`strictObject`/`looseObject`, `array`/`tuple`/`record`/`map`/`set`, `union`/`discriminatedUnion`/`intersection`, the `optional`/`nullable`/`nullish`/`exactOptional`/`nonoptional`/`readonly` wrappers, the schema-first-argument object operations (`pick`/`omit`/`partial`/`required`/`extend`/`safeExtend`/`merge`/`catchall`/`keyof`), `_default`/`prefault`/`catch`, `lazy`/getter-based recursion (with an explicit `z.ZodMiniType<T>` annotation - see the package README's "Known limitations"), and descriptions set via `.check(z.describe(...))`/`z.meta(...)`/`.register(z.globalRegistry, {...})` (read from zod's shared `globalRegistry` at runtime, since `ZodMiniType` has no `.meta()` instance method). `z.pipe(a, b)`, `codec`, `stringbool`, `json`, and function schemas aren't analyzed yet.

  The peerDependencies floor is `zod@>=4.3.0`, not zod v4's own 4.0.0: earlier 4.x releases were still missing `describe`/`promise`/`exactOptional` from zod/mini's top-level exports, verified against each 4.x.0 release.
