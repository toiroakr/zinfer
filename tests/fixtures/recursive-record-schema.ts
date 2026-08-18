// Self-referencing schemas whose getter carries an explicit return type. The
// annotation lets TypeScript unfold one full copy of the schema before it hits
// the recursion, so these fixtures pin down that the copy is collapsed into a
// plain self-reference - and that every level keeps its `.describe()`.
import { z } from "zod";

export interface RecursiveRecordShape {
  name: string;
  children: Record<string, RecursiveRecordShape>;
}

/**
 * Self-reference under a required key.
 */
export const RecursiveRecordSchema = z.object({
  name: z.string().describe("The node name"),
  get children(): z.ZodType<Record<string, RecursiveRecordShape>> {
    return z.record(z.string(), RecursiveRecordSchema);
  },
});

export interface OptionalRecursiveRecordShape {
  name: string;
  children?: Record<string, OptionalRecursiveRecordShape>;
}

/**
 * Self-reference under an optional key, annotated.
 */
export const OptionalRecursiveRecordSchema = z.object({
  name: z.string().describe("The optional node name"),
  get children(): z.ZodOptional<z.ZodType<Record<string, OptionalRecursiveRecordShape>>> {
    return z.record(z.string(), OptionalRecursiveRecordSchema).optional();
  },
});

/**
 * Self-reference under an optional key, left for zinfer to reconstruct from the
 * getter's AST.
 */
export const InferredOptionalRecordSchema = z.object({
  name: z.string().describe("The inferred node name"),
  get children() {
    return z.record(z.string(), InferredOptionalRecordSchema).optional();
  },
});

export interface RecursiveArrayShape {
  name: string;
  children: RecursiveArrayShape[];
}

/**
 * Self-reference through an array rather than a record.
 */
export const RecursiveArraySchema = z.object({
  name: z.string().describe("The array node name"),
  get children(): z.ZodType<RecursiveArrayShape[]> {
    return z.array(RecursiveArraySchema);
  },
});

const LeafSchema = z.object({
  label: z.string().describe("The leaf label"),
});

/**
 * A non-exported schema behind an index signature is inlined, and its field
 * descriptions have to survive that inlining.
 */
export const LeafRecordSchema = z.object({
  leaves: z.record(z.string(), LeafSchema),
});
