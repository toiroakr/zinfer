import * as v from "valibot";

// Same degenerate case as class-explicit-type-schema.ts, but the resolved
// class is exported under a different external name than its local
// declaration name. Qualifying the reference with the bare local name
// (`LocalClass`) would generate `import("...").LocalClass`, but the module
// only exports it as `RenamedClass`.
class LocalClass {
  value: string = "";
}
export { LocalClass as RenamedClass };

export const QuuxSchema: v.GenericSchema<LocalClass, LocalClass> = v.any();
