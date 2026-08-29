import { z } from "zod";
import { ImportedClass } from "./other";

// The explicit annotation resolves to exactly this identifier (not a larger
// composite type it appears inside), imported from another file - the
// cross-file counterpart of degenerate-explicit-type/class-explicit-type-schema.ts.
// Rewriting it to `FooInput`/`FooOutput` would produce a circular alias like
// `type FooInput = FooInput`. zinfer instead references it through an inline
// `import("...").ImportedClass` type, so the generated declaration doesn't
// print a bare identifier it never imports.
export const FooSchema: z.ZodType<ImportedClass, ImportedClass> = z.any();
