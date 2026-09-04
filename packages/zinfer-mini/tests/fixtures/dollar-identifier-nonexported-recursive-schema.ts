import * as z from "zod/mini";

// Regression coverage for a `\b`-boundary pitfall a CodeRabbit/Copilot review
// caught on #529: `\b` is defined in terms of `\w` ([A-Za-z0-9_]), which
// excludes `$` (legal at the start of a JS/TS identifier). A promoted
// local's own marker text needs a `$`-aware rewrite - otherwise
// "$NodeSchemaInput"/"$NodeSchemaOutput" leaks through unresolved instead of
// being rewritten to the promoted local's generated name.
type NodeOutput = {
  value: string;
  children?: Record<string, NodeOutput>;
};

const $NodeSchema: z.ZodMiniType<NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.optional(z.record(z.string(), $NodeSchema)),
  }),
);

export const ContainerSchema = z.object({
  name: z.string(),
  root: $NodeSchema,
});
