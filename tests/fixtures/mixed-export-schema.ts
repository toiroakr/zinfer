import { z } from "zod";

// Non-exported helper schema
const InternalMetaSchema = z.object({
  version: z.number(),
  createdAt: z.date(),
});

// Exported schema referencing internal one
export const PublicDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  meta: InternalMetaSchema,
});
