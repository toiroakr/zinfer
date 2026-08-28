import { z } from "zod";
import type { Holder } from "./holder";

// Holder is imported directly here, so `typeof Kind` reaches through
// TypeScript's own top-level synthesis (typeof import("./kind").Kind),
// not the bare-reference promotion path wrapper.ts exercises.
export const DirectTypeofQuerySchema: z.ZodType<Holder, Holder> = z.any();
