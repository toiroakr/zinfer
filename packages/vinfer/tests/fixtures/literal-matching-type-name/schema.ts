import * as v from "valibot";
import type { NodeOutput } from "./types";

// Regression coverage for a CodeRabbit finding on #505: the cross-file
// recursion-point rewrite matched bare occurrences of the type name with
// a naive word-boundary pattern, which also matched a string literal that
// happens to spell the same characters as the type name (e.g. a
// discriminant tag). "NodeOutput" here is both the type's own name and a
// literal value one of its fields actually accepts at runtime - only the
// bare type reference (the recursion point) should be rewritten, not the
// literal.
export const NodeSchema: v.GenericSchema<NodeOutput> = v.lazy(() =>
  v.object({
    kind: v.literal("NodeOutput"),
    child: v.optional(NodeSchema),
  }),
);
