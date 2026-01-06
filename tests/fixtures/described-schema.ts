import { z } from "zod";

/**
 * Schema with field descriptions using .describe()
 */
export const UserSchema = z
  .object({
    id: z.string().uuid().describe("Unique user identifier"),
    name: z.string().min(1).describe("User's display name"),
    email: z.string().email().describe("User's email address"),
    age: z.number().int().positive().optional().describe("User's age in years"),
    role: z
      .enum(["admin", "user", "guest"])
      .describe("User's role in the system"),
  })
  .describe("User account information");

/**
 * Schema with nested object descriptions
 */
export const AddressSchema = z.object({
  street: z.string().describe("Street address"),
  city: z.string().describe("City name"),
  country: z.string().describe("Country code (ISO 3166-1 alpha-2)"),
  zipCode: z.string().optional().describe("Postal/ZIP code"),
});

/**
 * Schema with nested objects
 */
export const ProfileSchema = z.object({
  user: UserSchema.describe("User information"),
  address: AddressSchema.optional().describe("User's primary address"),
  tags: z.array(z.string()).describe("User tags for categorization"),
});
