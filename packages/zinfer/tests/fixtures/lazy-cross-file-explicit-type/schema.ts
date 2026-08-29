import { z } from "zod";
import type { NodeOutput } from "./types";

// A recursive schema (z.lazy) whose explicit z.ZodType<T> annotation reaches
// a type declared in another file. At the recursion point, TypeScript's
// printer can't expand NodeOutput's structure again (it would recurse
// forever), so it falls back to the bare identifier "NodeOutput" - visible
// here only because of this file's own `import type`. See #455.
export const NodeSchema: z.ZodType<NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.record(z.string(), NodeSchema).optional(),
  }),
);
