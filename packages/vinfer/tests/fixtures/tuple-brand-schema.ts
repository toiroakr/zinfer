import * as v from "valibot";

// Brand applied to the whole tuple/array, not to an element - the brand's
// symbol key must survive __Normalize's array/tuple handling instead of being
// stripped (arrays) or expanded into Array.prototype's members (tuples).
export const CoordSchema = v.pipe(v.tuple([v.number(), v.number()]), v.brand("Coord"));

export const TagListSchema = v.pipe(v.array(v.string()), v.brand("TagList"));

export const FrozenPairSchema = v.pipe(
  v.tuple([v.string(), v.number()]),
  v.readonly(),
  v.brand("FrozenPair"),
);

export const HeadedListSchema = v.pipe(
  v.tupleWithRest([v.string()], v.number()),
  v.brand("HeadedList"),
);

// A branded tuple nested inside an object, alongside an unbranded one.
export const ShapeSchema = v.object({
  origin: v.pipe(v.tuple([v.number(), v.number()]), v.brand("Coord")),
  size: v.tuple([v.number(), v.number()]),
});
