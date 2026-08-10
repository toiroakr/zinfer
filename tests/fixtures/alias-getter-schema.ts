import { z } from "zod";

const InternalCategorySchema = z.object({
  name: z.string(),
  get subcategories() {
    return InternalCategorySchema.array();
  },
});

export { InternalCategorySchema as AliasedCategorySchema };
