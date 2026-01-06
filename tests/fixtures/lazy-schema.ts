import { z } from "zod";

// ============================================
// Recommended pattern: getter-based recursion
// ============================================

// Self-referencing schema using getter (recommended in Zod v3.23+)
interface CategoryInterface {
  name: string;
  subcategories: CategoryInterface[];
}

const CategoryBaseSchema = z.object({
  name: z.string(),
  get subcategories() {
    return CategorySchema.array();
  },
});

export const CategorySchema: z.ZodType<CategoryInterface> = CategoryBaseSchema;

// Mutually recursive schemas using getter
interface TreeNodeInterface {
  value: string;
  children: TreeNodeInterface[];
  parent?: TreeNodeInterface;
}

const TreeNodeBaseSchema = z.object({
  value: z.string(),
  get children() {
    return TreeNodeSchema.array();
  },
  get parent() {
    return TreeNodeSchema.optional();
  },
});

export const TreeNodeSchema: z.ZodType<TreeNodeInterface> = TreeNodeBaseSchema;

// ============================================
// Legacy pattern: z.lazy() (still supported)
// ============================================

// Simple lazy with explicit type
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
