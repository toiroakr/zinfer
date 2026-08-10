import { z } from "zod";

// Same degenerate case as class-explicit-type-schema.ts, but for an
// `interface` declaration - this applies to `interface`/`type` too whenever
// the resolved type is exactly the explicit identifier.
export interface LocalInterface {
  value: string;
}

export const BarSchema: z.ZodType<LocalInterface, LocalInterface> = z.any();
