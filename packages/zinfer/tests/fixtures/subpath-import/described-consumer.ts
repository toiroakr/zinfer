import { z } from "zod";
import { SharedSchema } from "#/shared.js";

export const DescribedConsumerSchema = z.object({
  shared: SharedSchema,
  name: z.string().describe("The user's name"),
});
