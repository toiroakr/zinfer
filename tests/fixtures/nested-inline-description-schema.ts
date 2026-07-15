import { z } from "zod";

// Non-exported item schema, reused twice: standalone inside GroupSchema's
// array, and inlined a second time inside ContainerSchema. Regression test
// for https://github.com/toiroakr/zinfer/issues/340 - the inlined
// occurrence's `description` field must keep its own describe() text, not
// the unrelated top-level `description` field's text from ContainerSchema.
const ItemSchema = z.object({
  flag: z.boolean(),
  description: z
    .string()
    .optional()
    .describe("Item description, distinct from container description"),
});

export const GroupSchema = z
  .union([z.array(ItemSchema).min(1).readonly(), z.literal("none")])
  .describe("A group of items, or 'none'");

export const ContainerSchema = z.object({
  name: z.string(),
  description: z.string().optional().describe("Container-level description"),
  group: GroupSchema.optional(),
});
