import { z } from "zod";

const BaseSchema = z.object({
  id: z.string(),
});

const TimestampSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

const MetadataSchema = z.object({
  version: z.number(),
});

/**
 * Intersection using z.intersection
 */
export const EntitySchema = z.intersection(BaseSchema, TimestampSchema);

/**
 * Intersection using .merge
 */
export const MergedSchema = BaseSchema.merge(TimestampSchema);

/**
 * Intersection using .and
 */
export const AndSchema = BaseSchema.and(MetadataSchema);
