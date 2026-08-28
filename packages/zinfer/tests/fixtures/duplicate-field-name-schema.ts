// A schema whose reference field shares its name with an unrelated nested
// field. References are recorded under the bare field name, so the nested one
// must not be mistaken for the reference - especially when it prints as a
// placeholder, which is exactly what a reference to a schema TypeScript gave
// up on looks like.
import { z } from "zod";

export const ValueSchema = z.object({
  id: z.string(),
});

export const DuplicateFieldNameSchema = z.object({
  child: z.object({ value: z.any() }),
  value: ValueSchema,
});
