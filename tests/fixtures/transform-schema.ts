import { z } from "zod";

/**
 * Schema with transform where input and output types differ.
 */
export const DateSchema = z.object({
  createdAt: z.string().transform((s) => new Date(s)),
  count: z.string().transform((s) => parseInt(s, 10)),
});
