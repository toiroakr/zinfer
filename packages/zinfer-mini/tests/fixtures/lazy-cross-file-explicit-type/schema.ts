import * as z from "zod/mini";
import type { NodeOutput } from "./types";

// #455: a z.lazy() recursive schema whose explicit z.ZodMiniType<T>
// annotation reaches a type declared in another file. At the recursion
// point, TypeScript's printer can't expand NodeOutput's structure again (it
// would recurse forever), so it falls back to the bare identifier
// "NodeOutput" - visible here only because of this file's own `import type`.
export const NodeSchema: z.ZodMiniType<NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.optional(z.record(z.string(), NodeSchema)),
  }),
);
