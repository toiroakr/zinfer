import { z } from "zod";

// A recursive schema annotated with z.ZodType<T>. Zod 4's
// ZodType<Output, Input = unknown> leaves Input unset, so `z.input<>` of a
// field holding this schema prints `unknown` - the generated NodeInput alias
// is what that field really accepts.
export interface NodeShape {
  name: string;
  children: Record<string, NodeShape>;
}

export const NodeSchema: z.ZodType<NodeShape> = z.lazy(() =>
  z.object({
    name: z.string(),
    children: z.record(z.string(), NodeSchema),
  }),
);

export const TreeSchema = z.object({
  root: NodeSchema.describe("Root node"),
  nodes: z.array(NodeSchema),
  index: z.record(z.string(), NodeSchema),
});
