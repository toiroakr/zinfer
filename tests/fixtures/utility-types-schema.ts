import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  age: z.number(),
});

/**
 * Partial - all fields optional
 */
export const PartialUserSchema = UserSchema.partial();

/**
 * Pick - select specific fields
 */
export const UserIdNameSchema = UserSchema.pick({ id: true, name: true });

/**
 * Omit - exclude specific fields
 */
export const UserWithoutEmailSchema = UserSchema.omit({ email: true });

/**
 * Required - make all fields required (opposite of partial)
 */
export const RequiredUserSchema = UserSchema.partial().required();

/**
 * DeepPartial - nested partial
 */
const NestedSchema = z.object({
  user: UserSchema,
  settings: z.object({
    theme: z.string(),
    notifications: z.boolean(),
  }),
});

export const DeepPartialNestedSchema = NestedSchema.deepPartial();
