import { z } from "zod";
import type { Holder } from "./holder";

// Holder isn't visible from schema.ts, so reaching Callback recurses
// through holder.ts's own declaration - where Callback *is* visible.
export const SuffixWrapSchema: z.ZodType<Holder, Holder> = z.any();
