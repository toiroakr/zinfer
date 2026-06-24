import { z } from "zod";

export const AddressSchema = z.strictObject({
  street: z.string(),
  city: z.string(),
});

export const UserSchema = z.strictObject({
  name: z.string(),
  address: AddressSchema,
  previousAddresses: z.array(AddressSchema).optional(),
});

export const LooseProfileSchema = z.looseObject({
  address: AddressSchema,
});
