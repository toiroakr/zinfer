import * as v from "valibot";
import type { $NodeOutput } from "./types";

// Regression coverage for a `\b`-boundary pitfall a Copilot review caught on
// #505: `\b` is defined in terms of `\w` ([A-Za-z0-9_]), which excludes `$`
// (legal at the start of a JS/TS identifier), so a cross-file recursion
// point named `$NodeOutput` would never match under a naive `\b` pattern
// and would be left as an unresolved bare identifier.
export const NodeSchema: v.GenericSchema<$NodeOutput> = v.lazy(() =>
  v.object({
    value: v.string(),
    children: v.optional(v.record(v.string(), NodeSchema)),
  }),
);
