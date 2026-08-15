import { z } from "zod";

// Recursive schema that gets a generated type of its own
export const NodeSchema = z.object({
  name: z.string(),
  get children() {
    return z.record(z.string(), NodeSchema);
  },
});

// Not exported, so no type is generated for it. Schemas referencing it have
// to inline its shape - but the Node references *inside* that shape must
// still resolve to the generated Node type instead of being re-expanded
// (which would collapse Node's recursion to `any`).
const GroupSchema = z.object({
  members: z.array(NodeSchema),
});

// Second level of indirection through another non-generated schema.
const RegistrySchema = z.object({
  primary: NodeSchema,
  groups: z.array(GroupSchema),
});

export const TreeSchema = z.object({
  direct: NodeSchema,
  viaGroup: GroupSchema,
  viaRegistry: RegistrySchema,
});
