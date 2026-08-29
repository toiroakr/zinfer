import * as v from "valibot";
import type { Holder } from "./holder";

// Holder is visible here (imported directly), so the printer expands its
// own structure in place - but Foo isn't, so it synthesizes
// import("some-lib").Foo directly at the top level, same synthesis path as
// package-specifier/schema.ts, except "some-lib" resolves to a real
// dependency package rather than an ambient module.
export const DependencyPackageSchema: v.GenericSchema<Holder, Holder> = v.any();
