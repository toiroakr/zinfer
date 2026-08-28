import { z } from "zod";

/**
 * Nested schema to verify deep object expansion.
 */
const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string(),
});

export const PersonSchema = z.object({
  name: z.string(),
  address: AddressSchema,
  alternateAddresses: z.array(AddressSchema),
});
