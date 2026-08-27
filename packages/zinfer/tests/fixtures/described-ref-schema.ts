import { z } from "zod";

// Recursive schema with an explicit type annotation, referenced by a union member
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const FunctionOperationSchema = z.object({
  kind: z.literal("function"),
  name: z.string(),
});

export const WorkflowOperationSchema = z.object({
  kind: z.literal("workflow"),
  args: JsonValueSchema.optional(),
});

// Union declaration wrapped in .describe() must keep named member references
export const OperationSchema = z
  .union([FunctionOperationSchema, WorkflowOperationSchema])
  .describe("Operation to execute when triggered");

// Field-level .describe() on a schema reference must keep the named reference
export const ExecutorSchema = z.object({
  name: z.string(),
  operation: OperationSchema.describe("Operation to execute when triggered"),
  fallback: WorkflowOperationSchema.optional().describe("Fallback operation"),
});
