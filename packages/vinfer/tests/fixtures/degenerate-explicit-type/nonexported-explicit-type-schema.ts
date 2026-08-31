import * as v from "valibot";

// Same degenerate case as class-explicit-type-schema.ts, but the resolved
// class is not exported from this file. vinfer can't reference it through
// an inline `import("...")` type (there's no exported member to import), so
// it falls back to the bare identifier - still an open limitation for
// non-exported locally declared types.
class LocalNonExportedClass {
  value: string = "";
}

export const BazSchema: v.GenericSchema<LocalNonExportedClass, LocalNonExportedClass> = v.any();
