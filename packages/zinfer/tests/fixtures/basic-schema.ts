import { z } from "zod";

/**
 * Basic object schema where input and output types are identical.
 */
export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().optional(),
});
