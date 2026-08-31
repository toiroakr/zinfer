import { z } from "zod";
import type { $NodeOutput } from "./types";

// Regression coverage for a `\b`-boundary pitfall a Copilot review caught on
// #505: `\b` is defined in terms of `\w` ([A-Za-z0-9_]), which excludes `$`
// (legal at the start of a JS/TS identifier), so a cross-file recursion
// point named `$NodeOutput` would never match under a naive `\b` pattern
// and would be left as an unresolved bare identifier.
export const NodeSchema: z.ZodType<$NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.record(z.string(), NodeSchema).optional(),
  }),
);
