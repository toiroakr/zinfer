import { z } from "zod";

/**
 * Union type schema - literal union
 */
export const StatusSchema = z.union([
  z.literal("active"),
  z.literal("inactive"),
  z.literal("pending"),
]);

/**
 * Discriminated union schema
 */
export const ResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("success"), data: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

/**
 * Simple union of different types
 */
export const StringOrNumberSchema = z.union([z.string(), z.number()]);
