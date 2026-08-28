import { z } from "zod";

// Brand applied to the whole tuple/array, not to an element - the brand's
// symbol key must survive __Normalize's array/tuple handling instead of being
// stripped (arrays) or expanded into Array.prototype's members (tuples).
export const CoordSchema = z.tuple([z.number(), z.number()]).brand<"Coord">();

export const TagListSchema = z.array(z.string()).brand<"TagList">();

export const FrozenPairSchema = z.tuple([z.string(), z.number()]).readonly().brand<"FrozenPair">();

export const HeadedListSchema = z.tuple([z.string()], z.number()).brand<"HeadedList">();

// A branded tuple nested inside an object, alongside an unbranded one.
export const ShapeSchema = z.object({
  origin: z.tuple([z.number(), z.number()]).brand<"Coord">(),
  size: z.tuple([z.number(), z.number()]),
});
