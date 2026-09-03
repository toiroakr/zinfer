// A recursive schema (getter-based self-reference) that is itself not
// exported and reached only inline through another schema - the recursive
// counterpart of the non-recursive intermediate pattern. Nothing declares a
// name for LocalRecursiveSchema, so a reference to it can only ever be an
// approximation at the recursion point.
import * as z from "zod/mini";

const LocalRecursiveSchema = z.object({
  label: z.string(),
  get kids() {
    return z.record(z.string(), LocalRecursiveSchema);
  },
});

export const NonexportedRecursiveContainerSchema = z.object({
  localRecursive: LocalRecursiveSchema,
});
