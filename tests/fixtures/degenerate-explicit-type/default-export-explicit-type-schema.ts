import { z } from "zod";

// Same degenerate case as class-explicit-type-schema.ts, but the resolved
// class is the file's default export. It's exported, but not under the name
// `LocalClass` - only reachable as `.default` - so qualifying the reference
// with the bare local name would generate `import("...").LocalClass`, which
// has no matching export.
export default class LocalClass {
  value: string = "";
}

export const QuxSchema: z.ZodType<LocalClass, LocalClass> = z.any();
