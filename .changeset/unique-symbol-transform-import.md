---
"zinfer": patch
---

Fix a type reached only through an explicit type assertion (e.g. `.transform((x) => x as unknown as T)`) - not a `z.ZodType<T>` schema annotation - printing an unresolved bare identifier at a nested position, with no backing declaration or import in the generated file.

This happened when the identifier resolved in the _source_ file through an ordinary `import type { Name } from "./file"` and TypeScript's printer chose to reference the type by name instead of expanding it inline (e.g. when expansion is blocked by a computed `unique symbol` property key, which the printer can't expand outside the declaring file's scope). Neither `--inline-type-references=project` nor `--inline-type-references=all` resolved it either.

The extractor now promotes such a bare reference to a self-contained `import("...")` qualifier - the same fallback it already used for a reference found while expanding a _nested_ external declaration - so the generated output never contains a dangling identifier (fixes #528).

Also fixes a related regression this promotion exposed: a `.brand()`ed type reached the same way (through `--inline-type-references`) had its brand marker qualified by the _other_ file's own `import { z } from "zod"` (e.g. `import("zod").z.core.$brand<"Tag">`) before it could be canonicalized, leaking a resolved zod module path into the generated output instead of the intended bare `BRAND<"Tag">` marker.
