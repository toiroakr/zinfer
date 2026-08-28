import { z } from "zod";

export const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
});

export const PersonSchema = z.object({
  name: z.string(),
  address: AddressSchema,
  tags: z.array(z.string()),
});
