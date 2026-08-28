import { z } from "zod";
import type { Holder } from "./holder";

// Holder is visible here (imported directly), so the printer expands its
// own structure in place - printing the Kind field, which isn't visible
// from here, as import("./kind").Kind.
export const ComputedEnumSchema: z.ZodType<Holder, Holder> = z.any();
