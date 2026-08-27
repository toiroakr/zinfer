import { z } from "zod";

export const SharedSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const AnotherSharedSchema = z.object({
  value: z.number(),
});
