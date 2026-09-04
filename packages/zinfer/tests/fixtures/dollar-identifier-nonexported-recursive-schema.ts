import { z } from "zod";

// Regression coverage for a `\b`-boundary pitfall a CodeRabbit/Copilot review
// caught on #529: `\b` is defined in terms of `\w` ([A-Za-z0-9_]), which
// excludes `$` (legal at the start of a JS/TS identifier), so a promoted
// local's own marker text ("$NodeSchemaInput"/"$NodeSchemaOutput") would
// never match under a naive `\b`-bounded pattern and would leak through as
// an unresolved bare identifier instead of being rewritten to the promoted
// local's generated name.
type NodeOutput = {
  value: string;
  children?: Record<string, NodeOutput>;
};

const $NodeSchema: z.ZodType<NodeOutput> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.record(z.string(), $NodeSchema).optional(),
  }),
);

export const ContainerSchema = z.object({
  name: z.string(),
  root: $NodeSchema,
});
