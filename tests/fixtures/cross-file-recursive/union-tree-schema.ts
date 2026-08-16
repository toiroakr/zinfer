import { z } from "zod";
import { UnionNodeSchema } from "./union-node-schema";

export const UnionTreeSchema = z.object({
  list: z.array(UnionNodeSchema),
});
