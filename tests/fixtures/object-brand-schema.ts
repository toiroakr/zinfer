import { z } from "zod";

export const WrapperSchema = z
  .object({
    tags: z.array(z.string().brand<"Tag">()),
  })
  .brand<"Wrapper">();
