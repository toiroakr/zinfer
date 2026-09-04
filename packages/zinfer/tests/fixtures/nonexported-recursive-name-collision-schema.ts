import { z } from "zod";

// #527: two different non-exported, self-recursive schemas whose mapped
// type names collide once both are promoted to their own local declaration
// - NodeSchema and Node both map to the base name "Node" (removeSuffix only
// strips a trailing "Schema"). The one that would collide must be
// disambiguated instead of silently reusing/overwriting the other's
// declaration.
const NodeSchema = z.object({
  label: z.string(),
  get children() {
    return z.record(z.string(), NodeSchema);
  },
});

const Node = z.object({
  title: z.string(),
  get items() {
    return z.array(Node);
  },
});

export const CollisionContainerSchema = z.object({
  a: NodeSchema,
  b: Node,
});
