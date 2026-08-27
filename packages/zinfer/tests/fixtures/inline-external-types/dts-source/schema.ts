import { z } from "zod";
import type { Holder } from "./holder";

// Holder isn't visible from schema.ts, so reaching Declared recurses
// through holder.ts's own declaration - where Declared *is* visible.
export const DtsSourceSchema: z.ZodType<Holder, Holder> = z.any();
