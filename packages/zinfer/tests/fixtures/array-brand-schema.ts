import { z } from "zod";

export const TagsSchema = z.object({
  tags: z.array(z.string().brand<"Tag">()),
  lookup: z.record(z.string(), z.string().brand<"Tag">()),
});
