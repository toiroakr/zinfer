// A recursive schema (getter-based self-reference) that is itself not
// exported and reached only inline through another schema - the recursive
// counterpart of same-file-nongenerated-recursive-schema.ts's non-recursive
// intermediate. Nothing declares a name for LocalRecursiveSchema, so a
// reference to it can only ever be an approximation at the recursion point.
import { z } from "zod";

const LocalRecursiveSchema = z.object({
  label: z.string().describe("The local label"),
  get kids() {
    return z.record(z.string(), LocalRecursiveSchema);
  },
});

export const NonexportedRecursiveContainerSchema = z.object({
  localRecursive: LocalRecursiveSchema.describe("Non-exported recursive"),
});
