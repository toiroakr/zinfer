import { z } from "zod";

// Root-level branded string
export const UserIdSchema = z.string().brand<"UserId">();

// Object with branded field
export const UserSchema = z.object({
  id: z.string().brand<"UserId">(),
  name: z.string(),
  email: z.string().email(),
});
