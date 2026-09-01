import * as z from "zod/mini";

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.optional(z.number()),
  email: z.nullable(z.string()),
});
