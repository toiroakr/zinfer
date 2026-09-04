import * as v from "valibot";

// #527: a same-file explicit v.GenericSchema<T> self-recursive schema that is
// itself not exported and reached only inline through another schema - the
// explicit-annotation counterpart of non-generated-intermediate-schema.ts's
// getter-based LocalRecursiveSchema. NodeSchema should be promoted to its
// own non-exported declaration instead of widening its recursion point (and
// ContainerSchema's own reference to it) to `any`.
type NodeOutput = {
  value: string;
  children?: Record<string, NodeOutput>;
};

const NodeSchema: v.GenericSchema<NodeOutput> = v.lazy(() =>
  v.object({
    value: v.string(),
    children: v.optional(v.record(v.string(), NodeSchema)),
  }),
);

export const ContainerSchema = v.object({
  name: v.string(),
  root: NodeSchema,
});
