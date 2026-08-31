import * as v from "valibot";
import type { ImportedInterface } from "./other";

// The explicit annotation resolves to exactly this identifier (not a larger
// composite type it appears inside), imported from another file. Rewriting
// it to `FooInput`/`FooOutput` would produce a circular alias like `type
// FooInput = FooInput`. vinfer instead references it through an inline
// `import("...").ImportedInterface` type, so the generated declaration
// doesn't print a bare identifier it never imports.
export const FooSchema: v.GenericSchema<ImportedInterface, ImportedInterface> = v.any();
