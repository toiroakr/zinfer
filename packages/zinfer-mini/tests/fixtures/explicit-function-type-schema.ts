import * as z from "zod/mini";

// Regression test for extractFirstTypeParameter: the first type parameter is
// itself a function type, so its own `=>` must not be mistaken for the `<...>`
// annotation's closing bracket (which would truncate the extracted type at the
// arrow and leave `injectExplicitType` with an invalid `type __TempExplicit`).
export const CallbackSchema: z.ZodMiniType<(value: string) => number, unknown> = z.custom(
  (val) => typeof val === "function",
);

// Regression test for hasTopLevelUnion: CallbackSchema's raw type is an
// unparenthesized arrow function type. Wrapping it in `[]` without first
// checking whether it needs parens produces `(value: string) => number[]`,
// which TypeScript parses as "a function returning number[]" rather than the
// intended "an array of functions" - hasTopLevelUnion must therefore treat a
// top-level `=>` as itself requiring parens, the same as a top-level `|`/`&`.
export const CallbackListSchema = z.array(CallbackSchema);
