import * as v from "valibot";
import type { NodeOutput } from "./types";

// A recursive schema (v.lazy) whose explicit v.GenericSchema<T> annotation
// reaches a type declared in another file. At the recursion point,
// TypeScript's printer can't expand NodeOutput's structure again (it would
// recurse forever), so it falls back to the bare identifier "NodeOutput" -
// visible here only because of this file's own import. See #455.
export const NodeSchema: v.GenericSchema<NodeOutput> = v.lazy(() =>
  v.object({
    value: v.string(),
    children: v.optional(v.record(v.string(), NodeSchema)),
  }),
);
