import { z } from "zod";

// Self-recursive object schema (getter-based recursion), used directly...
export const CategorySchema = z.object({
  name: z.string().describe("Category name"),
  get subcategories() {
    return z.array(CategorySchema).optional().describe("Nested subcategories");
  },
});

// ...and re-wrapped several object layers deep from another exported schema
// in the same file. Regression test for the follow-up in
// https://github.com/toiroakr/zinfer/issues/340 - extracting descriptions
// for the cyclic schema must not stack-overflow, and must not blank out
// descriptions already collected for unrelated schemas in the same file.
export const CatalogSchema = z.object({
  title: z.string().describe("Catalog title"),
  wrapper: z.object({
    inner: z.object({
      root: CategorySchema,
    }),
  }),
});
