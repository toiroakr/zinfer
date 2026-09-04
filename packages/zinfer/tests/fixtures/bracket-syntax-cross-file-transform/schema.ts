import { z } from "zod";
import type { Named } from "./types";

// `Named` is reached only through a `.transform()` return-type assertion,
// nested inside a larger object type, the same shape
// unique-symbol-cross-file-transform/schema.ts uses - but its structure
// carries no `unique symbol` computed key, only a single-element tuple and
// an indexed-access type. Under --inline-type-references,
// hasUnresolvableComputedKey must not mistake either for one: `Named`
// should be expanded inline, not left as a qualified `import("...").Named`
// reference.
export const FooSchema = z
  .object({ id: z.string() })
  .transform((x) => x as unknown as { value: Named });
