import { z } from "zod";

export const MultilineSchema = z
  .object({
    name: z.string().describe("User name\nMust be unique"),
    age: z.number().optional().describe("Age in years"),
  })
  .describe("A schema with\nmultiline description");
