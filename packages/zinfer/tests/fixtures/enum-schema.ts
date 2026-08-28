import { z } from "zod";

/**
 * Zod enum
 */
export const DirectionSchema = z.enum(["north", "south", "east", "west"]);

/**
 * Native enum (TypeScript enum)
 */
enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

export const ColorSchema = z.nativeEnum(Color);

/**
 * Numeric native enum
 */
enum Priority {
  Low = 0,
  Medium = 1,
  High = 2,
}

export const PrioritySchema = z.nativeEnum(Priority);
