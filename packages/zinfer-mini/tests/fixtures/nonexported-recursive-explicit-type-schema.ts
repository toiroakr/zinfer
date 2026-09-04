import * as z from "zod/mini";

// #527: a same-file explicit z.ZodMiniType<T> self-recursive schema that is
// itself not exported and reached only inline through another schema - the
// explicit-annotation counterpart of nonexported-recursive-getter-schema.ts.
// NodeSchema should be promoted to its own non-exported declaration instead
// of widening its recursion point (and ContainerSchema's own reference to
// it) to `any`.
type NodeOutput = {
  value: string;
  children?: Record<string, NodeOutput>;
};

const NodeSchema: z.ZodMiniType<NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.optional(z.record(z.string(), NodeSchema)),
  }),
);

export const ContainerSchema = z.object({
  name: z.string(),
  root: NodeSchema,
});
