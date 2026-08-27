import { z } from "zod";
import { CrossFileNodeSchema } from "./node-schema";

export const CrossFileTreeSchema = z.object({
  root: CrossFileNodeSchema.describe("Root node"),
  index: z.record(z.string(), CrossFileNodeSchema),
});
