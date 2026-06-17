import { z } from "zod";
import { SharedSchema } from "#src/shared.js";

export const DescribedNamedConsumerSchema = z.object({
  shared: SharedSchema,
  name: z.string().describe("The user's name"),
});
