import * as z from "zod/mini";

// Regression test for extractFirstTypeParameter: the first type parameter is
// itself a function type, so its own `=>` must not be mistaken for the `<...>`
// annotation's closing bracket (which would truncate the extracted type at the
// arrow and leave `injectExplicitType` with an invalid `type __TempExplicit`).
export const CallbackSchema: z.ZodMiniType<(value: string) => number, unknown> = z.custom(
  (val) => typeof val === "function",
);
