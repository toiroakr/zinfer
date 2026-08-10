import { z } from "zod";

// Same degenerate case as class-explicit-type-schema.ts, but the resolved
// class is exported under a different external name than its local
// declaration name. Qualifying the reference with the bare local name
// (`LocalClass`) would generate `import("...").LocalClass`, but the module
// only exports it as `RenamedClass`.
class LocalClass {
  value: string = "";
}
export { LocalClass as RenamedClass };

export const QuuxSchema: z.ZodType<LocalClass, LocalClass> = z.any();
