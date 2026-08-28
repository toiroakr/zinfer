import { z } from "zod";

export const AddressSchema = z.object({
  street: z.string(),
  // A single-quote embedded inside a double-quoted literal - the printed
  // field value the cross-schema-reference resolver scans over while
  // looking for where AddressSchema's inline printing ends.
  note: z.literal("it's here"),
});

export const UserSchema = z.object({
  name: z.string(),
  address: AddressSchema,
});
