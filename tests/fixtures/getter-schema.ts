import { z } from "zod";

// Getter-based recursive schema (self-referencing)
export const TreeNodeSchema = z.object({
  value: z.string(),
  get children() {
    return z.array(TreeNodeSchema).optional();
  },
});

// Getter-based recursive schema with record
export const NestedRecordSchema = z.object({
  name: z.string(),
  get items() {
    return z.record(z.string(), NestedRecordSchema);
  },
});

// Schema with z.custom<Function>
const functionSchema = z.custom<Function>((val) => typeof val === "function");

export const CallbackSchema = z.object({
  name: z.string(),
  callback: functionSchema,
  optionalCallback: functionSchema.optional(),
});
