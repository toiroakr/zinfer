import { z } from "zod";
import type { Outer } from "./outer";

// Outer isn't visible here, so reaching Middle recurses through outer.ts
// (see nonexported-cycle/outer.ts) - which is where Middle's own
// non-exported, self-referential Hidden field is read from.
export const NonExportedCycleSchema: z.ZodType<Outer, Outer> = z.any();
