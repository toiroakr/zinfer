import * as z from "zod/mini";

export interface Category {
  name: string;
  subcategories: Category[];
}

export const CategorySchema: z.ZodMiniType<Category> = z.object({
  name: z.string(),
  subcategories: z.array(z.lazy(() => CategorySchema)),
});
