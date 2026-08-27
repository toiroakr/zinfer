// A recursive schema reached only through a non-exported intermediate that
// lives in the *same file* as the recursive schema's own generated type. No
// import is needed here - the type name is already in scope - but the
// reference used to fall back to inlining the intermediate with a bare `any`
// at the recursion point instead of pointing at the recursive schema's own
// generated type, the same-file counterpart of the cross-file case in
// cross-file-recursive/.
import { z } from "zod";

export const SameFileNodeSchema = z.object({
  name: z.string().describe("The node name"),
  get children() {
    return z.record(z.string(), SameFileNodeSchema);
  },
});

// Not exported, so zinfer generates no type of its own for this.
const SameFileGroupSchema = z.object({
  members: z.array(SameFileNodeSchema),
});

export const SameFileTreeSchema = z.object({
  direct: SameFileNodeSchema.describe("Depth 1: direct reference"),
  viaGroup: SameFileGroupSchema.describe("Depth 2: through a non-generated schema"),
});
