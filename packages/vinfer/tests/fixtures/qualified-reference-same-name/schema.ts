import * as v from "valibot";
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
export const NodeSchema: v.GenericSchema<NodeOutput> = v.lazy(() =>
  v.object({
    value: v.string(),
    child: v.optional(NodeSchema),
    middle: v.optional(v.object({ back: v.optional(NodeSchema) })),
  }),
);
