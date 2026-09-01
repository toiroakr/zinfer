import { object, string, number, optional, pick } from "zod/mini";

export const ProductSchema = object({
  id: string(),
  title: string(),
  price: number(),
  description: optional(string()),
});

export const ProductSummarySchema = pick(ProductSchema, { id: true, title: true });
