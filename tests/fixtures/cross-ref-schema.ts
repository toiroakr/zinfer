import { z } from "zod";

export const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  country: z.string(),
});

export const UserSchema = z.object({
  name: z.string(),
  address: AddressSchema,
  previousAddresses: z.array(AddressSchema).optional(),
});

export const CompanySchema = z.object({
  name: z.string(),
  headquarters: AddressSchema,
  employees: z.array(UserSchema),
});
