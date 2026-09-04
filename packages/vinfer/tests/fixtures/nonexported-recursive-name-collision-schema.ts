import * as v from "valibot";

// #527: two different non-exported, self-recursive schemas whose mapped
// type names collide once both are promoted to their own local declaration
// - NodeSchema and Node both map to the base name "Node" (removeSuffix only
// strips a trailing "Schema"). The one that would collide must be
// disambiguated instead of silently reusing/overwriting the other's
// declaration.
//
// Explicit v.GenericSchema<T> annotations (rather than plain unannotated
// getters, as in nonexported-recursive-name-collision-schema's zinfer
// counterpart) - two unannotated self-recursive getter schemas referenced
// together from one object defeat TypeScript's own structural inference for
// valibot (unrelated to #527: reproduces on main too), which this fixture
// isn't testing.
type NodeType = {
  label: string;
  children: Record<string, NodeType>;
};

const NodeSchema: v.GenericSchema<NodeType> = v.lazy(() =>
  v.object({
    label: v.string(),
    children: v.record(v.string(), NodeSchema),
  }),
);

type NodeAltType = {
  title: string;
  items: NodeAltType[];
};

const Node: v.GenericSchema<NodeAltType> = v.lazy(() =>
  v.object({
    title: v.string(),
    items: v.array(Node),
  }),
);

export const CollisionContainerSchema = v.object({
  a: NodeSchema,
  b: Node,
});
