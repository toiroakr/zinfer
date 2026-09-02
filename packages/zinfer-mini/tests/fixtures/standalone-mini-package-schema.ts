// `@zod/mini` is a standalone npm package (separate from `zod`), but its
// entire implementation is `export * from "zod/mini"` - same classes, same
// input/output type utilities - so it should be detected and extracted
// exactly like `zod/mini` itself.
import * as z from "@zod/mini";

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.optional(z.number()),
});
