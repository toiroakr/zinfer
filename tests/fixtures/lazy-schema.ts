import { z } from "zod";

// ============================================
// Recommended pattern: getter-based recursion
// ============================================

// Self-referencing schema using getter
export const CategorySchema = z.object({
  name: z.string(),
  get subcategories() {
    return CategorySchema.array();
  },
});

// Mutually recursive schemas using getter
export const TreeNodeSchema = z.object({
  value: z.string(),
  get children() {
    return TreeNodeSchema.array();
  },
  get parent() {
    return TreeNodeSchema.optional();
  },
});

// Lazy schema for recursive union types
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
);
