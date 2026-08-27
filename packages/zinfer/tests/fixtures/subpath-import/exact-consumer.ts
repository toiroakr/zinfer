import { z } from "zod";
import { SharedSchema } from "#shared";

export const ExactConsumerSchema = z.object({
  shared: SharedSchema,
  extra: z.boolean(),
});
