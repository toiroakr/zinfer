import * as z from "zod/mini";

export const OtherSchema = z.object({ x: z.string() });

// Regression test for findObjectCalls: it used to walk every z.object() call
// nested anywhere under a schema's initializer as if each one independently
// described top-level fields of that schema - including an object() call
// that is itself the *value* of another object()'s own field (a genuine
// sub-schema, not a sibling composition argument like extend()'s shape).
// That flattened an inner reference's fieldPath (here "bar", from
// `wrapper.bar: OtherSchema`) into the same bucket as an unrelated top-level
// field of the same name. When the two happen to print an identical raw
// shape (both `{ x: string }` here), text-based reference matching can no
// longer tell them apart by shape and picks the wrong occurrence - the
// unrelated top-level `bar` gets renamed to `OtherSchemaInput` while the
// genuine `wrapper.bar` reference is left as its expanded raw shape.
// Both outcomes are structurally valid types (so no test-suite assertion
// catches it), but the *reference resolution itself* is wrong - it renames
// the wrong field. The fix stops descending into an object() call's own
// shape once found, so a call nested inside another object()'s field value
// is never independently promoted to a top-level fieldPath collision. The
// tradeoff: a genuinely nested reference (`wrapper.bar` below) is no longer
// resolved to a named type either - it prints its expanded shape instead,
// same as the unrelated field beside it. That's the accepted, documented
// limitation; see README's Known limitations.
export const NestedObjectReferenceSchema = z.object({
  bar: z.object({ x: z.string() }),
  wrapper: z.object({
    bar: OtherSchema,
  }),
});
