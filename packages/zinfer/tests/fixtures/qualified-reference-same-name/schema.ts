import { z } from "zod";
import type { NodeOutput } from "./types";

// Regression coverage for a Copilot finding on #505: with --inline-external-types,
// expanding MiddleOutput's own structure hits a cycle back to NodeOutput one
// level deeper than the schema's own recursion point, so that occurrence is
// printed already-qualified as `import("./types").NodeOutput` (the existing
// cycle-detection fallback in inlineExternalTypeReferences/promoteBareTypeReferences).
// The explicit-annotation self-reference rewrite must leave that qualified
// occurrence alone and only rewrite the schema's own bare recursion point
// (`child`) - rewriting the identifier after the dot would strand the
// `import("...").` prefix against a name the module doesn't export.
export const NodeSchema: z.ZodType<NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    child: NodeSchema.optional(),
    middle: z.object({ back: NodeSchema.optional() }).optional(),
  }),
);
