import { z } from "zod";
import type { NodeOutput } from "./types";

// #518: the non-exported counterpart of lazy-cross-file-explicit-type/. The
// recursion point still falls back to the bare "NodeOutput" identifier, but
// NodeSchema is never exported and reached only inline through
// ContainerSchema, so it gets no "NodeSchemaInput"/"NodeSchemaOutput"
// declaration of its own to rewrite the bare identifier to - that name would
// be just as undeclared as the one it replaces.
const NodeSchema: z.ZodType<NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.record(z.string(), NodeSchema).optional(),
  }),
);

export const ContainerSchema = z.object({
  root: NodeSchema,
});
