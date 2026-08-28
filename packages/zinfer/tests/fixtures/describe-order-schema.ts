import { z } from "zod";

export const OrderSchema = z.object({
  a: z.string().describe("described then optional").optional(),
  b: z.string().optional().describe("optional then described"),
});
