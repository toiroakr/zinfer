import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  age: z.number(),
});

const NestedSchema = z.object({
  user: UserSchema,
  settings: z.object({
    theme: z.string(),
    notifications: z.boolean(),
  }),
});

/**
 * DeepPartial - zod 4.5's native `z.deepPartial()`, replacing the manual
 * nested `.partial()` chains previously needed under zod 4 (see
 * utility-types-schema.ts's `DeepPartialNestedSchema`).
 */
export const DeepPartialNestedSchema = z.deepPartial(NestedSchema);

const NumberFromStringSchema = z.string().transform((val) => Number(val));

/**
 * Input - zod 4.5's `z.input()`, a copy of the schema with every pipe
 * replaced by its input side.
 */
export const NumberFromStringInputSchema = z.input(NumberFromStringSchema);

/**
 * Output - zod 4.5's `z.output()`, a copy of the schema with every pipe
 * replaced by its output side.
 */
export const NumberFromStringOutputSchema = z.output(NumberFromStringSchema);
