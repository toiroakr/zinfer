import * as z from "zod/mini";

export interface Category {
  name: string;
  subcategories: Category[];
  parent?: Category | null;
}

// zod/mini's `object()` is a plain generic function (unlike zod-classic's
// method-chain-based ZodObject), so TypeScript cannot infer a getter's return
// type when it's circular through the object literal being passed to it - an
// explicit `z.ZodMiniType<T>` annotation is required for a recursive zod/mini
// schema, getter-based or not. See README's "Known limitations".
export const CategorySchema: z.ZodMiniType<Category> = z.object({
  name: z.string(),
  get subcategories() {
    return z.array(CategorySchema);
  },
  get parent() {
    return z.optional(z.nullable(CategorySchema));
  },
});
