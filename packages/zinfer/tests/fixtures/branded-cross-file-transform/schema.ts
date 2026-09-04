import { z } from "zod";
import type { BrandedName } from "./types";

// `BrandedName` is only reached through a `.transform()` return-type
// assertion, nested inside a larger object type - not a top-level
// `z.ZodType<T>` annotation. Under --inline-type-references, expanding
// types.ts's own declaration promotes its bare `z` (only meaningful within
// that file's own scope) to `import("zod").z`, so its printed brand marker
// becomes `import("zod").z.core.$brand<"Name">` before normalizeBrandQualifiers
// gets a chance to run on it - it must still canonicalize that combined
// prefix down to the bare `BRAND<"Name">` marker, not leak a resolved zod
// module path into the generated output.
export const FooSchema = z
  .object({ id: z.string() })
  .transform((x) => x as unknown as { value: BrandedName });
