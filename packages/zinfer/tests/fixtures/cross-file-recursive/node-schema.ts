// A recursive schema that another file imports. A recursive type has no
// faithful inline form, so a file referencing it has to import the types
// generated from here rather than expand them.
import { z } from "zod";

export interface CrossFileNodeShape {
  name: string;
  children: Record<string, CrossFileNodeShape>;
}

export const CrossFileNodeSchema = z.object({
  name: z.string().describe("The node name"),
  get children(): z.ZodType<Record<string, CrossFileNodeShape>> {
    return z.record(z.string(), CrossFileNodeSchema);
  },
});
