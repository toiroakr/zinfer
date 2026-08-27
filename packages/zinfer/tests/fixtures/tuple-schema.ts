import { z } from "zod";

// Tuple types should be preserved, not expanded into arrays
export const PointSchema = z.object({
  coordinates: z.tuple([z.number(), z.number()]),
  label: z.string(),
});

export const MixedTupleSchema = z.object({
  entry: z.tuple([z.string(), z.number(), z.boolean()]),
});
