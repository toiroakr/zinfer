---
"zinfer-mini": minor
---

Add `zinfer-mini`, a new package that extracts TypeScript input/output types from [zod/mini](https://zod.dev/api?id=zod-mini) schemas.

zod/mini composes schemas through top-level functions (`z.object({...})`, `z.optional(schema)`, `z.pick(schema, mask)`) rather than zinfer's method-chain style (`z.object({...}).optional()`), and commonly uses named imports rather than a namespace import (tree-shaking a bundle down is the whole point of zod/mini) - both of which `zinfer`'s source-text-pattern detector can't recognize. `zinfer-mini` is a sibling package built around an AST-based binding resolver (recognizing both `import * as z from "zod/mini"` and `import { object, string } from "zod/mini"`, across the `zod/mini`/`zod/v4/mini`/`zod/v4-mini` specifiers, as well as the standalone [`@zod/mini`](https://www.npmjs.com/package/@zod/mini) package some projects install instead) instead, while reusing zinfer's `z.input<>`/`z.output<>`-based extraction engine, since zod/mini shares the same underlying type utilities and `BRAND` marker as classic zod.

v1 covers zod/mini's primitives, `object`/`strictObject`/`looseObject`, `array`/`tuple`/`record`/`map`/`set`, `union`/`discriminatedUnion`/`intersection`, the `optional`/`nullable`/`nullish`/`exactOptional`/`nonoptional`/`readonly` wrappers, the schema-first-argument object operations (`pick`/`omit`/`partial`/`required`/`extend`/`safeExtend`/`merge`/`catchall`/`keyof`), `_default`/`prefault`/`catch`, `lazy`/getter-based recursion (with an explicit `z.ZodMiniType<T>` annotation - see the package README's "Known limitations"), and descriptions set via `.check(z.describe(...))`/`z.meta(...)`/`.register(z.globalRegistry, {...})` (read from zod's shared `globalRegistry` at runtime, since `ZodMiniType` has no `.meta()` instance method). `z.pipe(a, b)`, `codec`, `stringbool`, `json`, and function schemas aren't analyzed yet.

The peerDependencies floor is `zod@>=4.3.0`, not zod v4's own 4.0.0: earlier 4.x releases were still missing `describe`/`promise`/`exactOptional` from zod/mini's top-level exports, verified against each 4.x.0 release.
