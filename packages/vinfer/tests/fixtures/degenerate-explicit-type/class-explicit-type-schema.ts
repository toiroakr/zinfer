import * as v from "valibot";

// The explicit annotation resolves to exactly this identifier (not a larger
// composite type it appears inside), so rewriting it to `FooInput`/
// `FooOutput` would produce a circular alias like `type FooInput =
// FooInput`. vinfer instead references it through an inline
// `import("...").LocalClass` type, so the generated declaration doesn't
// print a bare identifier it never imports.
export class LocalClass {
  value: string = "";
}

export const FooSchema: v.GenericSchema<LocalClass, LocalClass> = v.any();
