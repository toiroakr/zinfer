import { z } from "zod";

export const SharedSchema = z.object({
  id: z.string().describe("Shared identifier"),
});
