import { z } from "zod";

const InternalNode = z.object({ id: z.string() });

export { InternalNode as AliasedNode };

export const ContainerSchema = z.object({
  node: InternalNode,
});
