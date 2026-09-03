import * as z from "zod/mini";
import type { NodeOutput } from "./types";

// #518: the non-exported counterpart of a cross-file recursive explicit
// annotation (#455). The recursion point still falls back to the bare
// "NodeOutput" identifier, but NodeSchema is never exported and reached only
// inline through ContainerSchema, so it gets no
// "NodeSchemaInput"/"NodeSchemaOutput" declaration of its own to rewrite the
// bare identifier to - that name would be just as undeclared as the one it
// replaces.
const NodeSchema: z.ZodMiniType<NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.optional(z.record(z.string(), NodeSchema)),
  }),
);

export const ContainerSchema = z.object({
  root: NodeSchema,
});
