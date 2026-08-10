import { z } from "zod";

// The explicit annotation resolves to exactly this identifier (not a larger
// composite type it appears inside), so zinfer leaves it unrewritten to
// avoid a circular alias like `type FooInput = FooInput`. The generated
// declaration still references `LocalClass` by name without importing it -
// that remains an open limitation, not something this fixture exercises.
export class LocalClass {
  value: string = "";
}

export const FooSchema: z.ZodType<LocalClass, LocalClass> = z.any();
