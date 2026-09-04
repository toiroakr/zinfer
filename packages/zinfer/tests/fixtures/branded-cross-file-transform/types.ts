import { z } from "zod";

// A `.brand()`ed type declared in its own file, reached only by expanding
// this declaration through --inline-type-references (see schema.ts). Its
// printed structure carries Zod's internal brand marker qualified by this
// file's own `import { z } from "zod"` (`z.core.$brand<"Name">`).
export const BrandedSchema = z.string().brand<"Name">();
export type BrandedName = z.infer<typeof BrandedSchema>;
