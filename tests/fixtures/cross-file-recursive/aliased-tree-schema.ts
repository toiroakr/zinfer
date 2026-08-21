// The recursive schema is imported under a different name, so the types the
// declaring file generates cannot be named from here.
import { z } from "zod";
import { CrossFileNodeSchema as RenamedNodeSchema } from "./node-schema";

export const AliasedTreeSchema = z.object({
  root: RenamedNodeSchema,
  list: z.array(RenamedNodeSchema),
  index: z.record(z.string(), RenamedNodeSchema),
});
