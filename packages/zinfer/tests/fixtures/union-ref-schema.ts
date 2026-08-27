import { z } from "zod";

/**
 * Individual member schemas for union
 */
export const DogSchema = z.object({
  kind: z.literal("dog"),
  name: z.string(),
  breed: z.string(),
});

export const CatSchema = z.object({
  kind: z.literal("cat"),
  name: z.string(),
  indoor: z.boolean(),
});

export const BirdSchema = z.object({
  kind: z.literal("bird"),
  name: z.string(),
  canFly: z.boolean(),
});

/**
 * Discriminated union using schema references
 */
export const PetSchema = z.discriminatedUnion("kind", [DogSchema, CatSchema, BirdSchema]);

/**
 * Regular union using schema references
 */
export const AnimalSchema = z.union([DogSchema, CatSchema]);
