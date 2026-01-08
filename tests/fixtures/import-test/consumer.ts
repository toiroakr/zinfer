import { z } from "zod";
import { SharedSchema, AnotherSharedSchema } from "./shared.js";

export const ConsumerSchema = z.object({
  shared: SharedSchema,
  another: AnotherSharedSchema,
  extra: z.boolean(),
});
