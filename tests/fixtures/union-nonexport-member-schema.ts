import { z } from "zod";

// Non-exported member schema (should be inlined in union)
const SuccessSchema = z.object({
  status: z.literal("success"),
  data: z.string(),
});

// Non-exported member schema
const ErrorSchema = z.object({
  status: z.literal("error"),
  message: z.string(),
});

// Exported union referencing non-exported members
export const ResponseSchema = z.discriminatedUnion("status", [SuccessSchema, ErrorSchema]);
