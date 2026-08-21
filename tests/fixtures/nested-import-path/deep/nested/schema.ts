import { z } from "zod";
import type { FieldOutput } from "./types";

// Nested two directories deep on purpose: FieldType (common.ts) isn't
// imported here directly, only through types.ts, so TypeScript's printer has
// to synthesize its own import("./common") reference when expanding
// FieldOutput for the explicit z.ZodType<FieldOutput> annotation - printed
// relative to this file's directory. Generating to a shallower output
// directory (see the nested-import-path fixtures test in extractor.test.ts)
// is what exposes a path left relative to the wrong base.
export const FieldSchema: z.ZodType<FieldOutput> = z.lazy(() =>
  z.object({
    type: z.enum(["uuid", "string", "number", "boolean"]),
    fields: z.record(z.string(), FieldSchema).optional(),
  }),
);
