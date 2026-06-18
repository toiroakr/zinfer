import { z } from "zod";
import { SharedSchema } from "#/shared";

export const SuffixConsumerSchema = z.object({
  shared: SharedSchema,
  name: z.string().describe("The user's name"),
});
