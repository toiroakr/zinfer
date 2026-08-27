// A recursive schema whose printed type is a union. Inlined into another file
// it has to keep that union intact when the referencing field wraps it in an
// array.
import { z } from "zod";

export const UnionNodeSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    get children() {
      return z.array(UnionNodeSchema);
    },
  }),
]);
