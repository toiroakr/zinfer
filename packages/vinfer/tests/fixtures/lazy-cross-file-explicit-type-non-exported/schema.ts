import * as v from "valibot";
import type { NodeOutput } from "./types";

// #518: the non-exported counterpart of lazy-cross-file-explicit-type/. The
// recursion point still falls back to the bare "NodeOutput" identifier, but
// NodeSchema is never exported and reached only inline through
// ContainerSchema, so it gets no "NodeSchemaInput"/"NodeSchemaOutput"
// declaration of its own to rewrite the bare identifier to - that name would
// be just as undeclared as the one it replaces.
const NodeSchema: v.GenericSchema<NodeOutput> = v.lazy(() =>
  v.object({
    value: v.string(),
    children: v.optional(v.record(v.string(), NodeSchema)),
  }),
);

export const ContainerSchema = v.object({
  root: NodeSchema,
});
