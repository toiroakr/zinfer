// A recursive schema referenced from another schema in the same file. Without an
// annotation TypeScript gives up on the recursion, so some of these references
// print as a bare `any` rather than an expanded shape - they still have to come
// out as the recursive schema's own type name.
import { z } from "zod";

export const RefNodeSchema = z.object({
  name: z.string(),
  get children() {
    return z.array(RefNodeSchema);
  },
});

export const RefHolderSchema = z.object({
  one: RefNodeSchema,
  list: z.array(RefNodeSchema),
  map: z.record(z.string(), RefNodeSchema),
  optional: RefNodeSchema.optional(),
});
