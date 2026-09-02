import * as z from "zod/mini";

export const UserSchema = z.object({
  id: z.string().check(z.describe("The user's unique identifier")),
  name: z.string().register(z.globalRegistry, { description: "The user's display name" }),
});
